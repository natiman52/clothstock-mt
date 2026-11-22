import json
from rest_framework import viewsets, permissions, filters, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction, models
from django.db.models import Sum, Count, F, Q
from django.utils import timezone
from datetime import timedelta

from .models import (
    Category,
    Store,
    Product,
    Variant,
    StoreInventory,
    ServerEvent,
    SyncEvent,
    StockLedgerEntry,
    Sale,
    SaleItem,
)
from .serializers import (
    CategorySerializer,
    StoreSerializer,
    ProductSerializer,
    VariantSerializer,
    StoreInventorySerializer,
    TransferInventorySerializer,
    AdjustInventorySerializer,
    ServerEventSerializer,
    SyncEventSerializer,
    StockLedgerEntrySerializer,
    SaleSerializer,
    SaleWriteSerializer,
    SaleItemSerializer,
)
from .sync_service import (
    get_server_events_for_store,
    process_sync_batch,
    resolve_store,
    resolve_variant,
)
from .signals import log_server_event
from .filters import StoreScopeFilterBackend, resolve_store_from_request


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.prefetch_related('products').all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'code', 'created_at']


class StoreViewSet(viewsets.ModelViewSet):
    queryset = Store.objects.all()
    serializer_class = StoreSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'code', 'created_at']


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related('category').prefetch_related('variants').all()
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [StoreScopeFilterBackend, DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields = ['name', 'style_code', 'category__name', 'category__code', 'description']
    ordering_fields = ['name', 'style_code', 'created_at']


class VariantViewSet(viewsets.ModelViewSet):
    queryset = Variant.objects.select_related('product').all()
    serializer_class = VariantSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [StoreScopeFilterBackend, DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['product', 'size', 'color', 'is_active']
    search_fields = ['sku', 'barcode', 'product__name', 'product__style_code']
    ordering_fields = ['sku', 'price', 'created_at']


class StoreInventoryViewSet(viewsets.ModelViewSet):
    """
    StoreInventory tracking. By default in multi-store mode, filters out unassigned
    central warehouse inventory so retail stores only see physical branch stock.
    Pass ?store_id=storage (or X-Store-ID: storage) to explicitly query warehouse storage.
    """
    queryset = StoreInventory.objects.select_related('store', 'variant', 'variant__product').all()
    serializer_class = StoreInventorySerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [StoreScopeFilterBackend, DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['store', 'variant']
    search_fields = ['store__name', 'store__code', 'variant__sku', 'variant__barcode', 'variant__product__name']
    ordering_fields = ['quantity_on_hand', 'updated_at']
    exclude_storage_by_default = False

    @action(detail=False, methods=['get'], url_path='storage')
    def storage(self, request):
        """
        GET /api/inventory/storage/
        Exclusively returns Central Warehouse Storage inventory (where store is null).
        """
        storage_qs = StoreInventory.objects.filter(
            Q(store__isnull=True) | Q(store__is_warehouse=True)
        ).select_related('store', 'variant', 'variant__product')
        page = self.paginate_queryset(storage_qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(storage_qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='transfer')
    def transfer(self, request):
        """
        POST /api/inventory/transfer/
        Transfers stock between Central Storage and a store, or between two stores.
        Logs two immutable StockLedgerEntry rows (decrement at origin, increment at destination)
        and broadcasts a ServerEvent.
        """
        serializer = TransferInventorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        variant = resolve_variant({'variant': data['variant_id']})
        if not variant:
            return Response(
                {"error": f"Variant '{data['variant_id']}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        from_store_identifier = data.get('from_store')
        to_store_identifier = data.get('to_store')
        qty = data['quantity']
        notes = data.get('notes', '')

        # Resolve source store (None represents Central Warehouse Storage)
        from_store = None
        if from_store_identifier and str(from_store_identifier).lower() not in ('storage', 'warehouse', 'null', 'none'):
            from_store = resolve_store(from_store_identifier)
            if not from_store:
                return Response(
                    {"error": f"Source store '{from_store_identifier}' not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # Resolve destination store (None represents Central Warehouse Storage)
        to_store = None
        if to_store_identifier and str(to_store_identifier).lower() not in ('storage', 'warehouse', 'null', 'none'):
            to_store = resolve_store(to_store_identifier)
            if not to_store:
                return Response(
                    {"error": f"Destination store '{to_store_identifier}' not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        if from_store == to_store:
            return Response(
                {"error": "Source and destination store cannot be identical."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # 1. Deduct from source inventory
            from_inv, _ = StoreInventory.objects.select_for_update().get_or_create(
                store=from_store,
                variant=variant,
                defaults={'quantity_on_hand': 0}
            )
            from_inv.quantity_on_hand -= qty
            from_inv._skip_server_event = True
            from_inv.save(update_fields=['quantity_on_hand', 'updated_at'])

            # 2. Add to destination inventory
            to_inv, _ = StoreInventory.objects.select_for_update().get_or_create(
                store=to_store,
                variant=variant,
                defaults={'quantity_on_hand': 0}
            )
            to_inv.quantity_on_hand += qty
            to_inv._skip_server_event = True
            to_inv.save(update_fields=['quantity_on_hand', 'updated_at'])

            # 3. Create outbound StockLedgerEntry
            from_label = from_store.name if from_store else "Central Storage"
            to_label = to_store.name if to_store else "Central Storage"

            ledger_out = StockLedgerEntry.objects.create(
                store=from_store,
                variant=variant,
                delta=-qty,
                resulting_balance=from_inv.quantity_on_hand,
                unit_price=variant.price,
                unit_cost=variant.cost,
                reason=StockLedgerEntry.Reason.WAREHOUSE_TRANSFER,
                sync_source=StockLedgerEntry.SyncSource.WEB_ADMIN,
                notes=f"Transfer OUT to {to_label}. {notes}".strip(),
            )

            # 4. Create inbound StockLedgerEntry
            ledger_in = StockLedgerEntry.objects.create(
                store=to_store,
                variant=variant,
                delta=qty,
                resulting_balance=to_inv.quantity_on_hand,
                unit_price=variant.price,
                unit_cost=variant.cost,
                reason=StockLedgerEntry.Reason.WAREHOUSE_TRANSFER,
                sync_source=StockLedgerEntry.SyncSource.WEB_ADMIN,
                notes=f"Transfer IN from {from_label}. {notes}".strip(),
            )

            # 5. Broadcast ServerEvent so retail edge terminals pull the transfer
            event_payload = {
                'variant_id': str(variant.id),
                'variant_sku': variant.sku,
                'from_store_id': from_store.id if from_store else None,
                'from_store_code': from_store.code if from_store else 'STORAGE',
                'to_store_id': to_store.id if to_store else None,
                'to_store_code': to_store.code if to_store else 'STORAGE',
                'quantity': qty,
                'from_balance': from_inv.quantity_on_hand,
                'to_balance': to_inv.quantity_on_hand,
            }
            transfer_event = log_server_event('STOCK_TRANSFER', store=to_store, payload=event_payload)
            ledger_in.server_event = transfer_event
            ledger_in.save(update_fields=['server_event'])

        return Response({
            "status": "success",
            "message": f"Successfully transferred {qty} units of {variant.sku} from {from_label} to {to_label}.",
            "transfer": {
                "variant_id": str(variant.id),
                "variant_sku": variant.sku,
                "quantity": qty,
                "from_store": from_label,
                "from_balance": from_inv.quantity_on_hand,
                "to_store": to_label,
                "to_balance": to_inv.quantity_on_hand,
                "server_event_seq": transfer_event.seq_id if transfer_event else None,
            }
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='adjust')
    def adjust(self, request):
        """
        POST /api/inventory/adjust/
        Adds, subtracts, or sets absolute inventory for a (store, variant).
        Records an immutable StockLedgerEntry and creates a ServerEvent.
        """
        serializer = AdjustInventorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        variant = resolve_variant({'variant': data['variant_id']})
        if not variant:
            return Response(
                {"error": f"Variant '{data['variant_id']}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        store_val = data.get('store')
        target_store = None
        if store_val and str(store_val).lower() not in ('storage', 'warehouse', 'null', 'none', ''):
            target_store = resolve_store(store_val)
            if not target_store:
                return Response(
                    {"error": f"Store '{store_val}' not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        adj_type = data['type']
        qty = data['quantity']
        reason = data['reason']
        notes = data.get('notes', '')

        with transaction.atomic():
            inv, _ = StoreInventory.objects.select_for_update().get_or_create(
                store=target_store,
                variant=variant,
                defaults={'quantity_on_hand': 0}
            )

            previous_balance = inv.quantity_on_hand
            if adj_type == 'add':
                delta = qty
                new_balance = previous_balance + delta
            elif adj_type == 'subtract':
                delta = -qty
                new_balance = previous_balance + delta
            elif adj_type == 'set':
                new_balance = qty
                delta = new_balance - previous_balance
            else:
                delta = qty
                new_balance = previous_balance + delta

            inv.quantity_on_hand = new_balance
            inv._skip_server_event = True
            inv.save(update_fields=['quantity_on_hand', 'updated_at'])

            store_label = target_store.name if target_store else "Central Storage (Warehouse)"
            ledger = StockLedgerEntry.objects.create(
                store=target_store,
                variant=variant,
                delta=delta,
                resulting_balance=new_balance,
                unit_price=variant.price,
                unit_cost=variant.cost,
                reason=reason,
                sync_source=StockLedgerEntry.SyncSource.WEB_ADMIN,
                notes=f"Admin {adj_type.upper()}: {notes}".strip() if notes else f"Admin {adj_type.upper()} ({delta:+d})",
            )

            event_payload = {
                'store_id': target_store.id if target_store else None,
                'store_code': target_store.code if target_store else 'STORAGE',
                'variant_id': str(variant.id),
                'variant_sku': variant.sku,
                'previous_balance': previous_balance,
                'delta': delta,
                'resulting_balance': new_balance,
                'reason': reason,
                'ledger_id': ledger.id,
            }
            event = log_server_event(f"LEDGER_{reason}", store=target_store, payload=event_payload)
            ledger.server_event = event
            ledger.save(update_fields=['server_event'])

        return Response({
            "status": "success",
            "message": f"Inventory updated for {variant.sku} at {store_label}: {previous_balance} -> {new_balance} ({delta:+d}).",
            "inventory": {
                "variant_id": str(variant.id),
                "variant_sku": variant.sku,
                "store_id": target_store.id if target_store else None,
                "store_name": store_label,
                "previous_balance": previous_balance,
                "delta": delta,
                "resulting_balance": new_balance,
                "ledger_id": ledger.id,
            }
        }, status=status.HTTP_200_OK)



class ServerEventViewSet(viewsets.ModelViewSet):
    """
    Replication stream endpoint for offline stores to pull new events
    since their last synchronized seq_id.
    """
    queryset = ServerEvent.objects.select_related('store').all()
    serializer_class = ServerEventSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['store', 'event_type']
    ordering_fields = ['seq_id', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        since_seq = self.request.query_params.get('since_seq')
        if since_seq is not None:
            try:
                qs = qs.filter(seq_id__gt=int(since_seq))
            except ValueError:
                pass
        return qs


class SyncEventViewSet(viewsets.ModelViewSet):
    """
    Ingestion endpoint for stores to push local sales, returns, and adjustments.
    Idempotent on event_id.
    """
    queryset = SyncEvent.objects.select_related('store').all()
    serializer_class = SyncEventSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['store', 'status', 'event_type']
    search_fields = ['event_type', 'store__name', 'store__code']
    ordering_fields = ['created_at', 'processed_at']


class StockLedgerEntryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Audit log stream for every stock change across online and offline stores.
    Automatically scoped by StoreScopeFilterBackend (X-Store-ID header / ?store_id=).
    """
    queryset = StockLedgerEntry.objects.select_related('store', 'variant', 'variant__product').all()
    serializer_class = StockLedgerEntrySerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [StoreScopeFilterBackend, DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['store', 'reason', 'sync_source', 'variant']
    search_fields = ['store__name', 'store__code', 'variant__sku', 'variant__barcode', 'notes']
    ordering_fields = ['timestamp', 'resulting_balance', 'delta']


# ─────────────────────────────────────────────────────────────────────────────
# Dedicated Synchronization Endpoints
# ─────────────────────────────────────────────────────────────────────────────

class SyncPullView(APIView):
    """
    Pull: GET /api/sync/pull/
    Returns ServerEvent rows with seq_id > after_seq matching store_id or store IS NULL,
    ordered by seq_id and paginated up to 500 rows.
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get(self, request, *args, **kwargs):
        try:
            after_seq = int(request.query_params.get('after_seq', 0))
        except (ValueError, TypeError):
            after_seq = 0

        store_id = request.query_params.get('store_id') or request.query_params.get('store')

        try:
            limit = int(request.query_params.get('limit', 500))
        except (ValueError, TypeError):
            limit = 500

        events = get_server_events_for_store(store_id, after_seq=after_seq, limit=limit)
        serialized_events = ServerEventSerializer(events, many=True).data

        latest_seq = events[-1].seq_id if events else after_seq

        return Response({
            "status": "success",
            "after_seq": after_seq,
            "latest_seq": latest_seq,
            "count": len(events),
            "server_events": serialized_events,
        }, status=status.HTTP_200_OK)


class SyncPushView(APIView):
    """
    Push: POST /api/sync/push/
    Accepts SyncEvent batches, skips already-processed event_ids idempotently,
    applies variant inventory deltas (allowing negative balances to be flagged
    rather than blocking sales), and writes StockLedgerEntry rows.
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def post(self, request, *args, **kwargs):
        data = request.data
        default_store = None

        if isinstance(data, list):
            events = data
        elif isinstance(data, dict):
            events = data.get('events', [data])
            default_store = data.get('store_id') or data.get('store')
        else:
            return Response(
                {"error": "Invalid payload format. Expected list of events or object with 'events'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = process_sync_batch(
            events_data=events,
            default_store=default_store,
            sync_source=StockLedgerEntry.SyncSource.AUTO_SYNC,
        )

        return Response({
            "status": "success",
            "acked_event_ids": result["acked_event_ids"],
            "processed_count": result["processed_count"],
            "skipped_count": result["skipped_count"],
            "errors": result["errors"],
        }, status=status.HTTP_200_OK)


class SyncBundleView(APIView):
    """
    Manual JSON Bundle: POST /api/sync/bundle/
    Accepts an exported JSON file (via multipart/form-data) or JSON payload containing
    the store's profile (store_id, last_applied_seq) and pending SyncEvents.
    Processes events idempotently with sync_source=MANUAL_FILE, and returns response
    JSON with acked event_ids plus new ServerEvents (seq_id ordered) for the store
    to import back offline.
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, *args, **kwargs):
        # 1. Parse JSON from file upload or JSON request body
        bundle_data = None
        uploaded_file = request.FILES.get('file') or request.FILES.get('bundle')

        if uploaded_file:
            try:
                raw_content = uploaded_file.read().decode('utf-8')
                bundle_data = json.loads(raw_content)
            except Exception as e:
                return Response(
                    {"error": f"Failed to parse uploaded JSON file: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif isinstance(request.data, dict):
            bundle_data = request.data
        else:
            return Response(
                {"error": "No JSON bundle provided in request body or file upload."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        store_identifier = bundle_data.get('store_id') or bundle_data.get('store')
        store = resolve_store(store_identifier)
        if not store:
            return Response(
                {"error": f"Store '{store_identifier}' not found in system."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            last_applied_seq = int(bundle_data.get('last_applied_seq', 0))
        except (ValueError, TypeError):
            last_applied_seq = 0

        pending_events = bundle_data.get('events') or bundle_data.get('sync_events') or []

        # 2. Process pending SyncEvents idempotently
        result = process_sync_batch(
            events_data=pending_events,
            default_store=store,
            sync_source=StockLedgerEntry.SyncSource.MANUAL_FILE,
        )

        # 3. Fetch new ServerEvents (seq_id > last_applied_seq) matching store or store IS NULL
        new_events = get_server_events_for_store(
            store_identifier=store,
            after_seq=last_applied_seq,
            limit=500,
        )
        serialized_new_events = ServerEventSerializer(new_events, many=True).data
        latest_seq = new_events[-1].seq_id if new_events else last_applied_seq

        return Response({
            "status": "success",
            "store_id": store.id,
            "store_code": store.code,
            "acked_event_ids": result["acked_event_ids"],
            "processed_count": result["processed_count"],
            "skipped_count": result["skipped_count"],
            "errors": result["errors"],
            "last_applied_seq": last_applied_seq,
            "latest_seq": latest_seq,
            "server_events": serialized_new_events,
            "server_events_count": len(new_events),
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# Sale & SaleItem ViewSets
# ─────────────────────────────────────────────────────────────────────────────

class SaleViewSet(viewsets.ModelViewSet):
    """
    /api/sales/

    List / retrieve / create / update / destroy Sales.

    Filtering:
      ?store=<id>          — filter by store
      ?status=COMPLETED    — filter by status (COMPLETED | VOIDED | RETURNED)
      ?payment_method=CASH — filter by payment method
      ?sold_at_after=<iso> — sales on or after this datetime
      ?sold_at_before=<iso>— sales on or before this datetime

    Search:
      ?search=<term>       — matches receipt_number, cashier_name, customer_name, store code/name

    Ordering:
      ?ordering=-sold_at   — default; also supports total_amount, created_at

    Uses SaleWriteSerializer for create/update (nested items accepted),
    and SaleSerializer for all read operations.
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [StoreScopeFilterBackend, DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['store', 'status', 'payment_method', 'sync_event']
    search_fields      = ['receipt_number', 'cashier_name', 'customer_name',
                          'store__name', 'store__code']
    ordering_fields    = ['sold_at', 'total_amount', 'created_at']
    ordering           = ['-sold_at']

    def get_queryset(self):
        qs = Sale.objects.select_related(
            'store', 'sync_event'
        ).prefetch_related(
            'items', 'items__variant', 'items__variant__product'
        ).all()

        sold_after  = self.request.query_params.get('sold_at_after')
        sold_before = self.request.query_params.get('sold_at_before')
        if sold_after:
            qs = qs.filter(sold_at__gte=sold_after)
        if sold_before:
            qs = qs.filter(sold_at__lte=sold_before)
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return SaleWriteSerializer
        return SaleSerializer


class SaleItemViewSet(viewsets.ModelViewSet):
    """
    /api/sale-items/

    Manage individual line items within a Sale.
    Typically used to inspect or correct individual lines; bulk creation
    goes through POST /api/sales/ with nested items.

    Filtering:
      ?sale=<uuid>     — all items for a given Sale
      ?variant=<uuid>  — all sales of a given Variant
    """
    queryset = SaleItem.objects.select_related(
        'sale', 'sale__store',
        'variant', 'variant__product',
        'ledger_entry',
    ).all()
    serializer_class   = SaleItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['sale', 'variant']
    search_fields      = ['variant__sku', 'variant__barcode', 'variant__product__name',
                          'sale__receipt_number']
    ordering_fields    = ['id', 'quantity', 'unit_price', 'line_total']


# ─────────────────────────────────────────────────────────────────────────────
# Dedicated Analytics KPI Summary Endpoint
# ─────────────────────────────────────────────────────────────────────────────

class AnalyticsSummaryView(APIView):
    """
    GET /api/analytics/summary/
    Returns store-scoped live business KPI analytics computed directly
    from immutable StockLedgerEntry audit records:
      - Total Revenue & Units Sold (from reason=SALE with snapshotted unit_price)
      - Returns & Refund Impact (from reason=RETURN)
      - Net Sales, COGS, Gross Profit, and Margin %
      - Inbound Restocks vs Outbound Shrinkage (reason=STOCK_ADJUSTMENT)
      - Stocktake Audits & Reconciliation Variance (reason=STOCKTAKE_RECONCILIATION)
      - Warehouse Transfers (reason=WAREHOUSE_TRANSFER)
      - Action Distribution Breakdown (all action counts, volume, % share)
      - Top Performing Styles & Variants (from SALE ledger entries)
      - Daily Action Activity Timeline
      - Inventory Valuation & Current Stock Health
      - Multi-Store Comparison & Edge Sync Telemetry
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get(self, request, *args, **kwargs):
        resolved_store = resolve_store_from_request(request)

        # 1. Base querysets scoped to the store
        inventory_qs = StoreInventory.objects.all()
        ledger_qs = StockLedgerEntry.objects.select_related('store', 'variant', 'variant__product').all()

        if resolved_store == 'storage':
            inventory_qs = inventory_qs.filter(Q(store__isnull=True) | Q(store__is_warehouse=True))
            ledger_qs = ledger_qs.filter(Q(store__isnull=True) | Q(store__is_warehouse=True))
            scope_name = "Central Warehouse (Storage)"
            scope_code = "STORAGE"
            is_storage = True
        elif isinstance(resolved_store, Store):
            inventory_qs = inventory_qs.filter(store=resolved_store)
            ledger_qs = ledger_qs.filter(store=resolved_store)
            scope_name = resolved_store.name
            scope_code = resolved_store.code
            is_storage = bool(resolved_store.is_warehouse)
        else:
            scope_name = "All Store Nodes"
            scope_code = "ALL"
            is_storage = False

        # 2. Date Range Filtering
        range_param = (
            request.query_params.get('range') or
            request.query_params.get('date_range') or
            '7d'
        ).lower()

        now = timezone.now()
        start_time = None
        if range_param == '7d':
            start_time = now - timedelta(days=7)
        elif range_param in ('30d', 'month'):
            start_time = now - timedelta(days=30)
        elif range_param == 'yesterday':
            start_time = now - timedelta(days=1)
        elif range_param == 'mtd':
            start_time = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif range_param == 'all':
            start_time = None

        if start_time:
            filtered_ledger = ledger_qs.filter(timestamp__gte=start_time)
        else:
            filtered_ledger = ledger_qs

        # 3. Comprehensive Analytics from StockLedgerEntry
        # Fetch entries into memory for fast multi-angle aggregations
        entries = list(filtered_ledger[:2500])

        units_sold = 0
        gross_revenue = 0.0
        cogs = 0.0
        sales_count = 0

        units_returned = 0
        refunds_value = 0.0
        returns_count = 0

        units_restocked = 0
        restocks_count = 0

        units_deducted = 0
        deductions_count = 0

        stocktake_variances = 0
        stocktake_count = 0

        transfers_units = 0
        transfers_count = 0

        # Variant sales accumulator: {variant_id: {'sku': ..., 'product_name': ..., 'units': ..., 'rev': ...}}
        variant_sales_map = {}

        # Daily timeline accumulator: {YYYY-MM-DD: {'sales': 0, 'returns': 0, 'adjustments': 0, 'transfers': 0, 'revenue': 0.0}}
        timeline_map = {}
        for d in range(7):
            day_key = (now - timedelta(days=6 - d)).strftime('%Y-%m-%d')
            timeline_map[day_key] = {'sales': 0, 'returns': 0, 'adjustments': 0, 'transfers': 0, 'revenue': 0.0}

        for e in entries:
            r = e.reason
            d = e.delta
            day_str = e.timestamp.strftime('%Y-%m-%d') if e.timestamp else None

            # Price & Cost with fallbacks
            price = float(e.unit_price or (e.variant.price if e.variant else 0.0))
            cost = float(e.unit_cost or (e.variant.cost if e.variant else 0.0))

            if r == StockLedgerEntry.Reason.SALE:
                qty = abs(d)
                units_sold += qty
                sale_rev = qty * price
                gross_revenue += sale_rev
                cogs += qty * cost
                sales_count += 1

                if day_str in timeline_map:
                    timeline_map[day_str]['sales'] += qty
                    timeline_map[day_str]['revenue'] += sale_rev

                if e.variant_id:
                    v_key = str(e.variant_id)
                    if v_key not in variant_sales_map:
                        variant_sales_map[v_key] = {
                            'id': v_key,
                            'sku': e.variant.sku if e.variant else (e.variant_sku or 'SKU'),
                            'product_name': e.variant.product.name if e.variant and e.variant.product else (e.product_name or 'Product'),
                            'units_sold': 0,
                            'revenue': 0.0,
                        }
                    variant_sales_map[v_key]['units_sold'] += qty
                    variant_sales_map[v_key]['revenue'] += sale_rev

            elif r == StockLedgerEntry.Reason.RETURN:
                qty = abs(d)
                units_returned += qty
                refunds_value += qty * price
                returns_count += 1
                if day_str in timeline_map:
                    timeline_map[day_str]['returns'] += qty

            elif r == StockLedgerEntry.Reason.STOCK_ADJUSTMENT:
                if d > 0:
                    units_restocked += d
                    restocks_count += 1
                else:
                    units_deducted += abs(d)
                    deductions_count += 1
                if day_str in timeline_map:
                    timeline_map[day_str]['adjustments'] += abs(d)

            elif r == StockLedgerEntry.Reason.STOCKTAKE_RECONCILIATION:
                stocktake_variances += abs(d)
                stocktake_count += 1
                if day_str in timeline_map:
                    timeline_map[day_str]['adjustments'] += abs(d)

            elif r == StockLedgerEntry.Reason.WAREHOUSE_TRANSFER:
                transfers_units += abs(d)
                transfers_count += 1
                if day_str in timeline_map:
                    timeline_map[day_str]['transfers'] += abs(d)

        # Net financials
        net_revenue = max(0.0, gross_revenue - refunds_value)
        net_units_sold = max(0, units_sold - units_returned)
        gross_profit = net_revenue - cogs
        profit_margin_pct = round((gross_profit / net_revenue * 100), 1) if net_revenue > 0 else 0.0
        avg_sale_price = round(gross_revenue / units_sold, 2) if units_sold > 0 else 0.0

        # Action Distribution breakdown
        total_actions = len(entries)
        actions_summary = [
            {
                "reason": "SALE",
                "label": "Customer Sales",
                "count": sales_count,
                "units_impact": -units_sold,
                "monetary_impact": round(gross_revenue, 2),
                "icon": "shopping_cart",
                "badge_class": "bg-error-container text-on-error-container",
            },
            {
                "reason": "RETURN",
                "label": "Returns & Refunds",
                "count": returns_count,
                "units_impact": units_returned,
                "monetary_impact": -round(refunds_value, 2),
                "icon": "assignment_return",
                "badge_class": "bg-amber-100 text-amber-800",
            },
            {
                "reason": "RESTOCK",
                "label": "Stock Inbound & Additions",
                "count": restocks_count,
                "units_impact": units_restocked,
                "monetary_impact": None,
                "icon": "add_circle",
                "badge_class": "bg-[#ecfdf5] text-[#047857]",
            },
            {
                "reason": "SHRINKAGE",
                "label": "Damage & Shrinkage Deductions",
                "count": deductions_count,
                "units_impact": -units_deducted,
                "monetary_impact": None,
                "icon": "remove_circle",
                "badge_class": "bg-error-container text-on-error-container",
            },
            {
                "reason": "STOCKTAKE",
                "label": "Stocktake Audit Reconciliations",
                "count": stocktake_count,
                "units_impact": stocktake_variances,
                "monetary_impact": None,
                "icon": "fact_check",
                "badge_class": "bg-secondary-fixed text-on-secondary-fixed",
            },
            {
                "reason": "TRANSFER",
                "label": "Location Transfers",
                "count": transfers_count // 2 if transfers_count > 1 else transfers_count,
                "units_impact": transfers_units // 2 if transfers_units > 1 else transfers_units,
                "monetary_impact": None,
                "icon": "local_shipping",
                "badge_class": "bg-primary-fixed text-on-primary-fixed",
            },
        ]

        # Top 5 performing styles from ledger
        top_products = sorted(
            variant_sales_map.values(),
            key=lambda x: (x['revenue'], x['units_sold']),
            reverse=True
        )[:5]

        # Action Activity timeline array
        timeline = []
        for day_str, data in sorted(timeline_map.items()):
            dt = timezone.datetime.strptime(day_str, '%Y-%m-%d')
            timeline.append({
                "date": dt.strftime('%b %d'),
                "full_date": day_str,
                "sales": data['sales'],
                "returns": data['returns'],
                "adjustments": data['adjustments'],
                "transfers": data['transfers'],
                "revenue": round(data.get('revenue', 0.0), 2),
                "net_units": data['sales'] - data['returns'] + data['adjustments'],
            })

        # 4. Inventory Valuation & Counts from StoreInventory
        inv_units_agg = inventory_qs.aggregate(total_stock=Sum('quantity_on_hand'))
        total_stock_units = int(inv_units_agg['total_stock'] or 0)

        valuation = 0.0
        for item in inventory_qs.select_related('variant').filter(quantity_on_hand__gt=0)[:2000]:
            valuation += float(item.quantity_on_hand * (item.variant.price if item.variant else 0))

        active_styles_count = Product.objects.filter(
            variants__store_inventories__in=inventory_qs,
            variants__store_inventories__quantity_on_hand__gt=0
        ).distinct().count()

        negative_skus_count = inventory_qs.filter(quantity_on_hand__lt=0).count()

        # 5. Multi-Store Comparison from StockLedgerEntry
        store_breakdown = []
        all_stores = Store.objects.filter(is_active=True)
        for st in all_stores:
            st_sales_entries = StockLedgerEntry.objects.filter(store=st, reason=StockLedgerEntry.Reason.SALE)
            st_rev = 0.0
            st_sold = 0
            for row in st_sales_entries[:500]:
                q = abs(row.delta)
                st_sold += q
                p = float(row.unit_price or (row.variant.price if row.variant else 0.0))
                st_rev += q * p

            st_stock = int(StoreInventory.objects.filter(store=st).aggregate(u=Sum('quantity_on_hand'))['u'] or 0)
            st_total_throughput = st_sold + max(0, st_stock)
            st_pct = round((st_sold / st_total_throughput) * 100, 1) if st_total_throughput > 0 else 0.0

            store_breakdown.append({
                "id": st.id,
                "name": st.name,
                "code": st.code,
                "is_warehouse": st.is_warehouse,
                "revenue": round(st_rev, 2),
                "units_sold": st_sold,
                "stock_units": st_stock,
                "sell_through_pct": st_pct,
            })

        # 6. Edge Node Telemetry
        edge_telemetry = []
        for st in all_stores:
            last_sync = SyncEvent.objects.filter(store=st).order_by('-created_at').first()
            pending_count = SyncEvent.objects.filter(store=st, status=SyncEvent.Status.PENDING).count()
            edge_telemetry.append({
                "store_id": st.id,
                "store_name": st.name,
                "store_code": st.code,
                "is_warehouse": st.is_warehouse,
                "status": "ONLINE" if st.is_active else "OFFLINE",
                "pending_events": pending_count,
                "last_synced_at": last_sync.processed_at.isoformat() if last_sync and last_sync.processed_at else None,
            })

        return Response({
            "status": "success",
            "scope": {
                "id": resolved_store.id if isinstance(resolved_store, Store) else (resolved_store or "all"),
                "name": scope_name,
                "code": scope_code,
                "is_storage": is_storage,
            },
            "range": range_param,
            "kpis": {
                # Revenue & Net Sales
                "total_revenue": round(net_revenue, 2),
                "gross_revenue": round(gross_revenue, 2),
                "units_sold": units_sold,
                "units_returned": units_returned,
                "net_units_sold": net_units_sold,
                "refunds_value": round(refunds_value, 2),
                "avg_price": avg_sale_price,
                # Profitability from snapshotted unit_cost
                "cogs": round(cogs, 2),
                "gross_profit": round(gross_profit, 2),
                "profit_margin_pct": profit_margin_pct,
                # Actions & Operations
                "total_ledger_actions": total_actions,
                "units_restocked": units_restocked,
                "units_deducted": units_deducted,
                "stocktake_variances": stocktake_variances,
                "transfers_units": transfers_units // 2 if transfers_units > 1 else transfers_units,
                # Inventory Health
                "valuation": round(valuation, 2),
                "total_stock_units": total_stock_units,
                "active_styles_count": active_styles_count,
                "negative_skus_count": negative_skus_count,
            },
            "actions_summary": actions_summary,
            "top_products": top_products,
            "timeline": timeline,
            "store_breakdown": store_breakdown,
            "edge_telemetry": edge_telemetry,
        }, status=status.HTTP_200_OK)
