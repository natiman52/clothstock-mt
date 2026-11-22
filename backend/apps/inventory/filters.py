import logging
from django.db import models
from rest_framework import filters
from rest_framework.exceptions import NotFound
from .models import Store

logger = logging.getLogger(__name__)


def resolve_store_from_request(request):
    """
    Extract and validate the active store from the request.
    Sources checked:
      1. HTTP header 'X-Store-ID' (case-insensitive via Django META 'HTTP_X_STORE_ID')
      2. Query parameter 'store_id'
      3. Query parameter 'store'

    Returns:
      - None: when absent, empty, or 'all' (requests all stores / global scope)
      - 'storage': when specifically requesting unassigned central warehouse storage ('storage', 'warehouse')
      - Store instance: when matching store is found by integer ID or unique code

    Raises:
      - NotFound: 404 error if an explicit store identifier is provided but does not exist in the database
    """
    # `query_params` is a DRF attribute; fall back to `GET` for plain Django requests
    _qp = getattr(request, 'query_params', None) or request.GET
    store_val = (
        request.headers.get('X-Store-ID') or
        request.META.get('HTTP_X_STORE_ID') or
        _qp.get('store_id') or
        _qp.get('store')
    )

    if not store_val:
        return None

    cleaned = str(store_val).strip().lower()
    if cleaned in ('all', '', 'none', 'null', 'false'):
        return None

    if cleaned in ('storage', 'warehouse', 'central', 'unassigned'):
        return 'storage'

    # Try numeric primary key
    if str(store_val).isdigit():
        store = Store.objects.filter(pk=int(store_val)).first()
    else:
        store = Store.objects.filter(code__iexact=str(store_val).strip()).first()

    if not store:
        raise NotFound(detail=f"Store location '{store_val}' was not found in the system.")

    return store


class StoreScopeFilterBackend(filters.BaseFilterBackend):
    """
    Reusable global filter backend that automatically filters querysets by the active
    store specified in X-Store-ID header or ?store_id= / ?store= query parameter.

    Consistent Scoping Rules:
      1. When a Store is specified:
         - Models with a direct 'store' field (StoreInventory, StockLedgerEntry, Sale):
           filters `store = resolved_store`
         - Models with nested variants/inventory (Product):
           filters to products with available stock in that store (`variants__store_inventories__store=resolved_store`)
         - Models with variant inventories (Variant):
           filters to variants available in that store (`store_inventories__store=resolved_store`)
         - SaleItem:
           filters `sale__store = resolved_store`

      2. When 'storage' (Warehouse / Central Storage) is specified:
         - Models with a direct 'store' field:
           filters `store__isnull=True` or `store__is_warehouse=True`
         - Product / Variant:
           filters to items with quantity on hand in central storage (`store__isnull=True`)

      3. When absent or 'all':
         - If the view defines `exclude_storage_by_default = True`:
           excludes unassigned storage (`store__isnull=False, store__is_warehouse=False`) so
           warehouse products stay separated from regular store inventory.
         - Otherwise returns the standard global queryset.
    """

    def filter_queryset(self, request, queryset, view):
        resolved = resolve_store_from_request(request)
        model = queryset.model

        # ── 1. Specific Storage / Central Warehouse Scope ─────────────────────
        if resolved == 'storage':
            if hasattr(model, 'store'):
                return queryset.filter(models.Q(store__isnull=True) | models.Q(store__is_warehouse=True))
            elif hasattr(model, 'variants'):  # Product
                return queryset.filter(
                    models.Q(variants__store_inventories__store__isnull=True) |
                    models.Q(variants__store_inventories__store__is_warehouse=True),
                    variants__store_inventories__quantity_on_hand__gt=0
                ).distinct()
            elif hasattr(model, 'store_inventories'):  # Variant
                return queryset.filter(
                    models.Q(store_inventories__store__isnull=True) |
                    models.Q(store_inventories__store__is_warehouse=True),
                    store_inventories__quantity_on_hand__gt=0
                ).distinct()
            return queryset

        # ── 2. Specific Store Scope ───────────────────────────────────────────
        if isinstance(resolved, Store):
            if hasattr(model, 'store'):
                return queryset.filter(store=resolved)
            elif hasattr(model, 'variants'):  # Product: styles available in this store
                return queryset.filter(
                    variants__store_inventories__store=resolved,
                    variants__store_inventories__quantity_on_hand__gt=0
                ).distinct()
            elif hasattr(model, 'store_inventories'):  # Variant: variants available in this store
                return queryset.filter(
                    store_inventories__store=resolved,
                    store_inventories__quantity_on_hand__gt=0
                ).distinct()
            elif hasattr(model, 'sale'):  # SaleItem
                return queryset.filter(sale__store=resolved)
            return queryset

        # ── 3. Absent / All Stores Scope ──────────────────────────────────────
        # By default, exclude unassigned warehouse storage from store inventory lists
        # unless specifically requested via ?store_id=storage
        if getattr(view, 'exclude_storage_by_default', False) and hasattr(model, 'store'):
            return queryset.filter(store__isnull=False, store__is_warehouse=False)

        return queryset
