CREATE TABLE IF NOT EXISTS sync_export_batches (
    batch_id TEXT PRIMARY KEY,
    export_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    applied_at TEXT
);
