import uuid
import logging
from decimal import Decimal
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
    Sale,
    SaleItem,
)
from .signals import suppress_server_events, log_server_event

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
    NAMESPACE_SYNC = uuid.UUID('6ba7c100-9dbd-12d3-80b4-00c60fd430c8')
    if raw_event_id:
        try:
            event_id = uuid.UUID(str(raw_event_id))
        except (ValueError, AttributeError):
            event_id = uuid.uuid5(NAMESPACE_SYNC,str(raw_event_id))
    else:
        event_id = uuid.uuid4()

    event_id_str = str(event_id)

    # 1. Idempotency Check: skip already processed event_id
    existing_event = SyncEvent.objects.filter(event_id=event_id).first()
    if existing_event:
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

        ledger_entries_by_variant = {}
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
            ledger_entry = StockLedgerEntry.objects.create(
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
            ledger_entries_by_variant.setdefault(variant.pk, []).append(ledger_entry)

            # Emit a device-aware inventory delta, rather than relying on the
            # StoreInventory post-save signal's absolute snapshot. This lets an
            # offline POS merge the server-side result without replaying stale
            # absolute quantities over its own pending checkout.
            log_server_event(
                'INVENTORY_DELTA',
                store=store,
                payload={
                    'store_id': str(store.pk),
                    'store_code': store.code,
                    'variant_id': str(variant.pk),
                    'variant_sku': variant.sku,
                    'delta': delta,
                    'resulting_balance': resulting_balance,
                    'origin_event_id': event_id_str,
                    'timestamp': event_timestamp.isoformat(),
                },
            )

        sale_record = payload.get('sale_record')
        if event_type in ('SALE', 'ORDER') and isinstance(sale_record, dict):
            raw_sale_id = sale_record.get('id') or payload.get('sale_id')
            try:
                sale_id = uuid.UUID(str(raw_sale_id))
            except (ValueError, TypeError, AttributeError):
                raise ValueError(f"Invalid sale ID in sync event: {raw_sale_id!r}")

            sale_timestamp = parse_datetime(
                str(sale_record.get('sold_at') or raw_timestamp or '')
            ) or event_timestamp
            sale = Sale.objects.create(
                id=sale_id,
                store=store,
                sync_event=sync_event,
                receipt_number=sale_record.get('receipt_number', ''),
                sold_at=sale_timestamp,
                payment_method=sale_record.get('payment_method', Sale.PaymentMethod.CASH),
                status=sale_record.get('status', Sale.Status.COMPLETED),
                subtotal=sale_record.get('subtotal', 0),
                discount_amount=sale_record.get('discount_amount', 0),
                tax_amount=sale_record.get('tax_amount', 0),
                total_amount=sale_record.get('total_amount', 0),
                cashier_name=sale_record.get('cashier_name', ''),
                customer_name=sale_record.get('customer_name', ''),
                notes=sale_record.get('notes', ''),
            )

            sale_items = sale_record.get('items', [])
            if not isinstance(sale_items, list) or not sale_items:
                raise ValueError("Sale sync record must include at least one item")

            for sale_item in sale_items:
                if not isinstance(sale_item, dict):
                    raise ValueError(f"Invalid sale item in sync record: {sale_item!r}")
                variant = resolve_variant(sale_item)
                if not variant:
                    raise ValueError(
                        f"Sale variant not found for sync item: {sale_item!r}"
                    )

                quantity = abs(int(sale_item.get('quantity', 0)))
                if quantity == 0:
                    raise ValueError(f"Sale item quantity must be non-zero: {sale_item!r}")

                raw_unit_price = sale_item.get('unit_price')
                raw_unit_cost = sale_item.get('unit_cost')
                raw_discount = sale_item.get('discount_amount')
                unit_price = Decimal(str(
                    variant.price if raw_unit_price is None else raw_unit_price
                ))
                unit_cost = Decimal(str(
                    variant.cost if raw_unit_cost is None else raw_unit_cost
                ))
                discount_amount = Decimal(str(
                    0 if raw_discount is None else raw_discount
                ))
                raw_line_total = sale_item.get('line_total')
                line_total = Decimal(str(
                    (unit_price * quantity) - discount_amount
                    if raw_line_total is None
                    else raw_line_total
                ))
                variant_ledger_entries = ledger_entries_by_variant.get(variant.pk, [])
                ledger_entry = next(
                    (entry for entry in variant_ledger_entries if entry.delta == -quantity),
                    None,
                )
                if ledger_entry is None:
                    raise ValueError(
                        f"Sale item has no matching inventory event: {sale_item!r}"
                    )
                variant_ledger_entries.remove(ledger_entry)
                SaleItem.objects.create(
                    sale=sale,
                    variant=variant,
                    quantity=quantity,
                    unit_price=unit_price,
                    unit_cost=unit_cost,
                    discount_amount=discount_amount,
                    line_total=line_total,
                    ledger_entry=ledger_entry,
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


def server_events_for_store_queryset(store_identifier):
    """
    Retrieve events for one store plus truly global events. Warehouse events also
    have a null FK, so exclude them using their explicit STORAGE payload scope.
    """
    store = resolve_store(store_identifier) if store_identifier else None
    global_events = Q(store__isnull=True) & ~Q(payload__store_code='STORAGE')
    if store:
        return ServerEvent.objects.filter(Q(store=store) | global_events)
    return ServerEvent.objects.filter(global_events)


def get_server_events_for_store(store_identifier, after_seq=0, limit=500):
    """Return one store's ordered events and global events after a sequence."""
    queryset = server_events_for_store_queryset(store_identifier).filter(
        seq_id__gt=after_seq
    )

    limit = max(1, min(limit, 1000))
    return list(queryset.select_related('store').order_by('seq_id')[:limit])
