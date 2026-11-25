DROP TABLE IF EXISTS applied_sync_confirms;
DELETE FROM settings
WHERE key IN ('pending_confirm_receipt', 'sync_version');
