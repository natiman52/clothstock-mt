use crate::error::{PosError, PosResult};
use crate::models::TerminalSettings;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const MIGRATIONS: &[(i64, &str, &str)] = &[
    (1, "001_init", include_str!("../migrations/001_init.sql")),
    (
        2,
        "002_onboarding_logs",
        include_str!("../migrations/002_onboarding_logs.sql"),
    ),
    (
        3,
        "003_acknowledged_sync",
        include_str!("../migrations/003_acknowledged_sync.sql"),
    ),
    (
        4,
        "004_sync_export_batches",
        include_str!("../migrations/004_sync_export_batches.sql"),
    ),
    (
        5,
        "005_remove_confirmation_state",
        include_str!("../migrations/005_remove_confirmation_state.sql"),
    ),
];

pub fn open_and_migrate(app: &AppHandle) -> PosResult<Connection> {
    let dir = app_data_dir(app)?;
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("clothpos.sqlite");
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    run_migrations(&conn)?;
    seed_default_settings(&conn)?;
    Ok(conn)
}

fn app_data_dir(app: &AppHandle) -> PosResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|e| PosError::msg(format!("Could not resolve app data directory: {e}")))
}

fn run_migrations(conn: &Connection) -> PosResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );",
    )?;

    let applied: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT version FROM schema_migrations")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        out
    };

    for (version, name, sql) in MIGRATIONS {
        if applied.contains(version) {
            continue;
        }
        conn.execute_batch(sql)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, datetime('now'))",
            params![version, name],
        )?;
    }
    Ok(())
}

fn seed_default_settings(conn: &Connection) -> PosResult<()> {
    let defaults = [
        ("api_url", "http://localhost:8001"),
        ("store_id", ""),
        ("store_code", ""),
        ("store_name", ""),
        ("auth_token", ""),
        ("username", ""),
        ("cashier_name", "POS Cashier"),
        ("last_applied_seq", "0"),
        ("last_synced_at", ""),
        ("last_sync_error", ""),
        ("device_id", ""),
        ("device_secret", ""),
        ("active_sync_export", ""),
        ("initialized", "0"),
        ("password_hash", ""),
    ];
    for (key, value) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
    }
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> PosResult<String> {
    let value = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional_setting()?;
    Ok(value.unwrap_or_default())
}

trait OptionalSetting<T> {
    fn optional_setting(self) -> rusqlite::Result<Option<T>>;
}

impl<T> OptionalSetting<T> for rusqlite::Result<T> {
    fn optional_setting(self) -> rusqlite::Result<Option<T>> {
        match self {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> PosResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn load_settings(conn: &Connection) -> PosResult<TerminalSettings> {
    let token = get_setting(conn, "auth_token")?;
    Ok(TerminalSettings {
        api_url: get_setting(conn, "api_url")?,
        store_id: get_setting(conn, "store_id")?,
        store_code: get_setting(conn, "store_code")?,
        store_name: get_setting(conn, "store_name")?,
        auth_token: token.clone(),
        username: get_setting(conn, "username")?,
        cashier_name: get_setting(conn, "cashier_name")?,
        last_applied_seq: get_setting(conn, "last_applied_seq")?.parse().unwrap_or(0),
        has_token: !token.is_empty(),
        initialized: get_setting(conn, "initialized")? == "1",
    })
}

pub fn is_initialized(conn: &Connection) -> PosResult<bool> {
    Ok(get_setting(conn, "initialized")? == "1")
}

/// Append an immutable local action record. Flushed later by `flush_logs`.
pub fn log_action(
    conn: &Connection,
    action: &str,
    payload: &serde_json::Value,
) -> PosResult<String> {
    let event_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO action_logs (event_id, action, payload_json, status, created_at)
         VALUES (?1, ?2, ?3, 'PENDING', datetime('now'))",
        rusqlite::params![event_id, action, payload.to_string()],
    )?;
    Ok(event_id)
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    #[test]
    fn removes_obsolete_confirmation_state() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE applied_sync_confirms (
                 confirm_id TEXT PRIMARY KEY,
                 receipt_json TEXT NOT NULL,
                 applied_at TEXT NOT NULL
             );
             INSERT INTO settings (key, value) VALUES
                 ('pending_confirm_receipt', 'receipt'),
                 ('sync_version', '2');
             INSERT INTO applied_sync_confirms VALUES ('confirm', '{}', 'now');",
        )
        .unwrap();

        conn.execute_batch(include_str!(
            "../migrations/005_remove_confirmation_state.sql"
        ))
        .unwrap();

        let settings_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM settings WHERE key IN ('pending_confirm_receipt', 'sync_version')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let confirmations_table_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'applied_sync_confirms'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(settings_count, 0);
        assert_eq!(confirmations_table_exists, 0);
    }
}
