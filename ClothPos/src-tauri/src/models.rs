use serde::{Deserialize, Serialize};

pub fn parse_money(s: &str) -> f64 {
    s.trim().parse::<f64>().unwrap_or(0.0)
}

pub fn fmt_money(value: f64) -> String {
    format!("{:.2}", (value * 100.0).round() / 100.0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSettings {
    pub api_url: String,
    pub store_id: String,
    pub store_code: String,
    pub store_name: String,
    pub auth_token: String,
    pub username: String,
    pub cashier_name: String,
    pub last_applied_seq: i64,
    pub has_token: bool,
    pub initialized: bool,
}

impl Default for TerminalSettings {
    fn default() -> Self {
        Self {
            api_url: "http://localhost:8001".into(),
            store_id: String::new(),
            store_code: String::new(),
            store_name: String::new(),
            auth_token: String::new(),
            username: String::new(),
            cashier_name: String::new(),
            last_applied_seq: 0,
            has_token: false,
            initialized: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitStatus {
    pub initialized: bool,
    pub store_name: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogVariant {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub style_code: String,
    pub category_name: String,
    pub sku: String,
    pub barcode: Option<String>,
    pub size: String,
    pub color: String,
    pub price: String,
    pub cost: String,
    pub quantity_on_hand: i64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogProduct {
    pub id: String,
    pub name: String,
    pub style_code: String,
    pub category_name: String,
    pub variant_count: i64,
    pub total_stock: i64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogCategory {
    pub id: i64,
    pub name: String,
    pub code: String,
    pub description: String,
    pub product_count: i64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CartLine {
    pub variant_id: String,
    pub product_name: String,
    pub sku: String,
    pub barcode: Option<String>,
    pub size: String,
    pub color: String,
    pub quantity: i64,
    pub unit_price: String,
    pub discount_amount: String,
    pub line_total: String,
    pub quantity_on_hand: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CartSnapshot {
    pub items: Vec<CartLine>,
    pub item_count: i64,
    pub subtotal: String,
    pub discount_amount: String,
    pub tax_amount: String,
    pub total_amount: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleItemRow {
    pub id: i64,
    pub sale_id: String,
    pub variant_id: String,
    pub sku: String,
    pub product_name: String,
    pub size: String,
    pub color: String,
    pub quantity: i64,
    pub unit_price: String,
    pub unit_cost: String,
    pub discount_amount: String,
    pub line_total: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleRow {
    pub id: String,
    pub receipt_number: String,
    pub sold_at: String,
    pub payment_method: String,
    pub status: String,
    pub subtotal: String,
    pub discount_amount: String,
    pub tax_amount: String,
    pub total_amount: String,
    pub amount_tendered: String,
    pub change_due: String,
    pub cashier_name: String,
    pub customer_name: String,
    pub notes: String,
    pub sync_status: String,
    pub item_count: i64,
    pub items: Vec<SaleItemRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub pending_events: i64,
    pub last_applied_seq: i64,
    pub last_error: Option<String>,
    pub last_synced_at: Option<String>,
    pub syncing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub pulled: usize,
    pub pushed: usize,
    pub catalog_imported: usize,
    pub errors: Vec<String>,
    pub last_applied_seq: i64,
}
