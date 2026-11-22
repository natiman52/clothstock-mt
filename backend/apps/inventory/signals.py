import logging
from contextlib import contextmanager
from contextvars import ContextVar

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.utils import timezone

from .models import (
    Category,
    Product,
    Variant,
    Store,
    StoreInventory,
    ServerEvent,
    SyncEvent,
    StockLedgerEntry,
    Sale,
    SaleItem,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Thread-safe / async-safe suppression flag
# ---------------------------------------------------------------------------
# Using ContextVar so each OS thread (and async task) maintains its own value,
# preventing one request from accidentally silencing another request's events.

_suppress_server_events: ContextVar[bool] = ContextVar('suppress_server_events', default=False)


@contextmanager
def suppress_server_events():
    """
    Context manager that suppresses all ServerEvent logging within the block.
    Safe to use in multi-threaded Django (each thread gets its own ContextVar copy).

    Usage in sync_service.py::

        with transaction.atomic(), suppress_server_events():
            inventory, _ = StoreInventory.objects.select_for_update().get_or_create(...)
            inventory.quantity_on_hand += delta
            inventory.save(...)
    """
    token = _suppress_server_events.set(True)
    try:
        yield
    finally:
        _suppress_server_events.reset(token)


def _server_events_suppressed() -> bool:
    """Return True if the current context is inside suppress_server_events()."""
    return _suppress_server_events.get()


def log_server_event(event_type, store=None, payload=None):
    """
    Utility function to create a ServerEvent and assign it a monotonic seq_id.
    """
    event = ServerEvent.objects.create(
        store=store,
        event_type=event_type,
        payload=payload or {},
    )
    logger.info("ServerEvent #%s [%s] created: %s", event.seq_id, store.code if store else 'GLOBAL', event_type)
    return event


# ─────────────────────────────────────────────────────────────────────────────
# Category Signals (Global Catalog Changes)
# ─────────────────────────────────────────────────────────────────────────────

@receiver(post_save, sender=Category)
def category_saved_handler(sender, instance, created, **kwargs):
    if _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return

    event_type = 'CATEGORY_CREATED' if created else 'CATEGORY_UPDATED'
    payload = {
        'id': instance.id,
        'name': instance.name,
        'code': instance.code,
        'description': instance.description,
        'is_active': instance.is_active,
        'created_at': instance.created_at.isoformat() if instance.created_at else None,
        'updated_at': instance.updated_at.isoformat() if instance.updated_at else timezone.now().isoformat(),
    }
    log_server_event(event_type, store=None, payload=payload)


@receiver(post_delete, sender=Category)
def category_deleted_handler(sender, instance, **kwargs):
    if _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return

    payload = {
        'id': instance.id,
        'name': instance.name,
        'code': instance.code,
    }
    log_server_event('CATEGORY_DELETED', store=None, payload=payload)


# ─────────────────────────────────────────────────────────────────────────────
# Product Signals (Global Catalog Changes)
# ─────────────────────────────────────────────────────────────────────────────

@receiver(post_save, sender=Product)
def product_saved_handler(sender, instance, created, **kwargs):
    if _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return

    event_type = 'PRODUCT_CREATED' if created else 'PRODUCT_UPDATED'
    payload = {
        'id': str(instance.id),
        'name': instance.name,
        'style_code': instance.style_code,
        'description': instance.description,
        'category_id': instance.category_id,
        'category': instance.category.name if instance.category else None,
        'category_code': instance.category.code if instance.category else None,
        'is_active': instance.is_active,
        'created_at': instance.created_at.isoformat() if instance.created_at else None,
        'updated_at': instance.updated_at.isoformat() if instance.updated_at else timezone.now().isoformat(),
    }
    log_server_event(event_type, store=None, payload=payload)


@receiver(post_delete, sender=Product)
def product_deleted_handler(sender, instance, **kwargs):
    if _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return

    payload = {
        'id': str(instance.id),
        'name': instance.name,
        'style_code': instance.style_code,
    }
    log_server_event('PRODUCT_DELETED', store=None, payload=payload)


# ─────────────────────────────────────────────────────────────────────────────
# Variant Signals (Global Catalog & Price Changes)
# ─────────────────────────────────────────────────────────────────────────────

@receiver(post_save, sender=Variant)
def variant_saved_handler(sender, instance, created, **kwargs):
    if _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return

    event_type = 'VARIANT_CREATED' if created else 'VARIANT_UPDATED'
    payload = {
        'id': str(instance.id),
        'product_id': str(instance.product_id),
        'sku': instance.sku,
        'barcode': instance.barcode,
        'size': instance.size,
        'color': instance.color,
        'price': str(instance.price),
        'cost': str(instance.cost),
        'is_active': instance.is_active,
        'created_at': instance.created_at.isoformat() if instance.created_at else None,
        'updated_at': instance.updated_at.isoformat() if instance.updated_at else timezone.now().isoformat(),
    }
    log_server_event(event_type, store=None, payload=payload)


@receiver(post_delete, sender=Variant)
def variant_deleted_handler(sender, instance, **kwargs):
    if _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return

    payload = {
        'id': str(instance.id),
        'product_id': str(instance.product_id),
        'sku': instance.sku,
        'barcode': instance.barcode,
    }
    log_server_event('VARIANT_DELETED', store=None, payload=payload)


# ─────────────────────────────────────────────────────────────────────────────
# Store Signals (Store Network Changes)
# ─────────────────────────────────────────────────────────────────────────────

@receiver(post_save, sender=Store)
def store_saved_handler(sender, instance, created, **kwargs):
    if _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return

    event_type = 'STORE_CREATED' if created else 'STORE_UPDATED'
    payload = {
        'id': instance.id,
        'name': instance.name,
        'code': instance.code,
        'address': instance.address,
        'phone': instance.phone,
        'is_active': instance.is_active,
        'updated_at': instance.updated_at.isoformat() if instance.updated_at else timezone.now().isoformat(),
    }
    # Global broadcast so all edge nodes update their store directory
    log_server_event(event_type, store=None, payload=payload)


@receiver(post_delete, sender=Store)
def store_deleted_handler(sender, instance, **kwargs):
    if _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return

    payload = {
        'id': instance.id,
        'code': instance.code,
        'name': instance.name,
    }
    log_server_event('STORE_DELETED', store=None, payload=payload)


# ─────────────────────────────────────────────────────────────────────────────
# StoreInventory Signals (Server-Side Transfers & Adjustments)
# ─────────────────────────────────────────────────────────────────────────────

@receiver(post_save, sender=StoreInventory)
def store_inventory_saved_handler(sender, instance, created, **kwargs):
    # If the change originated from an incoming store sync mutation, skip logging
    # to avoid echoing the store's own transaction back to itself.
    if _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return

    event_type = 'STOCK_TRANSFER' if created else 'INVENTORY_UPDATED'
    payload = {
        'store_id': instance.store_id,
        'store_code': instance.store.code if instance.store else 'STORAGE',
        'variant_id': str(instance.variant_id),
        'variant_sku': instance.variant.sku,
        'quantity_on_hand': instance.quantity_on_hand,
        'updated_at': instance.updated_at.isoformat() if instance.updated_at else timezone.now().isoformat(),
    }
    log_server_event(event_type, store=instance.store, payload=payload)


# ─────────────────────────────────────────────────────────────────────────────
# StockLedgerEntry Signals (Web Admin Adjustments)
# ─────────────────────────────────────────────────────────────────────────────

@receiver(post_save, sender=StockLedgerEntry)
def stock_ledger_saved_handler(sender, instance, created, **kwargs):
    if not created or _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return

    # If created directly on the server (e.g. Web Admin) without an attached server_event
    if instance.sync_source == StockLedgerEntry.SyncSource.WEB_ADMIN and not instance.server_event_id:
        payload = {
            'ledger_id': instance.id,
            'store_id': instance.store_id,
            'store_code': instance.store.code if instance.store else 'STORAGE',
            'variant_id': str(instance.variant_id),
            'variant_sku': instance.variant.sku,
            'delta': instance.delta,
            'resulting_balance': instance.resulting_balance,
            'reason': instance.reason,
            'sync_source': instance.sync_source,
            'notes': instance.notes,
            'timestamp': instance.timestamp.isoformat() if instance.timestamp else timezone.now().isoformat(),
        }
        event = log_server_event(f"LEDGER_{instance.reason}", store=instance.store, payload=payload)
        StockLedgerEntry.objects.filter(id=instance.id).update(server_event=event)


# ─────────────────────────────────────────────────────────────────────────────
# Sale Signals (Customer Transactions)
# ─────────────────────────────────────────────────────────────────────────────

@receiver(post_save, sender=Sale)
def sale_saved_handler(sender, instance, created, **kwargs):
    if _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return
    if not created:
        return  # only broadcast on creation; status changes (void/return) fire their own events

    payload = {
        'sale_id':        str(instance.id),
        'store_id':       instance.store_id,
        'store_code':     instance.store.code,
        'receipt_number': instance.receipt_number,
        'sold_at':        instance.sold_at.isoformat(),
        'payment_method': instance.payment_method,
        'status':         instance.status,
        'subtotal':       str(instance.subtotal),
        'discount':       str(instance.discount_amount),
        'tax':            str(instance.tax_amount),
        'total':          str(instance.total_amount),
        'cashier':        instance.cashier_name,
        'customer':       instance.customer_name,
    }
    log_server_event('SALE_CREATED', store=instance.store, payload=payload)


@receiver(post_save, sender=Sale)
def sale_status_changed_handler(sender, instance, created, **kwargs):
    """Emit a targeted event when a sale is voided or marked as returned."""
    if created or _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return

    if instance.status == Sale.Status.VOIDED:
        event_type = 'SALE_VOIDED'
    elif instance.status == Sale.Status.RETURNED:
        event_type = 'SALE_RETURNED'
    else:
        return  # generic edits do not warrant a dedicated event

    payload = {
        'sale_id':        str(instance.id),
        'store_code':     instance.store.code,
        'receipt_number': instance.receipt_number,
        'status':         instance.status,
        'total':          str(instance.total_amount),
        'updated_at':     instance.updated_at.isoformat() if instance.updated_at else timezone.now().isoformat(),
    }
    log_server_event(event_type, store=instance.store, payload=payload)


@receiver(post_delete, sender=Sale)
def sale_deleted_handler(sender, instance, **kwargs):
    if _server_events_suppressed() or getattr(instance, '_skip_server_event', False):
        return
    payload = {
        'sale_id':    str(instance.id),
        'store_code': instance.store.code,
    }
    log_server_event('SALE_DELETED', store=instance.store, payload=payload)


@receiver(post_save, sender=SaleItem)
def sale_item_saved_handler(sender, instance, created, **kwargs):
    """
    Whenever a SaleItem is created, automatically decrement store inventory
    and write an authoritative StockLedgerEntry row with exact unit_price and unit_cost snapshot.
    """
    if not created or instance.ledger_entry_id or _server_events_suppressed():
        return

    store = instance.sale.store
    variant = instance.variant

    inv, _ = StoreInventory.objects.get_or_create(
        store=store,
        variant=variant,
        defaults={'quantity_on_hand': 0}
    )
    inv.quantity_on_hand -= instance.quantity
    inv._skip_server_event = True
    inv.save(update_fields=['quantity_on_hand', 'updated_at'])

    ledger = StockLedgerEntry.objects.create(
        store=store,
        variant=variant,
        delta=-instance.quantity,
        resulting_balance=inv.quantity_on_hand,
        unit_price=instance.unit_price,
        unit_cost=instance.unit_cost,
        reason=StockLedgerEntry.Reason.SALE,
        sync_source=StockLedgerEntry.SyncSource.AUTO_SYNC,
        timestamp=instance.sale.sold_at or timezone.now(),
        notes=f"Sale #{instance.sale.receipt_number or str(instance.sale_id)[:8]}"
    )
    SaleItem.objects.filter(id=instance.id).update(ledger_entry=ledger)



# ─────────────────────────────────────────────────────────────────────────────
# ServerEvent Signals (Analytics Logging into StockLedgerEntry)
# ─────────────────────────────────────────────────────────────────────────────

@receiver(post_save, sender=ServerEvent)
def server_event_saved_handler(sender, instance, created, **kwargs):
    """
    Whenever a ServerEvent is created, log it in StockLedgerEntry for analytics.
    Follows authoritative server events with full auditability.
    """
    if not created:
        return

    payload = instance.payload or {}

    # If this ServerEvent was spawned by an existing StockLedgerEntry, link it back and skip
    if payload.get('ledger_id'):
        StockLedgerEntry.objects.filter(id=payload['ledger_id'], server_event__isnull=True).update(server_event=instance)
        return

    # Avoid duplicating if already logged
    if StockLedgerEntry.objects.filter(server_event=instance).exists():
        return

    store = instance.store
    if not store and payload.get('store_id'):
        store = Store.objects.filter(id=payload['store_id']).first()

    variant = None
    variant_id = payload.get('variant_id') or payload.get('variant')
    if variant_id:
        variant = Variant.objects.filter(id=variant_id).first()
    if not variant and payload.get('variant_sku'):
        variant = Variant.objects.filter(sku=payload['variant_sku']).first()
    if not variant and payload.get('sku'):
        variant = Variant.objects.filter(sku=payload['sku']).first()
    if not variant and instance.event_type.startswith('VARIANT_') and payload.get('id'):
        variant = Variant.objects.filter(id=payload['id']).first()

    # Determine delta
    delta = 0
    if 'delta' in payload:
        try:
            delta = int(payload['delta'])
        except (ValueError, TypeError):
            delta = 0
    elif 'quantity' in payload:
        try:
            delta = int(payload['quantity'])
        except (ValueError, TypeError):
            delta = 0

    # Determine resulting balance
    resulting_balance = 0
    if 'resulting_balance' in payload:
        try:
            resulting_balance = int(payload['resulting_balance'])
        except (ValueError, TypeError):
            resulting_balance = 0
    elif 'quantity_on_hand' in payload:
        try:
            resulting_balance = int(payload['quantity_on_hand'])
        except (ValueError, TypeError):
            resulting_balance = 0
    elif store and variant:
        inv = StoreInventory.objects.filter(store=store, variant=variant).first()
        resulting_balance = inv.quantity_on_hand if inv else 0

    # Snapshot unit price and cost at transaction time for exact historical analytics
    unit_price = payload.get('unit_price') or payload.get('price') or (variant.price if variant else 0.00)
    unit_cost = payload.get('unit_cost') or payload.get('cost') or (variant.cost if variant else 0.00)

    # Determine reason
    event_type = instance.event_type.upper()
    if 'RETURN' in event_type or 'REFUND' in event_type:
        reason = StockLedgerEntry.Reason.RETURN
    elif 'TRANSFER' in event_type or 'DISPATCH' in event_type:
        reason = StockLedgerEntry.Reason.WAREHOUSE_TRANSFER
    elif 'SALE' in event_type or 'ORDER' in event_type:
        reason = StockLedgerEntry.Reason.SALE
    elif 'STOCKTAKE' in event_type or 'RECONCILIATION' in event_type:
        reason = StockLedgerEntry.Reason.STOCKTAKE_RECONCILIATION
    elif hasattr(StockLedgerEntry.Reason, 'SERVER_EVENT'):
        reason = StockLedgerEntry.Reason.SERVER_EVENT
    else:
        reason = StockLedgerEntry.Reason.STOCK_ADJUSTMENT

    notes = payload.get('notes') or f"ServerEvent #{instance.seq_id} [{instance.event_type}]"

    StockLedgerEntry.objects.create(
        store=store,
        variant=variant,
        delta=delta,
        resulting_balance=resulting_balance,
        unit_price=unit_price,
        unit_cost=unit_cost,
        reason=reason,
        sync_source=StockLedgerEntry.SyncSource.WEB_ADMIN,
        timestamp=instance.created_at or timezone.now(),
        server_event=instance,
        notes=notes,
    )


# ─────────────────────────────────────────────────────────────────────────────
# SyncEvent Signals (Analytics Logging into StockLedgerEntry when Synced)
# ─────────────────────────────────────────────────────────────────────────────

def _create_ledger_entry_from_sync_item(sync_event, store, item_dict):
    variant = None
    variant_id = item_dict.get('variant_id') or item_dict.get('variant')
    if variant_id:
        variant = Variant.objects.filter(id=variant_id).first()
    if not variant and item_dict.get('sku'):
        variant = Variant.objects.filter(sku=item_dict['sku']).first()
    if not variant and item_dict.get('barcode'):
        variant = Variant.objects.filter(barcode=item_dict['barcode']).first()

    event_type = sync_event.event_type.upper()

    # Determine delta
    if 'delta' in item_dict:
        try:
            delta = int(item_dict['delta'])
        except (ValueError, TypeError):
            delta = 0
    elif 'quantity' in item_dict:
        try:
            qty = int(item_dict['quantity'])
            if event_type in ('SALE', 'ORDER'):
                delta = -abs(qty)
            elif event_type in ('RETURN', 'REFUND'):
                delta = abs(qty)
            else:
                delta = qty
        except (ValueError, TypeError):
            delta = 0
    else:
        delta = 0

    # Determine resulting balance
    resulting_balance = 0
    if 'resulting_balance' in item_dict:
        try:
            resulting_balance = int(item_dict['resulting_balance'])
        except (ValueError, TypeError):
            resulting_balance = 0
    elif store and variant:
        inv = StoreInventory.objects.filter(store=store, variant=variant).first()
        resulting_balance = inv.quantity_on_hand if inv else delta

    # Snapshot unit price and cost at transaction time for exact historical analytics
    unit_price = item_dict.get('unit_price') or item_dict.get('price') or (variant.price if variant else 0.00)
    unit_cost = item_dict.get('unit_cost') or item_dict.get('cost') or (variant.cost if variant else 0.00)

    # Determine reason
    raw_reason = str(item_dict.get('reason', '')).upper()
    if 'RETURN' in raw_reason or 'REFUND' in raw_reason or event_type in ('RETURN', 'REFUND'):
        reason = StockLedgerEntry.Reason.RETURN
    elif 'TRANSFER' in raw_reason or 'TRANSFER' in event_type:
        reason = StockLedgerEntry.Reason.WAREHOUSE_TRANSFER
    elif 'SALE' in raw_reason or event_type in ('SALE', 'ORDER'):
        reason = StockLedgerEntry.Reason.SALE
    elif 'RECONCILIATION' in raw_reason or 'STOCKTAKE' in raw_reason or 'STOCKTAKE' in event_type:
        reason = StockLedgerEntry.Reason.STOCKTAKE_RECONCILIATION
    elif hasattr(StockLedgerEntry.Reason, 'SYNC_EVENT'):
        reason = StockLedgerEntry.Reason.SYNC_EVENT
    else:
        reason = StockLedgerEntry.Reason.STOCK_ADJUSTMENT

    sync_source = item_dict.get('sync_source') or StockLedgerEntry.SyncSource.AUTO_SYNC
    notes = item_dict.get('notes') or f"SyncEvent {sync_event.event_id} [{sync_event.event_type}]"

    StockLedgerEntry.objects.create(
        store=store,
        variant=variant,
        delta=delta,
        resulting_balance=resulting_balance,
        unit_price=unit_price,
        unit_cost=unit_cost,
        reason=reason,
        sync_source=sync_source,
        timestamp=sync_event.processed_at or sync_event.created_at or timezone.now(),
        sync_event=sync_event,
        notes=notes,
    )


@receiver(post_save, sender=SyncEvent)
def sync_event_saved_handler(sender, instance, created, **kwargs):
    """
    Whenever a SyncEvent is saved, log it in StockLedgerEntry for analytics,
    but ONLY if it is synced (status == PROCESSED).
    """
    # Only if it is synced!
    if instance.status != SyncEvent.Status.PROCESSED:
        return

    # If explicitly flagged to skip or already logged, do not duplicate
    if getattr(instance, '_skip_ledger_entry', False):
        return

    if StockLedgerEntry.objects.filter(sync_event=instance).exists():
        return

    store = instance.store
    payload = instance.payload or {}
    items = payload.get('items') or payload.get('lines')

    if isinstance(items, list) and items:
        for item in items:
            if isinstance(item, dict):
                _create_ledger_entry_from_sync_item(instance, store, item)
    else:
        _create_ledger_entry_from_sync_item(instance, store, payload if isinstance(payload, dict) else {})
