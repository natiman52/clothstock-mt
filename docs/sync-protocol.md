# Store synchronization protocol

## Automatic POS sync

ClothPos uses authenticated, signed event pushes and registered-device-scoped
server-event pulls:

1. `POST /api/sync/register/` registers `(store_id, device_id)` and returns its
   HMAC key. The user must be assigned to that store.
2. `POST /api/sync/push/` sends the signed local outbox. The server validates
   the signature and store assignment, processes event UUIDs idempotently, and
   returns the accepted `acked_event_ids`.
3. ClothPos marks only those acknowledged local events `SYNCED`.
4. `GET /api/sync/pull/?device_id=<id>&after_seq=<seq>&limit=500` derives the
   store from the registered device and authenticated user's store assignment.
   It returns only that store's events and global events, in ascending
   `seq_id` order. Warehouse events also have a null store FK, so events marked
   with `payload.store_code: "STORAGE"` are explicitly excluded.
5. Each event page and the client's applied cursor are committed together in
   SQLite. After pulling, `POST /api/sync/state/` reports the client's cursor.

Event UUIDs make retrying a push safe. Server `seq_id` values make replaying a
pull safe. Store membership is always checked on the server; a client-supplied
store ID is never used to determine pull scope.

## Local export and server-event import files

All JSON uses `schema_version: "1.0"`. POS event exports are signed with the
device HMAC key. The owner dashboard validates the signature and can process
the export at `POST /api/sync/bundle/`. The dashboard response includes events
for the selected store that the POS can import directly. It does not generate
a confirmation or receipt.

### POS outbox export (`clothstock.store-export`)

```json
{
  "schema_version": "1.0",
  "file_type": "clothstock.store-export",
  "batch_id": "62c87f20-e1bf-4e31-bf51-5c137f638156",
  "store_id": "12",
  "device_id": "pos-7b6a74cb-9425-46ad-b24d-03b2f957fc19",
  "app_version": "0.1.0",
  "exported_at": "2026-11-23T20:30:00Z",
  "last_applied_seq": 41,
  "pending_events": [
    {
      "event_id": "cd91f48c-cab9-4bf0-85fb-511dce17d031",
      "local_seq": 107,
      "event_type": "SALE",
      "created_at": "2026-11-23T20:25:00Z",
      "payload": {"sale_id": "9093c27b-2932-4c36-aadd-6236406179ec"}
    }
  ],
  "signature": {"algorithm": "HMAC-SHA256", "value": "<hex>"}
}
```

An event remains unsynced after export. Its stable event UUID allows safe
re-export and server deduplication. It is marked synced only after an online
push response acknowledges its UUID.

### Server-event import (`clothstock.server-event-export`)

```json
{
  "schema_version": "1.0",
  "file_type": "clothstock.server-event-export",
  "generated_at": "2026-11-23T20:30:00Z",
  "store_id": 12,
  "after_seq": 41,
  "latest_seq": 43,
  "next_after_seq": null,
  "has_more": false,
  "count": 1,
  "events": [
    {
      "seq_id": 42,
      "store_id": 12,
      "event_type": "INVENTORY_DELTA",
      "payload": {"variant_id": "09f620a8-2584-48b0-8aa1-258f25a85db8", "delta": -1},
      "created_at": "2026-11-23T20:27:00Z"
    }
  ]
}
```

ClothPos accepts only an export for its own store. It validates ordered
sequences and imports the events and cursor update in one SQLite transaction.
Re-importing the same range is safe because sequences at or below the local
cursor are skipped. Do not import an `all stores` owner export into a POS.

## Events and inventory

- Local business event: `PENDING` or `EXPORTED` (still unsynced) → `SYNCED`
  only after server acknowledgement.
- Audit logs are not business events and are not included in the exported
  outbox.
- Server inventory events use deltas, with `resulting_balance` retained only
  for diagnostics. Clients apply a delta once by `seq_id`; they must not
  replace local stock with a stale snapshot. Transfers emit the inbound delta
  for the destination store. Before applying an inventory event, ClothPos
  requires its store FK or explicit payload store identifier to match the
  enrolled store. A nonmatching or unscoped inventory event is skipped while
  later events in the same page continue to be processed.
- Failed or partially accepted pushes leave unacknowledged events in the
  outbox for retry. A crash during a server-event page transaction advances
  neither the event data nor its cursor.

## Endpoints

- `POST /api/sync/register/`: authenticated device registration for an assigned
  store.
- `POST /api/sync/push/`: authenticated and signed outbox push; returns accepted
  `acked_event_ids`.
- `GET /api/sync/pull/`: store-scoped, cursor-paginated server-event pull. The
  store comes from registered `device_id`, not a request store parameter.
- `POST /api/sync/state/`: records a device's locally committed cursor.
- `POST /api/sync/bundle/`: owner-dashboard processing for signed POS exports;
  returns accepted event IDs and server events for direct import.
- `GET /api/sync/events/export/`: owner-only event file export. Select one store
  for POS import; the `all` option is for administrative export only.

The former `SyncBatch`, `SyncConfirm`, and `SyncAcknowledgement` persistence and
their import/receipt API routes are removed. Existing installations must apply
the Django migration that finalizes previously awaiting sync events and drops
the three tables.
