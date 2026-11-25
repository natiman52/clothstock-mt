use crate::db::{get_setting, load_settings, log_action, now_iso, set_setting};
use crate::error::{PosError, PosResult};
use crate::models::{
    fmt_money, parse_money, CartLine, CartSnapshot, CatalogCategory, CatalogProduct,
    CatalogVariant, InitStatus, SaleItemRow, SaleRow, SyncStatus, TerminalSettings,
};
use crate::onboarding;
use crate::sync;
use crate::{background_sync, DbState};
use rusqlite::{params, OptionalExtension};
use tauri::{AppHandle, State};
use uuid::Uuid;

fn conn<'a>(state: &'a State<'_, DbState>) -> std::sync::MutexGuard<'a, rusqlite::Connection> {
    state.conn.lock().expect("database mutex poisoned")
}
#[tauri::command]
pub fn is_initialized(state: State<DbState>) -> PosResult<InitStatus> {
    let db = conn(&state);
    Ok(InitStatus {
        initialized: crate::db::is_initialized(&db)?,
        store_name: get_setting(&db, "store_name")?,
        username: get_setting(&db, "username")?,
    })
}

#[tauri::command]
pub fn complete_onboarding(
    state: State<DbState>,
    store_code: String,
    username: String,
    password: String,
    password_confirm: String,
) -> PosResult<TerminalSettings> {
    let mut db = conn(&state);
    onboarding::complete_onboarding(
        &mut db,
        &store_code,
        &username,
        &password,
        &password_confirm,
    )
}

#[tauri::command]
pub fn get_settings(state: State<DbState>) -> PosResult<TerminalSettings> {
    let db = conn(&state);
    let mut settings = load_settings(&db)?;
    // Never send the raw token to the renderer.
    settings.auth_token = String::new();
    Ok(settings)
}

#[tauri::command]
pub fn save_settings(
    state: State<DbState>,
    api_url: String,
    store_id: String,
    store_code: String,
    store_name: String,
    cashier_name: String,
    username: String,
) -> PosResult<TerminalSettings> {
    let db = conn(&state);
    set_setting(&db, "api_url", api_url.trim())?;
    set_setting(&db, "store_id", store_id.trim())?;
    set_setting(&db, "store_code", store_code.trim())?;
    set_setting(&db, "store_name", store_name.trim())?;
    set_setting(&db, "cashier_name", cashier_name.trim())?;
    set_setting(&db, "username", username.trim())?;
    let mut settings = load_settings(&db)?;
    settings.auth_token.clear();
    Ok(settings)
}

#[tauri::command]
pub fn login_server(
    state: State<DbState>,
    username: String,
    password: String,
) -> PosResult<TerminalSettings> {
    let db = conn(&state);
    let api_url = get_setting(&db, "api_url")?;
    drop(db);

    let token = sync::login(&api_url, &username, &password)?;

    let db = conn(&state);
    set_setting(&db, "username", username.trim())?;
    set_setting(&db, "auth_token", &token)?;
    if get_setting(&db, "cashier_name")?.is_empty() {
        set_setting(&db, "cashier_name", username.trim())?;
    }
    let mut settings = load_settings(&db)?;
    settings.auth_token.clear();
    Ok(settings)
}

#[tauri::command]
pub fn logout_server(state: State<DbState>) -> PosResult<TerminalSettings> {
    let db = conn(&state);
    set_setting(&db, "auth_token", "")?;
    let mut settings = load_settings(&db)?;
    settings.auth_token.clear();
    Ok(settings)
}

#[tauri::command]
pub fn seed_demo_catalog(state: State<DbState>) -> PosResult<usize> {
    Ok(0)
}

fn map_variant(row: &rusqlite::Row<'_>) -> rusqlite::Result<CatalogVariant> {
    Ok(CatalogVariant {
        id: row.get(0)?,
        product_id: row.get(1)?,
        product_name: row.get(2)?,
        style_code: row.get(3)?,
        category_name: row.get(4)?,
        sku: row.get(5)?,
        barcode: row.get(6)?,
        size: row.get(7)?,
        color: row.get(8)?,
        price: row.get(9)?,
        cost: row.get(10)?,
        quantity_on_hand: row.get::<_, i64>(11).unwrap_or(0),
        is_active: row.get::<_, i64>(12).unwrap_or(1) == 1,
    })
}

const VARIANT_SELECT: &str = "
    SELECT v.id, v.product_id, p.name, p.style_code, p.category_name,
           v.sku, v.barcode, v.size, v.color, v.price, v.cost,
           COALESCE(i.quantity_on_hand, 0), v.is_active
    FROM variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN store_inventory i ON i.variant_id = v.id
";

#[tauri::command]
pub fn lookup_variant(state: State<DbState>, query: String) -> PosResult<Option<CatalogVariant>> {
    let db = conn(&state);
    let q = query.trim();
    if q.is_empty() {
        return Ok(None);
    }
    let sql = format!(
        "{VARIANT_SELECT}
         WHERE v.barcode = ?1 OR v.sku = ?1 COLLATE NOCASE
         LIMIT 1"
    );
    let found = db.query_row(&sql, params![q], map_variant).optional()?;
    Ok(found)
}

#[tauri::command]
pub fn search_catalog(state: State<DbState>, query: String) -> PosResult<Vec<CatalogVariant>> {
    let db = conn(&state);
    let q = query.trim();
    let like = format!("%{}%", q);
    let sql = if q.is_empty() {
        format!("{VARIANT_SELECT} WHERE v.is_active = 1 ORDER BY p.name, v.size LIMIT 80")
    } else {
        format!(
            "{VARIANT_SELECT}
             WHERE v.is_active = 1 AND (
                v.sku LIKE ?1 COLLATE NOCASE
                OR v.barcode LIKE ?1
                OR p.name LIKE ?1 COLLATE NOCASE
                OR p.style_code LIKE ?1 COLLATE NOCASE
                OR v.size LIKE ?1 COLLATE NOCASE
                OR v.color LIKE ?1 COLLATE NOCASE
             )
             ORDER BY p.name, v.size
             LIMIT 80"
        )
    };
    let mut stmt = db.prepare(&sql)?;
    let rows = if q.is_empty() {
        stmt.query_map([], map_variant)?
    } else {
        stmt.query_map(params![like], map_variant)?
    };
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[tauri::command]
pub fn browse_products(
    state: State<DbState>,
    query: String,
    offset: i64,
    limit: i64,
) -> PosResult<Vec<CatalogProduct>> {
    let db = conn(&state);
    let pattern = format!("%{}%", query.trim());
    let limit = limit.clamp(1, 100);
    let offset = offset.max(0);
    let mut stmt = db.prepare(
        "SELECT p.id, p.name, p.style_code, p.category_name,
                COUNT(DISTINCT v.id), COALESCE(SUM(i.quantity_on_hand), 0), p.is_active
         FROM products p
         LEFT JOIN variants v ON v.product_id = p.id
         LEFT JOIN store_inventory i ON i.variant_id = v.id
         WHERE (?1 = '' OR p.name LIKE ?2 COLLATE NOCASE
                OR p.style_code LIKE ?2 COLLATE NOCASE
                OR p.category_name LIKE ?2 COLLATE NOCASE)
         GROUP BY p.id
         ORDER BY p.name COLLATE NOCASE, p.id
         LIMIT ?3 OFFSET ?4",
    )?;
    let rows = stmt.query_map(params![query.trim(), pattern, limit, offset], |row| {
        Ok(CatalogProduct {
            id: row.get(0)?,
            name: row.get(1)?,
            style_code: row.get(2)?,
            category_name: row.get(3)?,
            variant_count: row.get(4)?,
            total_stock: row.get(5)?,
            is_active: row.get::<_, i64>(6)? == 1,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[tauri::command]
pub fn browse_variants(
    state: State<DbState>,
    query: String,
    offset: i64,
    limit: i64,
) -> PosResult<Vec<CatalogVariant>> {
    let db = conn(&state);
    let pattern = format!("%{}%", query.trim());
    let limit = limit.clamp(1, 100);
    let offset = offset.max(0);
    let sql = format!(
        "{VARIANT_SELECT}
         WHERE (?1 = '' OR v.sku LIKE ?2 COLLATE NOCASE
                OR v.barcode LIKE ?2
                OR p.name LIKE ?2 COLLATE NOCASE
                OR p.style_code LIKE ?2 COLLATE NOCASE
                OR v.size LIKE ?2 COLLATE NOCASE
                OR v.color LIKE ?2 COLLATE NOCASE
                OR p.category_name LIKE ?2 COLLATE NOCASE)
         ORDER BY p.name COLLATE NOCASE, v.sku COLLATE NOCASE
         LIMIT ?3 OFFSET ?4"
    );
    let mut stmt = db.prepare(&sql)?;
    let rows = stmt.query_map(params![query.trim(), pattern, limit, offset], map_variant)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[tauri::command]
pub fn browse_categories(
    state: State<DbState>,
    query: String,
    offset: i64,
    limit: i64,
) -> PosResult<Vec<CatalogCategory>> {
    let db = conn(&state);
    let pattern = format!("%{}%", query.trim());
    let limit = limit.clamp(1, 100);
    let offset = offset.max(0);
    let mut stmt = db.prepare(
        "SELECT c.id, c.name, c.code, c.description,
                COUNT(DISTINCT p.id), c.is_active
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id
         WHERE (?1 = '' OR c.name LIKE ?2 COLLATE NOCASE
                OR c.code LIKE ?2 COLLATE NOCASE
                OR c.description LIKE ?2 COLLATE NOCASE)
         GROUP BY c.id
         ORDER BY c.name COLLATE NOCASE, c.id
         LIMIT ?3 OFFSET ?4",
    )?;
    let rows = stmt.query_map(params![query.trim(), pattern, limit, offset], |row| {
        Ok(CatalogCategory {
            id: row.get(0)?,
            name: row.get(1)?,
            code: row.get(2)?,
            description: row.get(3)?,
            product_count: row.get(4)?,
            is_active: row.get::<_, i64>(5)? == 1,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn load_cart(db: &rusqlite::Connection) -> PosResult<CartSnapshot> {
    let mut stmt = db.prepare(
        "SELECT c.variant_id, p.name, v.sku, v.barcode, v.size, v.color,
                c.quantity, c.unit_price, c.discount_amount,
                COALESCE(i.quantity_on_hand, 0)
         FROM cart_items c
         JOIN variants v ON v.id = c.variant_id
         JOIN products p ON p.id = v.product_id
         LEFT JOIN store_inventory i ON i.variant_id = v.id
         ORDER BY p.name",
    )?;
    let rows = stmt.query_map([], |row| {
        let quantity: i64 = row.get(6)?;
        let unit_price: String = row.get(7)?;
        let discount: String = row.get(8)?;
        let line = parse_money(&unit_price) * quantity as f64 - parse_money(&discount);
        Ok(CartLine {
            variant_id: row.get(0)?,
            product_name: row.get(1)?,
            sku: row.get(2)?,
            barcode: row.get(3)?,
            size: row.get(4)?,
            color: row.get(5)?,
            quantity,
            unit_price,
            discount_amount: discount,
            line_total: fmt_money(line),
            quantity_on_hand: row.get(9)?,
        })
    })?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    let item_count = items.iter().map(|i| i.quantity).sum();
    let subtotal = items
        .iter()
        .map(|i| parse_money(&i.line_total))
        .sum::<f64>();
    Ok(CartSnapshot {
        items,
        item_count,
        subtotal: fmt_money(subtotal),
        discount_amount: fmt_money(0.0),
        tax_amount: fmt_money(0.0),
        total_amount: fmt_money(subtotal),
    })
}

#[tauri::command]
pub fn get_cart(state: State<DbState>) -> PosResult<CartSnapshot> {
    let db = conn(&state);
    load_cart(&db)
}

#[tauri::command]
pub fn cart_add(
    state: State<DbState>,
    variant_id: String,
    quantity: i64,
) -> PosResult<CartSnapshot> {
    if quantity <= 0 {
        return Err(PosError::msg("Quantity must be greater than zero."));
    }
    let db = conn(&state);
    let variant = db
        .query_row(
            &format!("{VARIANT_SELECT} WHERE v.id = ?1"),
            params![variant_id],
            map_variant,
        )
        .optional()?
        .ok_or_else(|| PosError::msg("SKU not found in local catalog."))?;

    if !variant.is_active {
        return Err(PosError::msg("This SKU is inactive and cannot be sold."));
    }

    let already: i64 = db
        .query_row(
            "SELECT COALESCE(SUM(quantity), 0) FROM cart_items WHERE variant_id = ?1",
            params![variant_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let next_qty = already + quantity;
    if next_qty > variant.quantity_on_hand {
        return Err(PosError::msg(format!(
            "Out of stock: {} has {} on hand, cart would need {}.",
            variant.sku, variant.quantity_on_hand, next_qty
        )));
    }

    db.execute(
        "INSERT INTO cart_items (variant_id, quantity, unit_price, discount_amount)
         VALUES (?1, ?2, ?3, '0.00')
         ON CONFLICT(variant_id) DO UPDATE SET quantity = cart_items.quantity + excluded.quantity",
        params![variant_id, quantity, variant.price],
    )?;
    let _ = log_action(
        &db,
        "CART_ADD",
        &serde_json::json!({
            "variant_id": variant_id,
            "sku": variant.sku,
            "quantity": quantity,
        }),
    );
    load_cart(&db)
}

#[tauri::command]
pub fn cart_update_qty(
    state: State<DbState>,
    variant_id: String,
    quantity: i64,
) -> PosResult<CartSnapshot> {
    let db = conn(&state);
    if quantity <= 0 {
        db.execute(
            "DELETE FROM cart_items WHERE variant_id = ?1",
            params![variant_id],
        )?;
        return load_cart(&db);
    }
    let on_hand: i64 = db
        .query_row(
            "SELECT COALESCE(quantity_on_hand, 0) FROM store_inventory WHERE variant_id = ?1",
            params![variant_id],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(0);
    if quantity > on_hand {
        return Err(PosError::msg(format!(
            "Out of stock: only {on_hand} units available for this SKU."
        )));
    }
    let updated = db.execute(
        "UPDATE cart_items SET quantity = ?1 WHERE variant_id = ?2",
        params![quantity, variant_id],
    )?;
    if updated == 0 {
        return Err(PosError::msg("That line is not in the cart."));
    }
    load_cart(&db)
}

#[tauri::command]
pub fn cart_remove(state: State<DbState>, variant_id: String) -> PosResult<CartSnapshot> {
    let db = conn(&state);
    db.execute(
        "DELETE FROM cart_items WHERE variant_id = ?1",
        params![variant_id],
    )?;
    load_cart(&db)
}

#[tauri::command]
pub fn cart_clear(state: State<DbState>) -> PosResult<CartSnapshot> {
    let db = conn(&state);
    db.execute("DELETE FROM cart_items", [])?;
    load_cart(&db)
}

#[tauri::command]
pub fn checkout(
    state: State<DbState>,
    payment_method: String,
    amount_tendered: String,
    customer_name: String,
    notes: String,
) -> PosResult<SaleRow> {
    let method = payment_method.to_uppercase();
    if !["CASH", "CARD", "MOBILE", "MIXED", "OTHER"].contains(&method.as_str()) {
        return Err(PosError::msg("Unsupported payment method."));
    }

    let db = conn(&state);
    let cart = load_cart(&db)?;
    if cart.items.is_empty() {
        return Err(PosError::msg(
            "Cart is empty. Scan or add a SKU before checkout.",
        ));
    }

    let total = parse_money(&cart.total_amount);
    let tendered = if amount_tendered.trim().is_empty() {
        total
    } else {
        parse_money(&amount_tendered)
    };
    if matches!(method.as_str(), "CASH" | "MIXED") && tendered + 0.001 < total {
        return Err(PosError::msg(format!(
            "Payment failed: tendered {} is less than total {}.",
            fmt_money(tendered),
            cart.total_amount
        )));
    }

    let tx = db.unchecked_transaction()?;
    for line in &cart.items {
        let on_hand: i64 = tx
            .query_row(
                "SELECT COALESCE(quantity_on_hand, 0) FROM store_inventory WHERE variant_id = ?1",
                params![line.variant_id],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or(0);
        if line.quantity > on_hand {
            return Err(PosError::msg(format!(
                "Out of stock at checkout: {} (need {}, have {}).",
                line.sku, line.quantity, on_hand
            )));
        }
    }

    let sale_id = Uuid::new_v4().to_string();
    let store_code = get_setting(&tx, "store_code")?;
    let prefix = if store_code.is_empty() {
        "POS".to_string()
    } else {
        store_code.clone()
    };
    let day = chrono::Local::now().format("%Y%m%d").to_string();
    let today_count: i64 = tx.query_row(
        "SELECT COUNT(*) FROM sales WHERE receipt_number LIKE ?1",
        params![format!("{prefix}-{day}-%")],
        |row| row.get(0),
    )?;
    let receipt = format!("{prefix}-{day}-{:04}", today_count + 1);
    let sold_at = now_iso();
    let cashier = get_setting(&tx, "cashier_name")?;
    let change_due = (tendered - total).max(0.0);

    tx.execute(
        "INSERT INTO sales (
            id, receipt_number, sold_at, payment_method, status,
            subtotal, discount_amount, tax_amount, total_amount,
            amount_tendered, change_due, cashier_name, customer_name, notes, sync_status, created_at
         ) VALUES (?1, ?2, ?3, ?4, 'COMPLETED', ?5, '0.00', '0.00', ?6, ?7, ?8, ?9, ?10, ?11, 'PENDING', ?3)",
        params![
            sale_id,
            receipt,
            sold_at,
            method,
            cart.subtotal,
            cart.total_amount,
            fmt_money(tendered),
            fmt_money(change_due),
            cashier,
            customer_name.trim(),
            notes.trim(),
        ],
    )?;

    tx.execute(
        "INSERT INTO payments (sale_id, method, amount) VALUES (?1, ?2, ?3)",
        params![sale_id, method, cart.total_amount],
    )?;

    if !customer_name.trim().is_empty() {
        tx.execute(
            "INSERT INTO customers (name, phone, created_at) VALUES (?1, '', datetime('now'))",
            params![customer_name.trim()],
        )?;
    }

    let mut sync_items = Vec::new();
    for line in &cart.items {
        let cost: String = tx.query_row(
            "SELECT cost FROM variants WHERE id = ?1",
            params![line.variant_id],
            |row| row.get(0),
        )?;
        tx.execute(
            "INSERT INTO sale_items (
                sale_id, variant_id, sku, product_name, size, color,
                quantity, unit_price, unit_cost, discount_amount, line_total
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                sale_id,
                line.variant_id,
                line.sku,
                line.product_name,
                line.size,
                line.color,
                line.quantity,
                line.unit_price,
                cost,
                line.discount_amount,
                line.line_total,
            ],
        )?;
        tx.execute(
            "INSERT INTO store_inventory (variant_id, quantity_on_hand, updated_at)
             VALUES (?1, 0, datetime('now'))
             ON CONFLICT(variant_id) DO UPDATE SET
                quantity_on_hand = quantity_on_hand - ?2,
                updated_at = datetime('now')",
            params![line.variant_id, line.quantity],
        )?;
        sync_items.push(serde_json::json!({
            "variant_id": line.variant_id,
            "sku": line.sku,
            "quantity": line.quantity,
            "unit_price": line.unit_price,
            "unit_cost": cost,
            "reason": "SALE",
        }));
    }

    let event_id = Uuid::new_v4().to_string();
    let store_id = get_setting(&tx, "store_id")?;
    let store_ref = if !store_code.is_empty() {
        store_code
    } else {
        store_id.clone()
    };
    let payload = serde_json::json!({
        "timestamp": sold_at,
        "sale_id": sale_id,
        "receipt_number": receipt,
        "payment_method": method,
        "customer_name": customer_name.trim(),
        "cashier_name": cashier,
        "subtotal": cart.subtotal,
        "total_amount": cart.total_amount,
        "store_id": store_ref,
        "items": sync_items,
        "sale_record": {
            "id": sale_id,
            "store": store_id,
            "receipt_number": receipt,
            "sold_at": sold_at,
            "payment_method": method,
            "status": "COMPLETED",
            "subtotal": cart.subtotal,
            "discount_amount": "0.00",
            "tax_amount": "0.00",
            "total_amount": cart.total_amount,
            "cashier_name": cashier,
            "customer_name": customer_name.trim(),
            "notes": notes.trim(),
            "items": cart.items.iter().map(|line| serde_json::json!({
                "variant": line.variant_id,
                "quantity": line.quantity,
                "unit_price": line.unit_price,
                "discount_amount": line.discount_amount,
                "line_total": line.line_total,
            })).collect::<Vec<_>>(),
        }
    });
    tx.execute(
        "INSERT INTO pending_sync_events (event_id, event_type, payload_json, status, created_at)
         VALUES (?1, 'SALE', ?2, 'PENDING', datetime('now'))",
        params![event_id, payload.to_string()],
    )?;
    tx.execute("DELETE FROM cart_items", [])?;
    tx.commit()?;

    let _ = log_action(
        &db,
        "CHECKOUT",
        &serde_json::json!({
            "sale_id": sale_id,
            "receipt_number": receipt,
            "total_amount": cart.total_amount,
            "payment_method": method,
        }),
    );
    get_sale_by_id(&db, &sale_id)
}

fn get_sale_by_id(db: &rusqlite::Connection, sale_id: &str) -> PosResult<SaleRow> {
    let mut sale = db.query_row(
        "SELECT id, receipt_number, sold_at, payment_method, status, subtotal, discount_amount,
                tax_amount, total_amount, amount_tendered, change_due, cashier_name, customer_name,
                notes, sync_status
         FROM sales WHERE id = ?1",
        params![sale_id],
        map_sale_header,
    )?;
    sale.items = load_sale_items(db, sale_id)?;
    sale.item_count = sale.items.iter().map(|i| i.quantity).sum();
    Ok(sale)
}

fn map_sale_header(row: &rusqlite::Row<'_>) -> rusqlite::Result<SaleRow> {
    Ok(SaleRow {
        id: row.get(0)?,
        receipt_number: row.get(1)?,
        sold_at: row.get(2)?,
        payment_method: row.get(3)?,
        status: row.get(4)?,
        subtotal: row.get(5)?,
        discount_amount: row.get(6)?,
        tax_amount: row.get(7)?,
        total_amount: row.get(8)?,
        amount_tendered: row.get(9)?,
        change_due: row.get(10)?,
        cashier_name: row.get(11)?,
        customer_name: row.get(12)?,
        notes: row.get(13)?,
        sync_status: row.get(14)?,
        item_count: 0,
        items: Vec::new(),
    })
}

fn load_sale_items(db: &rusqlite::Connection, sale_id: &str) -> PosResult<Vec<SaleItemRow>> {
    let mut stmt = db.prepare(
        "SELECT id, sale_id, variant_id, sku, product_name, size, color,
                quantity, unit_price, unit_cost, discount_amount, line_total
         FROM sale_items WHERE sale_id = ?1 ORDER BY id",
    )?;
    let rows = stmt.query_map(params![sale_id], |row| {
        Ok(SaleItemRow {
            id: row.get(0)?,
            sale_id: row.get(1)?,
            variant_id: row.get(2)?,
            sku: row.get(3)?,
            product_name: row.get(4)?,
            size: row.get(5)?,
            color: row.get(6)?,
            quantity: row.get(7)?,
            unit_price: row.get(8)?,
            unit_cost: row.get(9)?,
            discount_amount: row.get(10)?,
            line_total: row.get(11)?,
        })
    })?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

#[tauri::command]
pub fn list_sales(state: State<DbState>) -> PosResult<Vec<SaleRow>> {
    let db = conn(&state);
    let mut stmt = db.prepare(
        "SELECT id, receipt_number, sold_at, payment_method, status, subtotal, discount_amount,
                tax_amount, total_amount, amount_tendered, change_due, cashier_name, customer_name,
                notes, sync_status
         FROM sales ORDER BY sold_at DESC LIMIT 100",
    )?;
    let rows = stmt.query_map([], map_sale_header)?;
    let mut sales = Vec::new();
    for row in rows {
        let mut sale = row?;
        sale.items = load_sale_items(&db, &sale.id)?;
        sale.item_count = sale.items.iter().map(|i| i.quantity).sum();
        sales.push(sale);
    }
    Ok(sales)
}

#[tauri::command]
pub fn get_sale(state: State<DbState>, sale_id: String) -> PosResult<SaleRow> {
    let db = conn(&state);
    get_sale_by_id(&db, &sale_id)
}

#[tauri::command]
pub fn get_sync_status(
    state: State<DbState>,
    runtime: State<background_sync::SyncRuntime>,
) -> PosResult<SyncStatus> {
    let db = conn(&state);
    let pending_sales: i64 = db.query_row(
        "SELECT COUNT(*) FROM pending_sync_events WHERE status IN ('PENDING', 'EXPORTED')",
        [],
        |row| row.get(0),
    )?;
    let last_error = get_setting(&db, "last_sync_error")?;
    let last_synced = get_setting(&db, "last_synced_at")?;
    Ok(SyncStatus {
        pending_events: pending_sales,
        last_applied_seq: get_setting(&db, "last_applied_seq")?.parse().unwrap_or(0),
        last_error: if last_error.is_empty() {
            None
        } else {
            Some(last_error)
        },
        last_synced_at: if last_synced.is_empty() {
            None
        } else {
            Some(last_synced)
        },
        syncing: runtime.is_syncing(),
    })
}

#[tauri::command]
pub async fn sync_now(
    app: AppHandle,
    runtime: State<'_, background_sync::SyncRuntime>,
) -> PosResult<crate::models::SyncResult> {
    background_sync::sync_now(&app, &runtime).await
}

#[tauri::command]
pub async fn export_sync_status(
    app: AppHandle,
    runtime: State<'_, background_sync::SyncRuntime>,
) -> PosResult<serde_json::Value> {
    background_sync::export_status(&app, &runtime).await
}

#[tauri::command]
pub fn import_server_events(server_events_json: String, app: AppHandle) -> PosResult<String> {
    background_sync::import_server_events_json(&app, &server_events_json)
}
