-- Refex schema (SQLite) — core product tables

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  site_name TEXT NOT NULL DEFAULT 'Refex',
  full_multiple_companies_support INTEGER NOT NULL DEFAULT 1,
  default_currency TEXT NOT NULL DEFAULT 'USD',
  date_display_format TEXT NOT NULL DEFAULT 'Y-m-d',
  alert_email TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  notes TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES locations(id),
  company_id INTEGER REFERENCES companies(id),
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  zip TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company_id INTEGER REFERENCES companies(id),
  location_id INTEGER REFERENCES locations(id),
  manager_id INTEGER,
  notes TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS permission_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '{}',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password TEXT NOT NULL,
  employee_num TEXT,
  company_id INTEGER REFERENCES companies(id),
  location_id INTEGER REFERENCES locations(id),
  department_id INTEGER REFERENCES departments(id),
  jobtitle TEXT,
  phone TEXT,
  activated INTEGER NOT NULL DEFAULT 1,
  permissions TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS users_groups (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  last_used_at TEXT,
  expires_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS manufacturers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT,
  support_email TEXT,
  support_phone TEXT,
  notes TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT,
  address TEXT,
  contact TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL DEFAULT 'asset',
  require_acceptance INTEGER NOT NULL DEFAULT 0,
  checkin_email INTEGER NOT NULL DEFAULT 0,
  eula_text TEXT,
  use_default_eula INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS status_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'deployable',
  color TEXT,
  show_in_nav INTEGER NOT NULL DEFAULT 1,
  default_label INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS depreciations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  months INTEGER NOT NULL DEFAULT 36,
  depreciation_min INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS custom_fieldsets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS custom_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  db_column TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL DEFAULT 'ANY',
  element TEXT NOT NULL DEFAULT 'text',
  field_values TEXT,
  show_in_email INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS custom_field_custom_fieldset (
  custom_field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  custom_fieldset_id INTEGER NOT NULL REFERENCES custom_fieldsets(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  required INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (custom_field_id, custom_fieldset_id)
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  model_number TEXT,
  category_id INTEGER REFERENCES categories(id),
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  depreciation_id INTEGER REFERENCES depreciations(id),
  fieldset_id INTEGER REFERENCES custom_fieldsets(id),
  eol INTEGER,
  notes TEXT,
  requestable INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_tag TEXT NOT NULL UNIQUE,
  name TEXT,
  serial TEXT,
  model_id INTEGER REFERENCES models(id),
  status_id INTEGER REFERENCES status_labels(id),
  company_id INTEGER REFERENCES companies(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  location_id INTEGER REFERENCES locations(id),
  rtd_location_id INTEGER REFERENCES locations(id),
  assigned_to INTEGER,
  assigned_type TEXT,
  purchase_date TEXT,
  purchase_cost REAL,
  order_number TEXT,
  warranty_months INTEGER,
  notes TEXT,
  requestable INTEGER NOT NULL DEFAULT 0,
  byod INTEGER NOT NULL DEFAULT 0,
  expected_checkin TEXT,
  last_checkout TEXT,
  last_checkin TEXT,
  last_audit_date TEXT,
  next_audit_date TEXT,
  checkin_counter INTEGER NOT NULL DEFAULT 0,
  checkout_counter INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  serial TEXT,
  seats INTEGER NOT NULL DEFAULT 1,
  company_id INTEGER REFERENCES companies(id),
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  category_id INTEGER REFERENCES categories(id),
  license_name TEXT,
  license_email TEXT,
  reassignable INTEGER NOT NULL DEFAULT 1,
  expiration_date TEXT,
  termination_date TEXT,
  purchase_date TEXT,
  purchase_cost REAL,
  purchase_order TEXT,
  order_number TEXT,
  notes TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS license_seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id),
  asset_id INTEGER REFERENCES assets(id),
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS accessories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  company_id INTEGER REFERENCES companies(id),
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  location_id INTEGER REFERENCES locations(id),
  model_number TEXT,
  order_number TEXT,
  purchase_date TEXT,
  purchase_cost REAL,
  qty INTEGER NOT NULL DEFAULT 1,
  min_amt INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  requestable INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS accessories_checkout (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accessory_id INTEGER NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
  assigned_to INTEGER,
  assigned_type TEXT NOT NULL DEFAULT 'user',
  assigned_qty INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS consumables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  company_id INTEGER REFERENCES companies(id),
  manufacturer_id INTEGER REFERENCES manufacturers(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  location_id INTEGER REFERENCES locations(id),
  model_number TEXT,
  item_no TEXT,
  order_number TEXT,
  purchase_date TEXT,
  purchase_cost REAL,
  qty INTEGER NOT NULL DEFAULT 1,
  min_amt INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS consumables_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consumable_id INTEGER NOT NULL REFERENCES consumables(id) ON DELETE CASCADE,
  assigned_to INTEGER NOT NULL REFERENCES users(id),
  assigned_qty INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  company_id INTEGER REFERENCES companies(id),
  location_id INTEGER REFERENCES locations(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  model_number TEXT,
  order_number TEXT,
  purchase_date TEXT,
  purchase_cost REAL,
  qty INTEGER NOT NULL DEFAULT 1,
  min_amt INTEGER NOT NULL DEFAULT 0,
  serial TEXT,
  notes TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS components_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  assigned_qty INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS kits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS kits_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kit_id INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  model_id INTEGER NOT NULL REFERENCES models(id),
  quantity INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS kits_licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kit_id INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  license_id INTEGER NOT NULL REFERENCES licenses(id),
  quantity INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS kits_accessories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kit_id INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  accessory_id INTEGER NOT NULL REFERENCES accessories(id),
  quantity INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS kits_consumables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kit_id INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  consumable_id INTEGER NOT NULL REFERENCES consumables(id),
  quantity INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS maintenances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  asset_maintenance_type TEXT NOT NULL DEFAULT 'Maintenance',
  title TEXT NOT NULL,
  start_date TEXT,
  completion_date TEXT,
  asset_maintenance_time INTEGER,
  note TEXT,
  cost REAL,
  is_warranty INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER REFERENCES users(id),
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS checkout_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  requestable_id INTEGER NOT NULL,
  requestable_type TEXT NOT NULL DEFAULT 'asset',
  quantity INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS checkout_acceptances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkoutable_id INTEGER NOT NULL,
  checkoutable_type TEXT NOT NULL,
  assigned_to INTEGER NOT NULL REFERENCES users(id),
  accepted_at TEXT,
  declined_at TEXT,
  signature_filename TEXT,
  note TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action_type TEXT NOT NULL,
  target_id INTEGER,
  target_type TEXT,
  item_id INTEGER,
  item_type TEXT,
  location_id INTEGER REFERENCES locations(id),
  note TEXT,
  filename TEXT,
  log_meta TEXT,
  action_date TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  file_path TEXT,
  import_type TEXT,
  filesize INTEGER,
  field_map TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_assets_tag ON assets(asset_tag);
CREATE INDEX IF NOT EXISTS idx_assets_assigned ON assets(assigned_to, assigned_type);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_item ON action_logs(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_date ON action_logs(action_date);
