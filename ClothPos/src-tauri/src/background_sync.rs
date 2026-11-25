use crate::db::{get_setting, now_iso, set_setting};
use crate::error::{PosError, PosResult};
use crate::models::SyncResult;
use crate::{sync, DbState};
use hmac::{Hmac, Mac};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::Sha256;
use std::collections::HashSet;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

const INITIAL_RETRY: Duration = Duration::from_secs(5);
const MAX_RETRY: Duration = Duration::from_secs(300);
const POLL_INTERVAL: Duration = Duration::from_secs(15);

pub struct SyncRuntime {
    client: reqwest::Client,
    push_lock: Mutex<()>,
    active_workers: AtomicUsize,
    errors: Mutex<DirectionErrors>,
}

#[derive(Default)]
struct DirectionErrors {
    pull: Option<String>,
    push: Option<String>,
}

impl SyncRuntime {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
            push_lock: Mutex::new(()),
            active_workers: AtomicUsize::new(0),
            errors: Mutex::new(DirectionErrors::default()),
        }
    }

    pub fn is_syncing(&self) -> bool {
        self.active_workers.load(Ordering::Relaxed) > 0
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerEventsReceived {
    count: usize,
    last_applied_seq: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncStatusChanged {
    syncing: bool,
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut retry = INITIAL_RETRY;
        loop {
            let runtime = app.state::<SyncRuntime>();
            match push_pending(&app, &runtime).await {
                Ok(_) => retry = POLL_INTERVAL,
                Err(error) => {
                    eprintln!("Background acknowledged sync failed: {error}");
                    retry = retry.saturating_mul(2).min(MAX_RETRY);
                }
            }
            tokio::time::sleep(retry).await;
        }
    });
}

pub async fn sync_now(app: &AppHandle, runtime: &SyncRuntime) -> PosResult<SyncResult> {
    let (pushed, pulled) = push_pending(app, runtime).await?;
    let last_applied_seq = {
        let state = app.state::<DbState>();
        let db = state.conn.lock().expect("database mutex poisoned");
        parse_seq(&get_setting(&db, "last_applied_seq")?)?
    };
    Ok(SyncResult {
        pulled,
        pushed,
        catalog_imported: 0,
        errors: Vec::new(),
        last_applied_seq,
    })
}

async fn push_pending(app: &AppHandle, runtime: &SyncRuntime) -> PosResult<(usize, usize)> {
    let _direction = runtime.push_lock.lock().await;
    runtime.active_workers.fetch_add(1, Ordering::Relaxed);
    emit_status(app, runtime);
    let result = push_pending_inner(app, runtime).await;
    runtime.active_workers.fetch_sub(1, Ordering::Relaxed);

    match &result {
        Ok(_) => record_success(app, runtime, false).await?,
        Err(error) => record_failure(app, runtime, false, error.to_string()).await?,
    }
    emit_status(app, runtime);
    result
}

async fn push_pending_inner(app: &AppHandle, runtime: &SyncRuntime) -> PosResult<(usize, usize)> {
    let (api_url, token, store_id, store_code, device_id, device_secret) =
        register_device(app, runtime).await?;
    refresh_categories_if_needed(app, runtime, &api_url, &token).await?;

    let export = {
        let state = app.state::<DbState>();
        let mut db = state.conn.lock().expect("database mutex poisoned");
        create_or_load_export(&mut db, &store_id, &store_code, &device_id, &device_secret)?
    };

    let url = format!("{}/api/sync/push/", api_url.trim_end_matches('/'));
    let response = runtime
        .client
        .post(url)
        .headers(auth_headers(&token)?)
        .json(&export)
        .send()
        .await?;
    let status = response.status();
    let body = response.text().await?;
    if !status.is_success() {
        return Err(PosError::msg(format!(
            "sync/push HTTP {status}: {}",
            body.trim()
        )));
    }
    let push_result: Value = serde_json::from_str(&body)?;
    let acked_ids = push_result["acked_event_ids"]
        .as_array()
        .ok_or_else(|| PosError::msg("sync/push response did not contain acked_event_ids"))?
        .iter()
        .map(|value| {
            value.as_str().map(str::to_owned).ok_or_else(|| {
                PosError::msg("sync/push returned a non-string event acknowledgement")
            })
        })
        .collect::<PosResult<HashSet<_>>>()?;
    let exported_ids: HashSet<String> = export["pending_events"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|event| event["event_id"].as_str().map(str::to_owned))
        .collect();
    if acked_ids
        .iter()
        .any(|event_id| !exported_ids.contains(event_id))
    {
        return Err(PosError::msg(
            "sync/push acknowledged an event that was not in the submitted export.",
        ));
    }

    for event in export["pending_events"].as_array().into_iter().flatten() {
        let event_id = event["event_id"].as_str().unwrap_or("<missing>");
        if !acked_ids.contains(event_id) {
            continue;
        }
        let payload = event.get("payload").unwrap_or(&Value::Null);
        eprintln!(
            "[sync] pushed event: event_id={event_id}, type={}, store_id={}, \
             store_code={}, variant_id={}, delta={}, quantity_on_hand={}, origin_event_id={}",
            event["event_type"].as_str().unwrap_or("<missing>"),
            payload.get("store_id").unwrap_or(&Value::Null),
            payload.get("store_code").unwrap_or(&Value::Null),
            payload.get("variant_id").unwrap_or(&Value::Null),
            payload.get("delta").unwrap_or(&Value::Null),
            payload.get("quantity_on_hand").unwrap_or(&Value::Null),
            payload.get("origin_event_id").unwrap_or(&Value::Null),
        );
    }

    let acknowledged = apply_push_acknowledgements(app, &export, &acked_ids)?;
    let mut cursor = {
        let state = app.state::<DbState>();
        let db = state.conn.lock().expect("database mutex poisoned");
        parse_seq(&get_setting(&db, "last_applied_seq")?)?
    };
    let mut pulled = 0;
    loop {
        let url = format!(
            "{}/api/sync/pull/?device_id={}&after_seq={cursor}&limit=500",
            api_url.trim_end_matches('/'),
            device_id,
        );
        let response = runtime
            .client
            .get(url)
            .headers(auth_headers(&token)?)
            .send()
            .await?;
        let status = response.status();
        let body = response.text().await?;
        if !status.is_success() {
            return Err(PosError::msg(format!(
                "sync/pull HTTP {status}: {}",
                body.trim()
            )));
        }
        let page: Value = serde_json::from_str(&body)?;
        if page["store_id"].as_str() != Some(store_id.as_str()) {
            return Err(PosError::msg(
                "sync/pull returned events for a different store.",
            ));
        }
        let events = page["server_events"]
            .as_array()
            .ok_or_else(|| PosError::msg("sync/pull response did not contain server_events"))?;
        let next_cursor = page["latest_seq"]
            .as_i64()
            .ok_or_else(|| PosError::msg("sync/pull returned an invalid latest_seq"))?;
        let has_more = page["has_more"].as_bool().unwrap_or(false);
        if has_more && next_cursor <= cursor {
            return Err(PosError::msg(
                "sync/pull pagination did not advance its sequence cursor.",
            ));
        }
        pulled +=
            apply_server_event_page(app, events, cursor, next_cursor, &store_id, &store_code)?;
        cursor = next_cursor;
        if !has_more {
            break;
        }
    }

    report_sync_state(runtime, &api_url, &token, &device_id, cursor).await?;
    Ok((acknowledged, pulled))
}

async fn refresh_categories_if_needed(
    app: &AppHandle,
    runtime: &SyncRuntime,
    api_url: &str,
    token: &str,
) -> PosResult<()> {
    let needs_bootstrap = {
        let state = app.state::<DbState>();
        let db = state.conn.lock().expect("database mutex poisoned");
        get_setting(&db, "categories_bootstrapped")? != "1"
    };
    if !needs_bootstrap {
        return Ok(());
    }

    let mut categories = Vec::new();
    for page_number in 1..=50 {
        let url = format!(
            "{}/api/categories/?page={page_number}",
            api_url.trim_end_matches('/')
        );
        let response = runtime
            .client
            .get(url)
            .headers(auth_headers(token)?)
            .send()
            .await?;
        let status = response.status();
        let body = response.text().await?;
        if !status.is_success() {
            return Err(PosError::msg(format!(
                "Could not bootstrap POS categories: HTTP {status}: {}",
                body.trim()
            )));
        }
        let page: Value = serde_json::from_str(&body)?;
        let page_items = if let Some(results) = page.get("results").and_then(Value::as_array) {
            results
        } else if let Some(items) = page.as_array() {
            categories.extend(items.iter().cloned());
            break;
        } else {
            return Err(PosError::msg(
                "Category endpoint returned neither a results array nor a JSON array.",
            ));
        };
        categories.extend(page_items.iter().cloned());
        if page.get("next").is_none_or(Value::is_null) {
            break;
        }
        if page_number == 50 {
            return Err(PosError::msg(
                "Category bootstrap exceeded the 50-page safety limit.",
            ));
        }
    }

    let state = app.state::<DbState>();
    let mut db = state.conn.lock().expect("database mutex poisoned");
    let tx = db.transaction()?;
    for category in &categories {
        if !sync::upsert_category(&tx, category)? {
            return Err(PosError::msg(
                "Category endpoint returned a record without an integer id.",
            ));
        }
    }
    set_setting(&tx, "categories_bootstrapped", "1")?;
    let cursor = parse_seq(&get_setting(&tx, "last_applied_seq")?)?;
    tx.commit()?;

    if !categories.is_empty() {
        app.emit(
            "sync://server-events",
            ServerEventsReceived {
                count: categories.len(),
                last_applied_seq: cursor,
            },
        )
        .map_err(|error| {
            PosError::msg(format!(
                "Could not notify the frontend about the category refresh: {error}"
            ))
        })?;
    }
    eprintln!(
        "[sync] bootstrapped {} categories from server",
        categories.len()
    );
    Ok(())
}

fn apply_push_acknowledgements(
    app: &AppHandle,
    export: &Value,
    acknowledged_ids: &HashSet<String>,
) -> PosResult<usize> {
    let state = app.state::<DbState>();
    let mut db = state.conn.lock().expect("database mutex poisoned");
    let tx = db.transaction()?;
    let events = export["pending_events"]
        .as_array()
        .ok_or_else(|| PosError::msg("Saved export is missing pending_events."))?;
    let mut acknowledged = 0;
    for event in events {
        let event_id = required_string(event, "event_id")?;
        if !acknowledged_ids.contains(&event_id) {
            continue;
        }
        tx.execute(
            "UPDATE pending_sync_events SET status = 'SYNCED', last_error = NULL WHERE event_id = ?1",
            params![event_id],
        )?;
        if let Some(sale_id) = event["payload"]["sale_id"].as_str() {
            tx.execute(
                "UPDATE sales SET sync_status = 'SYNCED' WHERE id = ?1",
                params![sale_id],
            )?;
        }
        acknowledged += 1;
    }
    let batch_id = required_string(export, "batch_id")?;
    tx.execute(
        "UPDATE sync_export_batches SET applied_at = ?1 WHERE batch_id = ?2",
        params![now_iso(), batch_id],
    )?;
    if get_setting(&tx, "active_sync_export")?
        .parse::<Value>()
        .ok()
        .and_then(|document| document["batch_id"].as_str().map(str::to_owned))
        .as_deref()
        == Some(batch_id.as_str())
    {
        set_setting(&tx, "active_sync_export", "")?;
    }
    tx.commit()?;
    Ok(acknowledged)
}

fn apply_server_event_page(
    app: &AppHandle,
    events: &[Value],
    current_cursor: i64,
    next_cursor: i64,
    store_id: &str,
    store_code: &str,
) -> PosResult<usize> {
    eprintln!(
        "[sync] apply_server_event_page: current_cursor={current_cursor}, \
         next_cursor={next_cursor}, store_id={store_id}, store_code={store_code}, \
         events_count={}",
        events.len()
    );
    let state = app.state::<DbState>();
    let mut db = state.conn.lock().expect("database mutex poisoned");
    let tx = db.transaction()?;
    let persisted_cursor = parse_seq(&get_setting(&tx, "last_applied_seq")?)?;
    if current_cursor > persisted_cursor {
        return Err(PosError::msg(format!(
            "Requested page starts after cursor {current_cursor}, but local state is only committed through {persisted_cursor}."
        )));
    }

    let mut previous_seq = None;
    let mut applied = 0;
    for raw_event in events {
        let event = sync::ServerEvent::parse(raw_event)?;
        let seq_id = event.seq_id;
        if previous_seq.is_some_and(|previous| seq_id <= previous) {
            return Err(PosError::msg(
                "Server event page is duplicated or not ordered by seq_id.",
            ));
        }
        previous_seq = Some(seq_id);
        if seq_id <= persisted_cursor {
            eprintln!(
                "[sync] skipped already-committed server event: seq_id={seq_id}, \
                 persisted_cursor={persisted_cursor}"
            );
            continue;
        }
        let payload = raw_event.get("payload").unwrap_or(&Value::Null);
        eprintln!(
            "[sync] event: seq_id={seq_id}, type={}, store_fk={}, \
             payload_store_id={}, payload_store_code={}, variant_id={}, \
             delta={}, quantity_on_hand={}, origin_event_id={}",
            raw_event
                .get("event_type")
                .and_then(Value::as_str)
                .unwrap_or("<missing>"),
            raw_event.get("store").unwrap_or(&Value::Null),
            payload.get("store_id").unwrap_or(&Value::Null),
            payload.get("store_code").unwrap_or(&Value::Null),
            payload.get("variant_id").unwrap_or(&Value::Null),
            payload.get("delta").unwrap_or(&Value::Null),
            payload.get("quantity_on_hand").unwrap_or(&Value::Null),
            payload.get("origin_event_id").unwrap_or(&Value::Null),
        );
        sync::apply_server_event(&tx, &event, store_id, store_code)?;
        applied += 1;
    }
    if next_cursor < current_cursor || previous_seq.is_some_and(|last_seq| last_seq > next_cursor) {
        return Err(PosError::msg("Server event page cursor moved backwards."));
    }
    let committed_cursor = persisted_cursor.max(next_cursor);
    set_setting(&tx, "last_applied_seq", &committed_cursor.to_string())?;
    tx.commit()?;
    eprintln!(
        "[sync] apply_server_event_page committed: processed_events={applied}, \
         cursor={committed_cursor}"
    );

    if applied > 0 {
        app.emit(
            "sync://server-events",
            ServerEventsReceived {
                count: applied,
                last_applied_seq: committed_cursor,
            },
        )
        .map_err(|error| {
            PosError::msg(format!(
                "Could not notify the frontend about server events: {error}"
            ))
        })?;
    }
    Ok(applied)
}

async fn report_sync_state(
    runtime: &SyncRuntime,
    api_url: &str,
    token: &str,
    device_id: &str,
    last_applied_seq: i64,
) -> PosResult<()> {
    let url = format!("{}/api/sync/state/", api_url.trim_end_matches('/'));
    let response = runtime
        .client
        .post(url)
        .headers(auth_headers(&token)?)
        .json(&json!({
            "device_id": device_id,
            "last_applied_seq": last_applied_seq,
            "app_version": env!("CARGO_PKG_VERSION"),
        }))
        .send()
        .await?;
    let status = response.status();
    let body = response.text().await?;
    if !status.is_success() {
        return Err(PosError::msg(format!(
            "sync/state HTTP {status}: {}",
            body.trim()
        )));
    }
    Ok(())
}

pub async fn export_status(app: &AppHandle, runtime: &SyncRuntime) -> PosResult<Value> {
    let (api_url, token, store_id, store_code, device_id, device_secret) =
        register_device(app, runtime).await?;
    let _ = (api_url, token);
    let state = app.state::<DbState>();
    let mut db = state.conn.lock().expect("database mutex poisoned");
    create_or_load_export(&mut db, &store_id, &store_code, &device_id, &device_secret)
}

pub fn import_server_events_json(app: &AppHandle, source: &str) -> PosResult<String> {
    let document = parse_server_event_export(source)?;
    let events = document["events"]
        .as_array()
        .ok_or_else(|| PosError::msg("Server event file must contain an events array."))?;
    let after_seq = document["after_seq"]
        .as_i64()
        .ok_or_else(|| PosError::msg("Server event file after_seq must be an integer."))?;
    let latest_seq = document["latest_seq"]
        .as_i64()
        .ok_or_else(|| PosError::msg("Server event file latest_seq must be an integer."))?;
    let state = app.state::<DbState>();
    let mut db = state.conn.lock().expect("database mutex poisoned");
    let local_store_id = get_setting(&db, "store_id")?;
    let local_store_code = get_setting(&db, "store_code")?;
    let export_store_id = document
        .get("store_id")
        .filter(|value| !value.is_null())
        .and_then(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .or_else(|| value.as_i64().map(|number| number.to_string()))
        })
        .ok_or_else(|| {
            PosError::msg("Server event file must identify exactly one target store.")
        })?;
    if export_store_id != local_store_id && !export_store_id.eq_ignore_ascii_case(&local_store_code)
    {
        return Err(PosError::msg(
            "Server event file belongs to a different store.",
        ));
    }

    let current_seq = parse_seq(&get_setting(&db, "last_applied_seq")?)?;
    if after_seq > current_seq {
        return Err(PosError::msg(format!(
            "Server event file starts at sequence {after_seq}, ahead of this POS cursor {current_seq}; import the missing range first.",
        )));
    }
    let parsed_events = events
        .iter()
        .map(sync::ServerEvent::parse)
        .collect::<PosResult<Vec<_>>>()?;
    let applied = parsed_events
        .iter()
        .filter(|event| event.seq_id > current_seq)
        .count();
    let tx = db.transaction()?;
    let mut previous_seq = None;
    for event in &parsed_events {
        if previous_seq.is_some_and(|previous| event.seq_id <= previous) {
            return Err(PosError::msg(
                "Server event file is duplicated or not ordered by seq_id.",
            ));
        }
        previous_seq = Some(event.seq_id);
        if event.seq_id <= current_seq {
            continue;
        }
        sync::apply_server_event(&tx, event, &local_store_id, &local_store_code)?;
    }
    let next_seq = current_seq.max(latest_seq);
    set_setting(&tx, "last_applied_seq", &next_seq.to_string())?;
    tx.commit()?;
    Ok(format!(
        "Server events imported: {applied} applied, cursor now {next_seq}.",
    ))
}

fn parse_server_event_export(source: &str) -> PosResult<Value> {
    let document: Value = serde_json::from_str(source)
        .map_err(|error| PosError::msg(format!("Server event file is not valid JSON: {error}")))?;
    if document.get("schema_version").and_then(Value::as_str) != Some("1.0")
        || document.get("file_type").and_then(Value::as_str)
            != Some("clothstock.server-event-export")
    {
        return Err(PosError::msg(
            "Expected schema_version 1.0 and file_type clothstock.server-event-export.",
        ));
    }
    if document
        .get("store_id")
        .filter(|value| !value.is_null())
        .is_none_or(|value| value.as_str().is_none() && value.as_i64().is_none())
    {
        return Err(PosError::msg(
            "Server event file must identify exactly one target store.",
        ));
    }

    let events = document["events"]
        .as_array()
        .ok_or_else(|| PosError::msg("Server event file must contain an events array."))?;
    let after_seq = document["after_seq"]
        .as_i64()
        .ok_or_else(|| PosError::msg("Server event file after_seq must be an integer."))?;
    let latest_seq = document["latest_seq"]
        .as_i64()
        .ok_or_else(|| PosError::msg("Server event file latest_seq must be an integer."))?;
    if after_seq < 0 || latest_seq < after_seq {
        return Err(PosError::msg(
            "Server event file has an invalid sequence range.",
        ));
    }
    if document.get("count").and_then(Value::as_u64) != Some(events.len() as u64) {
        return Err(PosError::msg(
            "Server event file count does not match its events array.",
        ));
    }

    let mut previous_seq = after_seq;
    for event in events {
        let seq_id = event
            .get("seq_id")
            .and_then(Value::as_i64)
            .ok_or_else(|| PosError::msg("A server event is missing its integer seq_id."))?;
        if seq_id <= previous_seq || seq_id > latest_seq {
            return Err(PosError::msg(
                "Server events must be uniquely ordered and within the declared cursor range.",
            ));
        }
        if event.get("event_type").and_then(Value::as_str).is_none()
            || !event.get("payload").is_some_and(Value::is_object)
        {
            return Err(PosError::msg(
                "Each server event requires an event_type and object payload.",
            ));
        }
        previous_seq = seq_id;
    }
    Ok(document)
}

async fn register_device(
    app: &AppHandle,
    runtime: &SyncRuntime,
) -> PosResult<(String, String, String, String, String, String)> {
    let (api_url, token, mut store_id, store_code, mut device_id, mut secret) = {
        let state = app.state::<DbState>();
        let db = state.conn.lock().expect("database mutex poisoned");
        (
            get_setting(&db, "api_url")?,
            get_setting(&db, "auth_token")?,
            get_setting(&db, "store_id")?,
            get_setting(&db, "store_code")?,
            get_setting(&db, "device_id")?,
            get_setting(&db, "device_secret")?,
        )
    };
    if api_url.trim().is_empty() {
        return Err(PosError::msg(
            "Set the ClothStock API URL in Settings first.",
        ));
    }
    if token.is_empty() {
        return Err(PosError::msg(
            "This terminal has no API token. Sign in to the server before syncing.",
        ));
    }
    if store_id.is_empty() && store_code.is_empty() {
        return Err(PosError::msg(
            "This terminal is not assigned to a store. Complete store setup before syncing.",
        ));
    }
    if device_id.is_empty() {
        device_id = format!("pos-{}", uuid::Uuid::new_v4());
        let state = app.state::<DbState>();
        let db = state.conn.lock().expect("database mutex poisoned");
        set_setting(&db, "device_id", &device_id)?;
    }
    if secret.is_empty() {
        let url = format!("{}/api/sync/register/", api_url.trim_end_matches('/'));
        let response = runtime
            .client
            .post(url)
            .headers(auth_headers(&token)?)
            .json(&json!({
                "store_id": if store_id.is_empty() { &store_code } else { &store_id },
                "device_id": device_id,
                "app_version": env!("CARGO_PKG_VERSION"),
            }))
            .send()
            .await?;
        let response_status = response.status();
        let body = response.text().await?;
        if !response_status.is_success() {
            return Err(PosError::msg(format!(
                "sync/register HTTP {response_status}: {}",
                body.trim()
            )));
        }
        let body: Value = serde_json::from_str(&body)?;
        secret = body
            .get("device_secret")
            .and_then(Value::as_str)
            .ok_or_else(|| PosError::msg("sync/register did not return a device secret"))?
            .to_owned();
        store_id = body
            .get("store_id")
            .and_then(Value::as_str)
            .unwrap_or(&store_id)
            .to_owned();
        let state = app.state::<DbState>();
        let db = state.conn.lock().expect("database mutex poisoned");
        set_setting(&db, "device_secret", &secret)?;
        set_setting(&db, "store_id", &store_id)?;
    }

    Ok((api_url, token, store_id, store_code, device_id, secret))
}

fn create_or_load_export(
    db: &mut rusqlite::Connection,
    store_id: &str,
    store_code: &str,
    device_id: &str,
    device_secret: &str,
) -> PosResult<Value> {
    let tx = db.transaction()?;
    let legacy_export = get_setting(&tx, "active_sync_export")?;
    if !legacy_export.is_empty() {
        let legacy_document: Value = serde_json::from_str(&legacy_export)?;
        if !verify_document(&legacy_document, device_secret)? {
            return Err(PosError::msg(
                "Saved store export signature is invalid; refusing to reuse this batch.",
            ));
        }
        let legacy_batch_id = required_string(&legacy_document, "batch_id")?;
        let batch_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM sync_export_batches WHERE batch_id = ?1)",
            params![legacy_batch_id],
            |row| row.get(0),
        )?;
        if !batch_exists {
            tx.execute(
                "INSERT INTO sync_export_batches (batch_id, export_json, created_at)
                 VALUES (?1, ?2, ?3)",
                params![legacy_batch_id, legacy_export, now_iso()],
            )?;
        }
    }

    let mut pending = Vec::new();
    {
        let mut stmt = tx.prepare(
            "SELECT event_id, event_type, payload_json, created_at FROM pending_sync_events
             WHERE status IN ('PENDING', 'EXPORTED')
             ORDER BY created_at ASC, event_id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        for row in rows {
            pending.push(row?);
        }
    }
    let mut pending_events = Vec::with_capacity(pending.len());
    for (local_seq, (event_id, event_type, payload, created_at)) in pending.iter().enumerate() {
        pending_events.push(json!({
            "event_id": event_id,
            "local_seq": local_seq as i64 + 1,
            "event_type": event_type,
            "created_at": created_at,
            "payload": serde_json::from_str::<Value>(payload)?,
        }));
    }
    let mut last_applied_seq = get_setting(&tx, "last_applied_seq")?;
    if last_applied_seq.is_empty() {
        last_applied_seq = "0".into();
    }
    let mut export = json!({
        "schema_version": "1.0",
        "file_type": "clothstock.store-export",
        "batch_id": uuid::Uuid::new_v4().to_string(),
        "store_id": if store_id.is_empty() { store_code } else { store_id },
        "device_id": device_id,
        "app_version": env!("CARGO_PKG_VERSION"),
        "exported_at": now_iso(),
        "last_applied_seq": parse_seq(&last_applied_seq)?,
        "pending_events": pending_events,
    });
    sign_document(&mut export, device_secret)?;

    let open_export: Option<String> = tx
        .query_row(
            "SELECT export_json FROM sync_export_batches
             WHERE applied_at IS NULL
             ORDER BY created_at DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(open_export) = open_export {
        let open_export: Value = serde_json::from_str(&open_export)?;
        if !verify_document(&open_export, device_secret)? {
            return Err(PosError::msg(
                "Saved store export signature is invalid; refusing to reuse this batch.",
            ));
        }
        if open_export["store_id"] == export["store_id"]
            && open_export["device_id"] == export["device_id"]
            && open_export["last_applied_seq"] == export["last_applied_seq"]
            && open_export["pending_events"] == export["pending_events"]
        {
            return Ok(open_export);
        }
    }

    tx.execute(
        "UPDATE sync_export_batches SET applied_at = ?1 WHERE applied_at IS NULL",
        params![now_iso()],
    )?;
    tx.execute(
        "INSERT INTO sync_export_batches (batch_id, export_json, created_at)
         VALUES (?1, ?2, ?3)",
        params![
            export["batch_id"].as_str().unwrap_or_default(),
            export.to_string(),
            now_iso(),
        ],
    )?;
    for (event_id, _, _, _) in &pending {
        tx.execute(
            "UPDATE pending_sync_events SET status = 'EXPORTED' WHERE event_id = ?1",
            params![event_id],
        )?;
    }
    // Keep the latest export available to the manual file-transfer UI.
    set_setting(&tx, "active_sync_export", &export.to_string())?;
    tx.commit()?;
    Ok(export)
}

fn sign_document(document: &mut Value, secret: &str) -> PosResult<()> {
    let map = document
        .as_object_mut()
        .ok_or_else(|| PosError::msg("Cannot sign a non-object JSON document"))?;
    map.remove("signature");
    let bytes = serde_json::to_vec(&Value::Object(map.clone()))?;
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
        .map_err(|error| PosError::msg(format!("Invalid HMAC key: {error}")))?;
    mac.update(&bytes);
    map.insert(
        "signature".into(),
        json!({"algorithm": "HMAC-SHA256", "value": hex::encode(mac.finalize().into_bytes())}),
    );
    Ok(())
}

fn verify_document(document: &Value, secret: &str) -> PosResult<bool> {
    let mut unsigned = document.clone();
    let signature = unsigned
        .as_object_mut()
        .and_then(|map| map.remove("signature"))
        .ok_or_else(|| PosError::msg("Signed JSON is missing its signature"))?;
    if signature["algorithm"].as_str() != Some("HMAC-SHA256") {
        return Ok(false);
    }
    let supplied = signature["value"]
        .as_str()
        .ok_or_else(|| PosError::msg("Signature value must be a hex string"))?;
    let bytes = serde_json::to_vec(&unsigned)?;
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
        .map_err(|error| PosError::msg(format!("Invalid HMAC key: {error}")))?;
    mac.update(&bytes);
    let decoded = hex::decode(supplied)
        .map_err(|error| PosError::msg(format!("Signature is not valid hex: {error}")))?;
    Ok(mac.verify_slice(&decoded).is_ok())
}

fn required_string<'a>(value: &'a Value, key: &str) -> PosResult<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| PosError::msg(format!("JSON field '{key}' must be a non-empty string")))
}

fn auth_headers(token: &str) -> PosResult<reqwest::header::HeaderMap> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    if !token.is_empty() {
        let value = reqwest::header::HeaderValue::from_str(&format!("Token {token}"))
            .map_err(|error| PosError::msg(format!("Invalid auth token header: {error}")))?;
        headers.insert(reqwest::header::AUTHORIZATION, value);
    }
    Ok(headers)
}

async fn record_success(app: &AppHandle, runtime: &SyncRuntime, is_pull: bool) -> PosResult<()> {
    let mut errors = runtime.errors.lock().await;
    if is_pull {
        errors.pull = None;
    } else {
        errors.push = None;
    }
    persist_sync_metadata(app, errors_as_text(&errors), true)
}

async fn record_failure(
    app: &AppHandle,
    runtime: &SyncRuntime,
    is_pull: bool,
    message: String,
) -> PosResult<()> {
    let mut errors = runtime.errors.lock().await;
    if is_pull {
        errors.pull = Some(message);
    } else {
        errors.push = Some(message);
    }
    persist_sync_metadata(app, errors_as_text(&errors), false)
}

fn errors_as_text(errors: &DirectionErrors) -> String {
    [errors.pull.as_deref(), errors.push.as_deref()]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" | ")
}

fn parse_seq(value: &str) -> PosResult<i64> {
    value
        .parse()
        .map_err(|error| PosError::msg(format!("Invalid local last_applied_seq value: {error}")))
}

fn persist_sync_metadata(app: &AppHandle, error: String, synced: bool) -> PosResult<()> {
    let state = app.state::<DbState>();
    let db = state.conn.lock().expect("database mutex poisoned");
    if synced {
        set_setting(&db, "last_synced_at", &now_iso())?;
    }
    set_setting(&db, "last_sync_error", &error)
}

fn emit_status(app: &AppHandle, runtime: &SyncRuntime) {
    if let Err(error) = app.emit(
        "sync://status-changed",
        SyncStatusChanged {
            syncing: runtime.is_syncing(),
        },
    ) {
        eprintln!("Could not notify the frontend about sync status: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_server_event_export, verify_document};
    use serde_json::json;

    #[test]
    fn verifies_signature_created_from_server_canonical_json() {
        let mut document = json!({
            "schema_version": "1.0",
            "file_type": "clothstock.store-export",
            "store_id": "12",
            "pending_events": [],
            "signature": {
                "algorithm": "HMAC-SHA256",
                "value": "a487a76a7894c434fe19f32e070dd2d36ae6f42f9a7f71522f42170546aa298d"
            }
        });

        assert!(verify_document(&document, "shared-test-secret").unwrap());
        document["store_id"] = json!("13");
        assert!(!verify_document(&document, "shared-test-secret").unwrap());
    }

    #[test]
    fn accepts_ordered_server_event_export() {
        let document = json!({
            "schema_version": "1.0",
            "file_type": "clothstock.server-event-export",
            "store_id": 12,
            "after_seq": 40,
            "latest_seq": 42,
            "count": 1,
            "events": [{
                "seq_id": 42,
                "event_type": "VARIANT_UPDATED",
                "payload": {"id": "variant-id"}
            }]
        });

        assert!(parse_server_event_export(&document.to_string()).is_ok());
    }

    #[test]
    fn rejects_server_event_export_with_duplicate_or_unordered_sequences() {
        let document = json!({
            "schema_version": "1.0",
            "file_type": "clothstock.server-event-export",
            "store_id": 12,
            "after_seq": 40,
            "latest_seq": 42,
            "count": 2,
            "events": [
                {"seq_id": 42, "event_type": "VARIANT_UPDATED", "payload": {}},
                {"seq_id": 41, "event_type": "VARIANT_UPDATED", "payload": {}}
            ]
        });

        assert!(parse_server_event_export(&document.to_string()).is_err());
    }

    #[test]
    fn rejects_server_event_export_without_one_store_scope() {
        let document = json!({
            "schema_version": "1.0",
            "file_type": "clothstock.server-event-export",
            "store_id": null,
            "after_seq": 0,
            "latest_seq": 0,
            "count": 0,
            "events": []
        });

        assert!(parse_server_event_export(&document.to_string()).is_err());
    }

    #[test]
    fn rejects_server_event_export_with_mismatched_count() {
        let document = json!({
            "schema_version": "1.0",
            "file_type": "clothstock.server-event-export",
            "store_id": 12,
            "after_seq": 40,
            "latest_seq": 40,
            "count": 1,
            "events": []
        });

        assert!(parse_server_event_export(&document.to_string()).is_err());
    }
}
