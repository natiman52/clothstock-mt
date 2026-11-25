CREATE TABLE IF NOT EXISTS applied_sync_confirms (
    confirm_id TEXT PRIMARY KEY,
    receipt_json TEXT NOT NULL,
    applied_at TEXT NOT NULL
);
