use crate::error::{PosError, PosResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

pub(crate) struct ServerEvent {
    pub(crate) seq_id: i64,
    event_type: String,
    store: Option<Value>,
    store_code: Option<String>,
    payload: Value,
}

impl ServerEvent {
    pub(crate) fn parse(value: &Value) -> PosResult<Self> {
        let seq_id = value
            .get("seq_id")
            .and_then(Value::as_i64)
            .ok_or_else(|| PosError::msg("Server event is missing its integer seq_id."))?;
        let event_type = value
            .get("event_type")
            .and_then(Value::as_str)
            .filter(|event_type| !event_type.trim().is_empty())
            .ok_or_else(|| PosError::msg("Server event is missing its event_type."))?
            .to_uppercase();

        Ok(Self {
            seq_id,
            event_type,
            store: value.get("store").filter(|store| !store.is_null()).cloned(),
            store_code: value
                .get("store_code")
                .and_then(Value::as_str)
                .map(str::to_owned),
            payload: value.get("payload").cloned().unwrap_or(Value::Null),
        })
    }

    fn is_inventory_event(&self) -> bool {
        matches!(
            self.event_type.as_str(),
            "INVENTORY_UPDATED" | "STOCK_TRANSFER" | "INVENTORY_DELTA"
        ) || self.event_type.starts_with("LEDGER_")
            || (self.payload.get("variant_id").is_some()
                && (self.payload.get("delta").is_some()
                    || self.payload.get("quantity_on_hand").is_some()))
    }
}

pub(crate) fn upsert_category(conn: &Connection, category: &Value) -> PosResult<bool> {
    let Some(id) = json_i64(category, "id") else {
        return Ok(false);
    };
    conn.execute(
        "INSERT INTO categories (id, name, code, description, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            code = excluded.code,
            description = excluded.description,
            is_active = excluded.is_active",
        params![
            id,
            json_str(category, "name"),
            json_str(category, "code"),
            json_str(category, "description"),
            if json_bool(category, "is_active") {
                1
            } else {
                0
            },
        ],
    )?;
    Ok(true)
}

enum InventoryMutation {
    Delta {
        variant_id: String,
        delta: i64,
        origin_event_id: Option<String>,
    },
    Snapshot {
        variant_id: String,
        quantity_on_hand: i64,
        updated_at: Option<String>,
    },
}

impl InventoryMutation {
    fn parse(payload: &Value) -> PosResult<Option<Self>> {
        let Some(object) = payload.as_object() else {
            return Err(PosError::msg(
                "Inventory server event payload must be a JSON object.",
            ));
        };
        let variant_id = payload
            .get("variant_id")
            .map(|value| match value {
                Value::String(value) => value.clone(),
                Value::Number(value) => value.to_string(),
                _ => String::new(),
            })
            .unwrap_or_default();
        if variant_id.is_empty() {
            return Ok(None);
        }

        // Delta is the mutation when both fields exist; resulting_balance is
        // descriptive metadata and must not turn a delta into a snapshot.
        if object.contains_key("delta") {
            let delta = inventory_integer(payload, "delta")?.ok_or_else(|| {
                PosError::msg("Inventory delta event contains a non-integer delta.")
            })?;
            let origin_event_id = payload
                .get("origin_event_id")
                .and_then(Value::as_str)
                .filter(|event_id| !event_id.is_empty())
                .map(str::to_owned);
            return Ok(Some(Self::Delta {
                variant_id,
                delta,
                origin_event_id,
            }));
        }

        if object.contains_key("quantity_on_hand") {
            let quantity_on_hand =
                inventory_integer(payload, "quantity_on_hand")?.ok_or_else(|| {
                    PosError::msg(
                        "Inventory snapshot event contains a non-integer quantity_on_hand.",
                    )
                })?;
            let updated_at = match payload.get("updated_at") {
                Some(Value::String(value)) => Some(value.clone()),
                Some(Value::Null) | None => None,
                Some(_) => {
                    return Err(PosError::msg(
                        "Inventory snapshot updated_at must be a string or null.",
                    ))
                }
            };
            return Ok(Some(Self::Snapshot {
                variant_id,
                quantity_on_hand,
                updated_at,
            }));
        }

        Ok(None)
    }
}

fn inventory_integer(payload: &Value, key: &str) -> PosResult<Option<i64>> {
    match payload.get(key) {
        Some(Value::Number(value)) => Ok(value.as_i64()),
        Some(Value::String(value)) => Ok(value.parse().ok()),
        Some(Value::Null) | None => Ok(None),
        Some(_) => Ok(None),
    }
}

fn client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .expect("reqwest client")
}

fn auth_headers(token: &str) -> reqwest::header::HeaderMap {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        "application/json".parse().unwrap(),
    );
    headers.insert(reqwest::header::ACCEPT, "application/json".parse().unwrap());
    if !token.is_empty() {
        if let Ok(value) = format!("Token {token}").parse() {
            headers.insert(reqwest::header::AUTHORIZATION, value);
        }
    }
    headers
}

pub struct BoundStore {
    pub id: String,
    pub code: String,
    pub name: String,
}

pub fn login(api_url: &str, username: &str, password: &str) -> PosResult<String> {
    let url = format!("{}/api/auth/login/", api_url.trim_end_matches('/'));
    let response = client()
        .post(&url)
        .json(&json!({ "username": username, "password": password }))
        .send()?;
    if !response.status().is_success() {
        let text = response.text().unwrap_or_default();
        return Err(PosError::msg(format!(
            "Login failed. Check username/password. {text}"
        )));
    }
    let body: Value = response.json()?;
    body.get("token")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| PosError::msg("Login succeeded but no token was returned."))
}

pub fn resolve_store_by_code(
    api_url: &str,
    token: &str,
    store_code: &str,
) -> PosResult<BoundStore> {
    let stores = fetch_paginated(api_url, token, "/api/stores/")?;
    find_store_by_code(&stores, store_code).ok_or_else(|| {
        PosError::msg(format!(
            "No store with code '{}' is available to this account. Check the code or ask an owner to assign your account to the store.",
            store_code.trim()
        ))
    })
}

fn find_store_by_code(stores: &[Value], store_code: &str) -> Option<BoundStore> {
    stores
        .iter()
        .find(|store| {
            json_str(store, "code")
                .trim()
                .eq_ignore_ascii_case(store_code.trim())
        })
        .map(|store| BoundStore {
            id: json_str(store, "id"),
            code: json_str(store, "code"),
            name: json_str(store, "name"),
        })
}

pub fn import_catalog(
    conn: &Connection,
    api_url: &str,
    token: &str,
    store_id: &str,
) -> PosResult<usize> {
    bootstrap_catalog(conn, api_url, token, store_id)
}

pub(crate) fn apply_server_event(
    conn: &Connection,
    event: &ServerEvent,
    local_store_id: &str,
    local_store_code: &str,
) -> PosResult<()> {
    let payload = &event.payload;
    if event.is_inventory_event()
        && !event_targets_this_store(event, local_store_id, local_store_code)
    {
        return Ok(());
    }
    if event.is_inventory_event() {
        return apply_inventory_mutation(conn, event, local_store_id, local_store_code);
    }

    match event.event_type.as_str() {
        "CATEGORY_CREATED" | "CATEGORY_UPDATED" => {
            upsert_category(conn, payload)?;
        }
        "CATEGORY_DELETED" => {
            if let Some(id) = json_i64(&payload, "id") {
                conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
            }
        }
        "PRODUCT_CREATED" | "PRODUCT_UPDATED" => {
            let id = json_str(&payload, "id");
            if id.is_empty() {
                return Ok(());
            }
            conn.execute(
                "INSERT INTO products (id, name, style_code, description, category_id, category_name, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name, style_code = excluded.style_code,
                    description = excluded.description, category_id = excluded.category_id,
                    category_name = excluded.category_name, is_active = excluded.is_active,
                    updated_at = excluded.updated_at",
                params![
                    id,
                    json_str(&payload, "name"),
                    json_str(&payload, "style_code"),
                    json_str(&payload, "description"),
                    json_i64(&payload, "category_id"),
                    payload.get("category").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    if json_bool(&payload, "is_active") { 1 } else { 0 },
                    json_str(&payload, "created_at"),
                    json_str(&payload, "updated_at"),
                ],
            )?;
        }
        "PRODUCT_DELETED" => {
            let id = json_str(&payload, "id");
            if !id.is_empty() {
                conn.execute("DELETE FROM products WHERE id = ?1", params![id])?;
            }
        }
        "VARIANT_CREATED" | "VARIANT_UPDATED" => {
            let id = json_str(&payload, "id");
            if id.is_empty() {
                return Ok(());
            }
            conn.execute(
                "INSERT INTO variants (id, product_id, sku, barcode, size, color, price, cost, is_active)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET
                    product_id = excluded.product_id, sku = excluded.sku, barcode = excluded.barcode,
                    size = excluded.size, color = excluded.color, price = excluded.price,
                    cost = excluded.cost, is_active = excluded.is_active",
                params![
                    id,
                    json_str(&payload, "product_id"),
                    json_str(&payload, "sku"),
                    payload
                        .get("barcode")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty()),
                    json_str(&payload, "size"),
                    json_str(&payload, "color"),
                    json_str(&payload, "price"),
                    json_str(&payload, "cost"),
                    if json_bool(&payload, "is_active") { 1 } else { 0 },
                ],
            )?;
        }
        "VARIANT_DELETED" => {
            let id = json_str(&payload, "id");
            if !id.is_empty() {
                conn.execute("DELETE FROM variants WHERE id = ?1", params![id])?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn apply_inventory_mutation(
    conn: &Connection,
    event: &ServerEvent,
    local_store_id: &str,
    local_store_code: &str,
) -> PosResult<()> {
    if !event_targets_this_store(event, local_store_id, local_store_code) {
        return Ok(());
    }

    let Some(mutation) = InventoryMutation::parse(&event.payload)? else {
        return Ok(());
    };
    match mutation {
        InventoryMutation::Delta {
            variant_id,
            delta,
            origin_event_id,
        } => {
            if let Some(origin_event_id) = origin_event_id {
                let already_applied_locally: bool = conn.query_row(
                    "SELECT EXISTS(
                        SELECT 1 FROM pending_sync_events WHERE event_id = ?1
                    )",
                    params![origin_event_id],
                    |row| row.get(0),
                )?;
                if already_applied_locally {
                    eprintln!(
                        "[sync] skipped echoed inventory event: origin_event_id={origin_event_id}, \
                         variant_id={variant_id}, seq_id={}",
                        event.seq_id
                    );
                    return Ok(());
                }
            }
            conn.execute(
                "INSERT INTO store_inventory (variant_id, quantity_on_hand, updated_at)
                 VALUES (?1, ?2, datetime('now'))
                 ON CONFLICT(variant_id) DO UPDATE SET
                    quantity_on_hand = quantity_on_hand + ?2,
                    updated_at = datetime('now')",
                params![variant_id, delta],
            )?;
        }
        InventoryMutation::Snapshot {
            variant_id,
            quantity_on_hand,
            updated_at,
        } => {
            conn.execute(
                "INSERT INTO store_inventory (variant_id, quantity_on_hand, updated_at)
                 VALUES (?1, ?2, COALESCE(?3, datetime('now')))
                 ON CONFLICT(variant_id) DO UPDATE SET
                    quantity_on_hand = excluded.quantity_on_hand,
                    updated_at = excluded.updated_at",
                params![variant_id, quantity_on_hand, updated_at],
            )?;
        }
    }
    Ok(())
}

fn event_targets_this_store(
    event: &ServerEvent,
    local_store_id: &str,
    local_store_code: &str,
) -> bool {
    if local_store_id.is_empty() {
        return false;
    }

    let payload_id = event
        .payload
        .get("store_id")
        .filter(|value| !value.is_null());
    let event_store_id = event.store.as_ref();
    let payload_code = event.payload.get("store_code").and_then(Value::as_str);
    let event_code = event.store_code.as_deref();

    let id_matches = |value: &Value| {
        value
            .as_str()
            .map(str::to_owned)
            .or_else(|| value.as_i64().map(|number| number.to_string()))
            .is_some_and(|id| id == local_store_id)
    };
    let code_matches =
        |code: &str| !local_store_code.is_empty() && code.eq_ignore_ascii_case(local_store_code);

    // A non-null ServerEvent.store FK is authoritative. When it is absent,
    // require an explicit matching store ID or code in the event payload.
    if let Some(store_id) = event_store_id {
        return id_matches(store_id);
    }

    let identifiers = [
        payload_id.map(id_matches),
        payload_code.map(code_matches),
        event_code.map(code_matches),
    ];
    !identifiers.iter().any(|matches| *matches == Some(false))
        && identifiers.iter().any(|matches| *matches == Some(true))
}

fn bootstrap_catalog(
    conn: &Connection,
    api_url: &str,
    token: &str,
    store_id: &str,
) -> PosResult<usize> {
    let categories = fetch_paginated(api_url, token, "/api/categories/")?;
    for category in categories {
        upsert_category(conn, &category)?;
    }
    crate::db::set_setting(conn, "categories_bootstrapped", "1")?;

    let products = fetch_paginated(api_url, token, "/api/products/")?;
    let mut imported = 0;
    for product in products {
        upsert_product(conn, &product)?;
        if let Some(variants) = product.get("variants").and_then(|v| v.as_array()) {
            for variant in variants {
                upsert_variant(conn, variant)?;
                imported += 1;
            }
        }
    }
    // Standalone variant endpoint covers SKUs not nested on the product list.
    if let Ok(variants) = fetch_paginated(api_url, token, "/api/variants/") {
        for variant in variants {
            upsert_variant(conn, &variant)?;
        }
    }
    if !store_id.is_empty() {
        refresh_inventory(conn, api_url, token, store_id)?;
    }
    Ok(imported)
}

fn refresh_inventory(
    conn: &Connection,
    api_url: &str,
    token: &str,
    store_id: &str,
) -> PosResult<()> {
    let path = format!("/api/inventory/?store={store_id}");
    let rows = fetch_paginated(api_url, token, &path)?;
    for row in rows {
        let variant_id = row
            .get("variant")
            .map(|v| match v {
                Value::String(s) => s.clone(),
                other => other.to_string().replace('"', ""),
            })
            .unwrap_or_default();
        if variant_id.is_empty() {
            continue;
        }
        let exists: Option<String> = conn
            .query_row(
                "SELECT id FROM variants WHERE id = ?1",
                params![variant_id],
                |r| r.get(0),
            )
            .optional()?;
        if exists.is_none() {
            continue;
        }
        let qty = row
            .get("quantity_on_hand")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        conn.execute(
            "INSERT INTO store_inventory (variant_id, quantity_on_hand, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(variant_id) DO UPDATE SET
                quantity_on_hand = excluded.quantity_on_hand,
                updated_at = excluded.updated_at",
            params![variant_id, qty],
        )?;
    }
    Ok(())
}

fn upsert_product(conn: &Connection, product: &Value) -> PosResult<()> {
    let id = json_str(product, "id");
    if id.is_empty() {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO products (id, name, style_code, description, category_id, category_name, is_active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, style_code = excluded.style_code,
            description = excluded.description, category_name = excluded.category_name,
            is_active = excluded.is_active",
        params![
            id,
            json_str(product, "name"),
            json_str(product, "style_code"),
            json_str(product, "description"),
            json_i64(product, "category"),
            json_str(product, "category_name"),
            if json_bool(product, "is_active") { 1 } else { 0 },
            json_str(product, "created_at"),
            json_str(product, "updated_at"),
        ],
    )?;
    Ok(())
}

fn upsert_variant(conn: &Connection, variant: &Value) -> PosResult<()> {
    let id = json_str(variant, "id");
    let product_id = match variant.get("product") {
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string().replace('"', ""),
        None => json_str(variant, "product_id"),
    };
    if id.is_empty() || product_id.is_empty() {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO variants (id, product_id, sku, barcode, size, color, price, cost, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            sku = excluded.sku, barcode = excluded.barcode, size = excluded.size,
            color = excluded.color, price = excluded.price, cost = excluded.cost,
            is_active = excluded.is_active",
        params![
            id,
            product_id,
            json_str(variant, "sku"),
            variant
                .get("barcode")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty()),
            json_str(variant, "size"),
            json_str(variant, "color"),
            json_str(variant, "price"),
            json_str(variant, "cost"),
            if json_bool(variant, "is_active") {
                1
            } else {
                0
            },
        ],
    )?;
    Ok(())
}

fn fetch_paginated(api_url: &str, token: &str, path: &str) -> PosResult<Vec<Value>> {
    let mut url = format!("{}{path}", api_url.trim_end_matches('/'));
    let mut all = Vec::new();
    for _ in 0..50 {
        let response = client().get(&url).headers(auth_headers(token)).send()?;
        if !response.status().is_success() {
            return Err(PosError::msg(format!(
                "Failed to fetch {path}: HTTP {}",
                response.status()
            )));
        }
        let body: Value = response.json()?;
        if let Some(results) = body.get("results").and_then(|v| v.as_array()) {
            all.extend(results.clone());
            match body.get("next").and_then(|v| v.as_str()) {
                Some(next) if !next.is_empty() => url = next.to_string(),
                _ => break,
            }
        } else if let Some(arr) = body.as_array() {
            all.extend(arr.clone());
            break;
        } else {
            break;
        }
    }
    Ok(all)
}

pub(crate) fn json_str(value: &Value, key: &str) -> String {
    match value.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

pub(crate) fn json_i64(value: &Value, key: &str) -> Option<i64> {
    match value.get(key) {
        Some(Value::Number(n)) => n.as_i64(),
        Some(Value::String(s)) => s.parse().ok(),
        _ => None,
    }
}

pub(crate) fn json_bool(value: &Value, key: &str) -> bool {
    match value.get(key) {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64() == Some(1),
        Some(Value::String(s)) => s == "true" || s == "1",
        None => true,
        _ => true,
    }
}

#[cfg(test)]
mod tests {
    use super::{apply_server_event, event_targets_this_store, find_store_by_code, ServerEvent};
    use rusqlite::Connection;
    use serde_json::{json, Value};

    fn parse_event(value: &Value) -> ServerEvent {
        ServerEvent::parse(value).unwrap()
    }

    #[test]
    fn resolves_existing_store_by_code_case_insensitively() {
        let stores = vec![json!({
            "id": 14,
            "code": "SOHO-01",
            "name": "Soho Flagship"
        })];

        let store = find_store_by_code(&stores, " soho-01 ").unwrap();
        assert_eq!(store.id, "14");
        assert_eq!(store.code, "SOHO-01");
        assert_eq!(store.name, "Soho Flagship");
    }

    #[test]
    fn does_not_resolve_store_by_its_name() {
        let stores = vec![json!({
            "id": 14,
            "code": "SOHO-01",
            "name": "Soho Flagship"
        })];

        assert!(find_store_by_code(&stores, "Soho Flagship").is_none());
    }

    #[test]
    fn inventory_events_for_warehouse_do_not_target_a_store() {
        let event = parse_event(&json!({
            "seq_id": 25,
            "store": null,
            "event_type": "INVENTORY_SNAPSHOT",
            "payload": {
                "store_id": null,
                "store_code": "STORAGE",
                "variant_id": "variant-1",
                "quantity_on_hand": 0
            }
        }));

        assert!(!event_targets_this_store(&event, "store-1", "STORE-1"));
    }

    #[test]
    fn inventory_events_for_bound_store_target_the_store() {
        let event = parse_event(&json!({
            "seq_id": 25,
            "store": 12,
            "event_type": "INVENTORY_DELTA",
            "payload": {
                "store_id": 12,
                "store_code": "STORE-1",
                "variant_id": "variant-1",
                "delta": 1
            }
        }));

        assert!(event_targets_this_store(&event, "12", "STORE-1"));
    }

    #[test]
    fn skips_foreign_inventory_event_and_processes_next_event() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE categories (
                id INTEGER PRIMARY KEY,
                name TEXT,
                code TEXT,
                description TEXT,
                is_active INTEGER
            );",
        )
        .unwrap();
        let event = json!({
            "seq_id": 25,
            "store": 19,
            "event_type": "INVENTORY_DELTA",
            "payload": {"variant_id": "variant-1", "delta": -1}
        });
        let next_event = json!({
            "seq_id": 26,
            "store": null,
            "event_type": "CATEGORY_CREATED",
            "payload": {"id": 7, "name": "Tops", "code": "TOP", "is_active": true}
        });

        assert!(apply_server_event(&conn, &parse_event(&event), "12", "STORE-1").is_ok());
        assert!(apply_server_event(&conn, &parse_event(&next_event), "12", "STORE-1").is_ok());
        let category_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM categories WHERE id = 7", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(category_count, 1);
    }

    #[test]
    fn does_not_apply_local_sale_delta_twice_after_server_acknowledges_it() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE store_inventory (
                variant_id TEXT PRIMARY KEY,
                quantity_on_hand INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT
            );
            CREATE TABLE pending_sync_events (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                status TEXT NOT NULL,
                last_error TEXT,
                created_at TEXT NOT NULL
            );
            INSERT INTO store_inventory (variant_id, quantity_on_hand)
                VALUES ('variant-1', 4);
            INSERT INTO pending_sync_events (
                event_id, event_type, payload_json, status, created_at
            ) VALUES ('sale-event-1', 'SALE', '{}', 'SYNCED', 'now');",
        )
        .unwrap();
        let event = json!({
            "seq_id": 25,
            "store": 12,
            "event_type": "INVENTORY_DELTA",
            "payload": {
                "store_id": "12",
                "store_code": "STORE-1",
                "variant_id": "variant-1",
                "delta": -2,
                "resulting_balance": 4,
                "origin_event_id": "sale-event-1"
            }
        });

        assert!(apply_server_event(&conn, &parse_event(&event), "12", "STORE-1").is_ok());
        let quantity: i64 = conn
            .query_row(
                "SELECT quantity_on_hand FROM store_inventory WHERE variant_id = 'variant-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(quantity, 4);
    }

    #[test]
    fn applies_foreign_origin_stock_delta_to_matching_store() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE store_inventory (
                variant_id TEXT PRIMARY KEY,
                quantity_on_hand INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT
            );
            CREATE TABLE pending_sync_events (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                status TEXT NOT NULL,
                last_error TEXT,
                created_at TEXT NOT NULL
            );
            INSERT INTO store_inventory (variant_id, quantity_on_hand)
                VALUES ('variant-1', 5);",
        )
        .unwrap();
        let event = json!({
            "seq_id": 25,
            "store": 12,
            "event_type": "INVENTORY_DELTA",
            "payload": {
                "store_id": "12",
                "store_code": "STORE-1",
                "variant_id": "variant-1",
                "delta": -1,
                "origin_event_id": "another-device-sale"
            }
        });

        assert!(apply_server_event(&conn, &parse_event(&event), "12", "STORE-1").is_ok());
        let quantity: i64 = conn
            .query_row(
                "SELECT quantity_on_hand FROM store_inventory WHERE variant_id = 'variant-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(quantity, 4);
    }

    #[test]
    fn applies_ledger_delta_without_treating_resulting_balance_as_a_snapshot() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE store_inventory (
                variant_id TEXT PRIMARY KEY,
                quantity_on_hand INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT
            );
            INSERT INTO store_inventory (variant_id, quantity_on_hand)
                VALUES ('variant-1', 10);",
        )
        .unwrap();
        let event = parse_event(&json!({
            "seq_id": 38,
            "store": 12,
            "event_type": "LEDGER_STOCK_ADJUSTMENT",
            "payload": {
                "delta": 1,
                "reason": "STOCK_ADJUSTMENT",
                "store_id": 12,
                "ledger_id": 38,
                "store_code": "STORE-1",
                "variant_id": "variant-1",
                "variant_sku": "SKU-1",
                "previous_balance": 10,
                "resulting_balance": 11
            }
        }));

        apply_server_event(&conn, &event, "12", "STORE-1").unwrap();
        let quantity: i64 = conn
            .query_row(
                "SELECT quantity_on_hand FROM store_inventory WHERE variant_id = 'variant-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(quantity, 11);
    }

    #[test]
    fn applies_matching_absolute_snapshot_including_zero_and_updated_at() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE store_inventory (
                variant_id TEXT PRIMARY KEY,
                quantity_on_hand INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT
            );
            INSERT INTO store_inventory (variant_id, quantity_on_hand)
                VALUES ('variant-1', 8);",
        )
        .unwrap();
        let event = parse_event(&json!({
            "seq_id": 39,
            "store": null,
            "store_code": "STORE-1",
            "event_type": "INVENTORY_SNAPSHOT",
            "payload": {
                "store_id": null,
                "store_code": "STORE-1",
                "updated_at": "2026-11-23T16:10:52.140382+00:00",
                "variant_id": "variant-1",
                "variant_sku": "SKU-1",
                "quantity_on_hand": 0
            }
        }));

        apply_server_event(&conn, &event, "12", "STORE-1").unwrap();
        let (quantity, updated_at): (i64, String) = conn
            .query_row(
                "SELECT quantity_on_hand, updated_at FROM store_inventory WHERE variant_id = 'variant-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(quantity, 0);
        assert_eq!(updated_at, "2026-11-23T16:10:52.140382+00:00");
    }

    #[test]
    fn does_not_apply_storage_level_absolute_snapshot_to_store_inventory() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE store_inventory (
                variant_id TEXT PRIMARY KEY,
                quantity_on_hand INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT
            );
            INSERT INTO store_inventory (variant_id, quantity_on_hand)
                VALUES ('variant-1', 7);",
        )
        .unwrap();
        let event = parse_event(&json!({
            "seq_id": 40,
            "store": null,
            "store_code": null,
            "event_type": "INVENTORY_UPDATED",
            "payload": {
                "store_id": null,
                "store_code": "STORAGE",
                "updated_at": "2026-11-23T16:10:52.140382+00:00",
                "variant_id": "variant-1",
                "quantity_on_hand": 0
            }
        }));

        apply_server_event(&conn, &event, "12", "STORE-1").unwrap();
        let quantity: i64 = conn
            .query_row(
                "SELECT quantity_on_hand FROM store_inventory WHERE variant_id = 'variant-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(quantity, 7);
    }

    #[test]
    fn accepts_global_and_matching_store_events() {
        let global_event = json!({
            "seq_id": 24,
            "store": null,
            "event_type": "PRODUCT_UPDATED",
            "payload": {"id": "product-1"}
        });
        let store_event = json!({
            "seq_id": 25,
            "store": 12,
            "event_type": "INVENTORY_DELTA",
            "payload": {"store_id": "12", "store_code": "STORE-1"}
        });

        assert!(!event_targets_this_store(
            &parse_event(&global_event),
            "12",
            "STORE-1"
        ));
        assert!(event_targets_this_store(
            &parse_event(&store_event),
            "12",
            "STORE-1"
        ));
    }
}
