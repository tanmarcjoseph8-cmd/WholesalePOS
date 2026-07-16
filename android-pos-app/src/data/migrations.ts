export type Migration = {
  version: number;
  name: string;
  sql: string;
};

export const migrations: Migration[] = [
  {
    version: 1,
    name: "offline_pos_core",
    sql: `
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  permissions_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id),
  name TEXT NOT NULL,
  login TEXT NOT NULL COLLATE NOCASE UNIQUE,
  secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  parent_id TEXT REFERENCES categories(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_active_name_uq ON categories(name) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT REFERENCES categories(id),
  sku TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL COLLATE NOCASE,
  inventory_unit TEXT NOT NULL,
  selling_unit TEXT NOT NULL,
  unit_ratio_micro INTEGER NOT NULL DEFAULT 1000000 CHECK(unit_ratio_micro > 0),
  package_size_micro INTEGER NOT NULL DEFAULT 1000000 CHECK(package_size_micro > 0),
  cost_price_cents INTEGER NOT NULL DEFAULT 0 CHECK(cost_price_cents >= 0),
  retail_price_cents INTEGER NOT NULL DEFAULT 0 CHECK(retail_price_cents >= 0),
  wholesale_price_cents INTEGER NOT NULL DEFAULT 0 CHECK(wholesale_price_cents >= 0),
  wholesale_threshold_micro INTEGER NOT NULL DEFAULT 0 CHECK(wholesale_threshold_micro >= 0),
  tax_basis_points INTEGER NOT NULL DEFAULT 0 CHECK(tax_basis_points BETWEEN 0 AND 10000),
  minimum_stock_micro INTEGER NOT NULL DEFAULT 0 CHECK(minimum_stock_micro >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS products_name_idx ON products(name);
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id, status);
CREATE INDEX IF NOT EXISTS products_active_idx ON products(status, deleted_at);

CREATE TABLE IF NOT EXISTS product_barcodes (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  value TEXT NOT NULL COLLATE NOCASE UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS product_barcodes_product_idx ON product_barcodes(product_id);

CREATE TABLE IF NOT EXISTS inventory_stock (
  product_id TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  quantity_micro INTEGER NOT NULL DEFAULT 0 CHECK(quantity_micro >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  type TEXT NOT NULL,
  quantity_micro INTEGER NOT NULL CHECK(quantity_micro <> 0),
  unit_cost_cents INTEGER,
  reference_type TEXT,
  reference_id TEXT,
  reason TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON inventory_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_reference_idx ON inventory_movements(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id TEXT PRIMARY KEY NOT NULL,
  number TEXT NOT NULL COLLATE NOCASE,
  section TEXT NOT NULL COLLATE NOCASE DEFAULT 'Main',
  capacity INTEGER NOT NULL DEFAULT 4 CHECK(capacity > 0),
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','OCCUPIED','RESERVED','CLEANING','UNAVAILABLE')),
  guest_count INTEGER NOT NULL DEFAULT 0 CHECK(guest_count >= 0),
  active_order_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_tables_active_number_uq ON restaurant_tables(number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS restaurant_tables_section_idx ON restaurant_tables(section, status, is_active);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  order_number TEXT NOT NULL UNIQUE,
  order_type TEXT NOT NULL,
  custom_order_type TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CONFIRMED','PREPARING','READY','SERVED','COMPLETED','CANCELLED')),
  cashier_id TEXT NOT NULL REFERENCES users(id),
  customer_name TEXT,
  guest_count INTEGER NOT NULL DEFAULT 1 CHECK(guest_count > 0),
  primary_table_id TEXT REFERENCES restaurant_tables(id),
  notes TEXT,
  service_charge_cents INTEGER NOT NULL DEFAULT 0 CHECK(service_charge_cents >= 0),
  tip_cents INTEGER NOT NULL DEFAULT 0 CHECK(tip_cents >= 0),
  version INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  merged_into_order_id TEXT REFERENCES orders(id),
  split_from_order_id TEXT REFERENCES orders(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS orders_table_idx ON orders(primary_table_id, status);

CREATE TABLE IF NOT EXISTS order_tables (
  order_id TEXT NOT NULL REFERENCES orders(id),
  table_id TEXT NOT NULL REFERENCES restaurant_tables(id),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  PRIMARY KEY(order_id, table_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  sold_quantity_micro INTEGER NOT NULL CHECK(sold_quantity_micro > 0),
  sold_unit TEXT NOT NULL,
  base_quantity_micro INTEGER NOT NULL CHECK(base_quantity_micro > 0),
  unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(discount_cents >= 0),
  tax_basis_points INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id, deleted_at);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items(product_id);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_item_id TEXT NOT NULL REFERENCES order_items(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  quantity_micro INTEGER NOT NULL CHECK(quantity_micro > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RELEASED','CONSUMED')),
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reservations_stock_idx ON inventory_reservations(product_id, warehouse_id, status);
CREATE INDEX IF NOT EXISTS reservations_order_idx ON inventory_reservations(order_id, status);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  order_id TEXT UNIQUE REFERENCES orders(id),
  receipt_number TEXT NOT NULL UNIQUE,
  order_number TEXT,
  order_type TEXT NOT NULL DEFAULT 'RETAIL',
  custom_order_type TEXT,
  cashier_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED','PARTIALLY_REFUNDED','REFUNDED','VOIDED')),
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  service_charge_cents INTEGER NOT NULL DEFAULT 0,
  tip_cents INTEGER NOT NULL DEFAULT 0,
  grand_total_cents INTEGER NOT NULL,
  paid_total_cents INTEGER NOT NULL,
  change_total_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS sales_created_idx ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS sales_status_idx ON sales(status, created_at DESC);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY NOT NULL,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  sold_quantity_micro INTEGER NOT NULL,
  sold_unit TEXT NOT NULL,
  base_quantity_micro INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON sale_items(product_id);

CREATE TABLE IF NOT EXISTS sale_payments (
  id TEXT PRIMARY KEY NOT NULL,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  method TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  reference TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sale_payments_sale_idx ON sale_payments(sale_id);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  original_sale_id TEXT NOT NULL REFERENCES sales(id),
  receipt_number TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('REFUND','VOID')),
  reason TEXT NOT NULL,
  cashier_id TEXT NOT NULL REFERENCES users(id),
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  grand_total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS refunds_sale_idx ON refunds(original_sale_id, created_at);

CREATE TABLE IF NOT EXISTS refund_items (
  id TEXT PRIMARY KEY NOT NULL,
  refund_id TEXT NOT NULL REFERENCES refunds(id),
  sale_item_id TEXT NOT NULL REFERENCES sale_items(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  sold_quantity_micro INTEGER NOT NULL,
  base_quantity_micro INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL,
  inventory_movement_id TEXT NOT NULL REFERENCES inventory_movements(id)
);

CREATE INDEX IF NOT EXISTS refund_items_sale_item_idx ON refund_items(sale_item_id);

CREATE TABLE IF NOT EXISTS refund_payments (
  id TEXT PRIMARY KEY NOT NULL,
  refund_id TEXT NOT NULL REFERENCES refunds(id),
  method TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipt_sequences (
  purpose TEXT PRIMARY KEY NOT NULL,
  next_value INTEGER NOT NULL CHECK(next_value > 0),
  prefix TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_logs(action, created_at DESC);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT,
  actor_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS imports_fingerprint_idx ON import_batches(source_fingerprint, created_at DESC);
`
  },
  {
    version: 2,
    name: "inventory_and_reporting_views",
    sql: `
CREATE VIEW IF NOT EXISTS available_inventory AS
SELECT
  p.id AS product_id,
  w.id AS warehouse_id,
  COALESCE(s.quantity_micro, 0) AS physical_micro,
  COALESCE(SUM(CASE WHEN r.status = 'ACTIVE' THEN r.quantity_micro ELSE 0 END), 0) AS reserved_micro,
  COALESCE(s.quantity_micro, 0) - COALESCE(SUM(CASE WHEN r.status = 'ACTIVE' THEN r.quantity_micro ELSE 0 END), 0) AS available_micro
FROM products p
CROSS JOIN warehouses w
LEFT JOIN inventory_stock s ON s.product_id = p.id AND s.warehouse_id = w.id
LEFT JOIN inventory_reservations r ON r.product_id = p.id AND r.warehouse_id = w.id
WHERE p.deleted_at IS NULL AND w.deleted_at IS NULL
GROUP BY p.id, w.id, s.quantity_micro;

CREATE VIEW IF NOT EXISTS daily_sales AS
SELECT
  substr(created_at, 1, 10) AS sale_date,
  COUNT(*) AS sale_count,
  COALESCE(SUM(CASE WHEN status IN ('COMPLETED','PARTIALLY_REFUNDED') THEN grand_total_cents ELSE 0 END), 0) AS gross_cents
FROM sales
WHERE deleted_at IS NULL
GROUP BY substr(created_at, 1, 10);
`
  },
  {
    version: 3,
    name: "persistent_inventory_alerts",
    sql: `
CREATE TABLE IF NOT EXISTS inventory_alert_state (
  product_id TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  current_status TEXT NOT NULL CHECK(current_status IN ('NORMAL','LOW_STOCK','OUT_OF_STOCK')),
  current_quantity_micro INTEGER NOT NULL,
  threshold_micro INTEGER NOT NULL CHECK(threshold_micro >= 0),
  last_alert_type TEXT CHECK(last_alert_type IS NULL OR last_alert_type IN ('LOW_STOCK','OUT_OF_STOCK')),
  last_alert_at TEXT,
  resolved_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS inventory_alerts (
  id TEXT PRIMARY KEY NOT NULL,
  event_key TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  alert_type TEXT NOT NULL CHECK(alert_type IN ('LOW_STOCK','OUT_OF_STOCK')),
  quantity_micro INTEGER NOT NULL,
  threshold_micro INTEGER NOT NULL CHECK(threshold_micro >= 0),
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
  system_notified_at TEXT,
  resolved_at TEXT,
  cleared_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS inventory_alerts_unread_idx ON inventory_alerts(is_read, cleared_at, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_alerts_product_idx ON inventory_alerts(product_id, warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_alert_state_status_idx ON inventory_alert_state(current_status, updated_at DESC);
`
  },
  {
    version: 4,
    name: "offline_cash_drawer_ledger",
    sql: `
CREATE TABLE IF NOT EXISTS cash_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  close_request_key TEXT UNIQUE,
  register_id TEXT NOT NULL DEFAULT 'device_main',
  business_date TEXT NOT NULL,
  opened_by_user_id TEXT NOT NULL REFERENCES users(id),
  closed_by_user_id TEXT REFERENCES users(id),
  reviewed_by_user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED','REVIEW_REQUIRED','REVIEWED')),
  opening_cash_cents INTEGER NOT NULL CHECK(opening_cash_cents >= 0),
  expected_cash_cents INTEGER CHECK(expected_cash_cents IS NULL OR expected_cash_cents >= 0),
  actual_cash_cents INTEGER CHECK(actual_cash_cents IS NULL OR actual_cash_cents >= 0),
  difference_cents INTEGER,
  opening_notes TEXT,
  closing_notes TEXT,
  denomination_json TEXT,
  review_notes TEXT,
  review_resolution TEXT,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_register_idx ON cash_sessions(register_id) WHERE status='OPEN';
CREATE INDEX IF NOT EXISTS cash_sessions_date_idx ON cash_sessions(business_date DESC, opened_at DESC);
CREATE INDEX IF NOT EXISTS cash_sessions_user_idx ON cash_sessions(opened_by_user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS cash_sessions_status_idx ON cash_sessions(status, opened_at DESC);

CREATE TABLE IF NOT EXISTS cash_movements (
  id TEXT PRIMARY KEY NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  cash_session_id TEXT NOT NULL REFERENCES cash_sessions(id),
  type TEXT NOT NULL CHECK(type IN ('SALE','REFUND','CASH_IN','CASH_OUT','CORRECTION_IN','CORRECTION_OUT')),
  direction INTEGER NOT NULL CHECK(direction IN (-1,1)),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  reason TEXT NOT NULL,
  notes TEXT,
  related_type TEXT,
  related_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  reverses_movement_id TEXT REFERENCES cash_movements(id),
  reversed_at TEXT,
  reversed_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cash_movements_session_idx ON cash_movements(cash_session_id, created_at);
CREATE INDEX IF NOT EXISTS cash_movements_related_idx ON cash_movements(related_type, related_id);
CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_sale_once_idx ON cash_movements(related_id, type) WHERE related_type='Sale' AND type='SALE';
CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_refund_once_idx ON cash_movements(related_id, type) WHERE related_type='Refund' AND type='REFUND';

ALTER TABLE sales ADD COLUMN cash_session_id TEXT REFERENCES cash_sessions(id);
ALTER TABLE refunds ADD COLUMN cash_session_id TEXT REFERENCES cash_sessions(id);

UPDATE roles SET permissions_json='["sales.manage","sales.refund","sales.void","products.manage","inventory.manage","orders.manage","tables.manage","reports.view","settings.manage","cash_drawer.use","cash_drawer.manage","cash_drawer.review","cash_drawer.report"]' WHERE id='role_manager';
UPDATE roles SET permissions_json='["sales.manage","orders.manage","products.view","cash_drawer.use"]' WHERE id='role_cashier';
`
  }
];

export const currentSchemaVersion = migrations[migrations.length - 1]?.version ?? 0;
