import uuid
import logging
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import (
    Store,
    Variant,
    StoreInventory,
    SyncEvent,
    ServerEvent,
    StockLedgerEntry,
)
from .signals import suppress_server_events

logger = logging.getLogger(__name__)


def resolve_store(store_identifier):
    """
    Resolve Store instance by integer ID or unique code.
    """
    if not store_identifier:
        return None
    if isinstance(store_identifier, Store):
        return store_identifier

    # Try numeric ID first
    if str(store_identifier).isdigit():
        store = Store.objects.filter(pk=int(store_identifier)).first()
        if store:
            return store

    # Try matching by store code
    return Store.objects.filter(code__iexact=str(store_identifier)).first()


def resolve_variant(item_dict):
    """
    Find a Variant by variant_id (UUID), sku, or barcode.
    """
    variant_id = item_dict.get('variant_id') or item_dict.get('variant')
    if variant_id:
        try:
            v = Variant.objects.filter(id=variant_id).first()
            if v:
                return v
        except (ValueError, TypeError):
            pass

    sku = item_dict.get('sku')
    if sku:
        v = Variant.objects.filter(sku__iexact=str(sku)).first()
        if v:
            return v

    barcode = item_dict.get('barcode')
    if barcode:
        v = Variant.objects.filter(barcode__iexact=str(barcode)).first()
        if v:
            return v

    return None


def map_reason(reason_str, event_type):
    """
    Map input string or event_type to StockLedgerEntry.Reason choice.
    """
    candidate = (reason_str or event_type or '').upper().strip()
    if 'RETURN' in candidate or 'REFUND' in candidate:
        return StockLedgerEntry.Reason.RETURN
    if 'SALE' in candidate or candidate == 'ORDER':
        return StockLedgerEntry.Reason.SALE
    if 'TRANSFER' in candidate or candidate == 'WAREHOUSE_TRANSFER':
        return StockLedgerEntry.Reason.WAREHOUSE_TRANSFER
    if 'STOCKTAKE' in candidate or 'RECONCIL' in candidate:
        return StockLedgerEntry.Reason.STOCKTAKE_RECONCILIATION
    if 'ADJUST' in candidate or 'CORRECTION' in candidate:
        return StockLedgerEntry.Reason.STOCK_ADJUSTMENT

    return StockLedgerEntry.Reason.STOCK_ADJUSTMENT


def process_single_sync_event(event_data, default_store, sync_source):
    """
    Process an individual SyncEvent idempotently.
    Returns: (event_id_str, was_skipped, error_detail)
    """
    raw_event_id = event_data.get('event_id')
    if raw_event_id:
        try:
            event_id = uuid.UUID(str(raw_event_id))
        except (ValueError, AttributeError):
            event_id = uuid.uuid4()
    else:
        event_id = uuid.uuid4()

    event_id_str = str(event_id)

    # 1. Idempotency Check: skip already processed event_id
    if SyncEvent.objects.filter(event_id=event_id).exists():
        return event_id_str, True, None

    # 2. Resolve Store
    store_identifier = event_data.get('store_id') or event_data.get('store') or default_store
    store = resolve_store(store_identifier)
    if not store:
        return event_id_str, False, f"Unknown or missing store: '{store_identifier}'"

    event_type = event_data.get('event_type', 'SALE').upper()
    payload = event_data.get('payload', {})
    if not isinstance(payload, dict):
        payload = {'raw_payload': payload}

    # Extract event timestamp
    raw_timestamp = payload.get('timestamp') or event_data.get('created_at') or payload.get('created_at')
    if raw_timestamp:
        parsed_dt = parse_datetime(str(raw_timestamp))
        event_timestamp = parsed_dt if parsed_dt else timezone.now()
    else:
        event_timestamp = timezone.now()

    # 3. Extract items/deltas
    items = payload.get('items') or payload.get('lines')
    if not items or not isinstance(items, list):
        # Single item payload
        items = [payload]

    with transaction.atomic(), suppress_server_events():
        # Create SyncEvent record (marked with _skip_ledger_entry so signal does not duplicate
        # the fine-grained inventory-locked ledger entries created below)
        sync_event = SyncEvent(
            event_id=event_id,
            store=store,
            event_type=event_type,
            payload=payload,
            status=SyncEvent.Status.PROCESSED,
            processed_at=timezone.now(),
        )
        sync_event._skip_ledger_entry = True
        sync_event.save()

        for item in items:
            variant = resolve_variant(item)
            if not variant:
                logger.warning("SyncEvent %s: variant not found for item %s", event_id_str, item)
                continue

            # Determine delta
            if 'delta' in item:
                delta = int(item['delta'])
            elif 'quantity' in item:
                qty = int(item['quantity'])
                # Sale reduces stock
                if event_type in ('SALE', 'ORDER'):
                    delta = -abs(qty)
                elif event_type in ('RETURN', 'REFUND'):
                    delta = abs(qty)
                else:
                    delta = qty
            else:
                delta = 0

            reason = map_reason(item.get('reason'), event_type)

            # Update StoreInventory (select_for_update inside transaction to prevent race conditions)
            inventory, _ = StoreInventory.objects.select_for_update().get_or_create(
                store=store,
                variant=variant,
                defaults={'quantity_on_hand': 0}
            )

            inventory.quantity_on_hand += delta
            inventory.save(update_fields=['quantity_on_hand', 'updated_at'])
            resulting_balance = inventory.quantity_on_hand

            # Flag negative balance instead of blocking sales
            notes = item.get('notes', '')
            if resulting_balance < 0:
                flag = f"[FLAGGED: NEGATIVE STOCK BALANCE {resulting_balance}]"
                notes = f"{flag} {notes}".strip()

            # Snapshot price and cost at transaction time for exact historical analytics
            unit_price = item.get('unit_price') or item.get('price') or variant.price
            unit_cost = item.get('unit_cost') or item.get('cost') or variant.cost

            # Record immutable StockLedgerEntry
            StockLedgerEntry.objects.create(
                store=store,
                variant=variant,
                delta=delta,
                resulting_balance=resulting_balance,
                unit_price=unit_price,
                unit_cost=unit_cost,
                reason=reason,
                sync_source=sync_source,
                timestamp=event_timestamp,
                sync_event=sync_event,
                notes=notes,
            )

    return event_id_str, False, None


def process_sync_batch(events_data, default_store, sync_source):
    """
    Process a collection of SyncEvents idempotently.
    """
    if not isinstance(events_data, list):
        events_data = [events_data]

    acked_event_ids = []
    processed_count = 0
    skipped_count = 0
    errors = []

    for item in events_data:
        if not isinstance(item, dict):
            continue
        try:
            event_id_str, was_skipped, err = process_single_sync_event(
                item, default_store, sync_source
            )
            if err:
                errors.append({"event_id": event_id_str, "error": err})
            elif was_skipped:
                skipped_count += 1
                acked_event_ids.append(event_id_str)
            else:
                processed_count += 1
                acked_event_ids.append(event_id_str)
        except Exception as exc:
            logger.exception("Error processing sync event: %s", exc)
            errors.append({"event": item, "error": str(exc)})

    return {
        "acked_event_ids": acked_event_ids,
        "processed_count": processed_count,
        "skipped_count": skipped_count,
        "errors": errors,
    }


def get_server_events_for_store(store_identifier, after_seq=0, limit=500):
    """
    Retrieve ServerEvents with seq_id > after_seq that match store_id or store IS NULL.
    """
    queryset = ServerEvent.objects.filter(seq_id__gt=after_seq)

    store = resolve_store(store_identifier) if store_identifier else None
    if store:
        queryset = queryset.filter(Q(store=store) | Q(store__isnull=True))
    else:
        # Global events only if no store specified
        queryset = queryset.filter(store__isnull=True)

    limit = max(1, min(limit, 1000))
    return list(queryset.select_related('store').order_by('seq_id')[:limit])
