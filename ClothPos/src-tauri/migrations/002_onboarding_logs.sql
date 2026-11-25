-- First-launch flag lives in settings.initialized.
-- action_logs is the local audit/outbox: every POS action is written here
-- and later flushed in a single batch to POST /api/sync/push/.

CREATE TABLE IF NOT EXISTS action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    action TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    last_error TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_action_logs_status ON action_logs(status);
CREATE INDEX IF NOT EXISTS idx_action_logs_created ON action_logs(created_at);
