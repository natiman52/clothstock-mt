-- ClothPos local catalog, cart, sales, and sync queue.
-- Mirrors ClothStock Product / Variant / StoreInventory / Sale / SaleItem.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    style_code TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER,
    category_name TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    barcode TEXT UNIQUE,
    size TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    price TEXT NOT NULL DEFAULT '0.00',
    cost TEXT NOT NULL DEFAULT '0.00',
    is_active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS store_inventory (
    variant_id TEXT PRIMARY KEY,
    quantity_on_hand INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT,
    FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cart_items (
    variant_id TEXT PRIMARY KEY,
    quantity INTEGER NOT NULL,
    unit_price TEXT NOT NULL,
    discount_amount TEXT NOT NULL DEFAULT '0.00',
    FOREIGN KEY (variant_id) REFERENCES variants(id)
);

CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    receipt_number TEXT NOT NULL,
    sold_at TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    subtotal TEXT NOT NULL,
    discount_amount TEXT NOT NULL DEFAULT '0.00',
    tax_amount TEXT NOT NULL DEFAULT '0.00',
    total_amount TEXT NOT NULL,
    amount_tendered TEXT NOT NULL DEFAULT '0.00',
    change_due TEXT NOT NULL DEFAULT '0.00',
    cashier_name TEXT NOT NULL DEFAULT '',
    customer_name TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sync_status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    size TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL,
    unit_price TEXT NOT NULL,
    unit_cost TEXT NOT NULL DEFAULT '0.00',
    discount_amount TEXT NOT NULL DEFAULT '0.00',
    line_total TEXT NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id TEXT NOT NULL,
    method TEXT NOT NULL,
    amount TEXT NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_sync_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    last_error TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku);
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON variants(barcode);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_pending_sync_status ON pending_sync_events(status);
