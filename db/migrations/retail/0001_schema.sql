CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  parent_id uuid REFERENCES categories (id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT categories_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  sku text NOT NULL,
  name text NOT NULL,
  category_id uuid REFERENCES categories (id) ON DELETE SET NULL,
  unit text NOT NULL DEFAULT 'pcs',
  cost_price numeric(14, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  sale_price numeric(14, 2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  tax_code_id uuid REFERENCES tax_codes (id) ON DELETE SET NULL,
  reorder_level numeric(14, 3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT products_client_sku_unique UNIQUE (client_id, sku),
  CONSTRAINT products_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS product_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES branches (id) ON DELETE SET NULL,
  warehouse_id uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  quantity numeric(14, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  CONSTRAINT product_stock_client_product_unique UNIQUE (client_id, product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES warehouses (id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('in', 'out', 'adjust', 'transfer')),
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  reference_type text,
  reference_id uuid,
  note text
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  code text NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  city text,
  credit_limit numeric(14, 2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0,
  balance numeric(14, 2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT customers_client_code_unique UNIQUE (client_id, code),
  CONSTRAINT customers_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  code text NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  terms_days integer NOT NULL DEFAULT 0 CHECK (terms_days >= 0),
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0,
  balance numeric(14, 2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT vendors_client_code_unique UNIQUE (client_id, code),
  CONSTRAINT vendors_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS salesmen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  phone text,
  commission_rate numeric(14, 4) NOT NULL DEFAULT 0 CHECK (commission_rate >= 0),
  territory text,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT salesmen_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  number text NOT NULL,
  customer_id uuid REFERENCES customers (id) ON DELETE SET NULL,
  branch_id uuid REFERENCES branches (id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES warehouses (id) ON DELETE SET NULL,
  salesman_id uuid REFERENCES salesmen (id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT current_date,
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  discount numeric(14, 2) NOT NULL DEFAULT 0,
  tax numeric(14, 2) NOT NULL DEFAULT 0,
  total numeric(14, 2) NOT NULL DEFAULT 0,
  paid numeric(14, 2) NOT NULL DEFAULT 0,
  balance numeric(14, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'paid', 'void')),
  CONSTRAINT invoices_client_number_unique UNIQUE (client_id, number)
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  product_id uuid REFERENCES products (id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  rate numeric(14, 2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  discount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax numeric(14, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  line_total numeric(14, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  number text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES vendors (id) ON DELETE RESTRICT,
  warehouse_id uuid REFERENCES warehouses (id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT current_date,
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  tax numeric(14, 2) NOT NULL DEFAULT 0,
  total numeric(14, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
  CONSTRAINT purchase_orders_client_number_unique UNIQUE (client_id, number)
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  order_id uuid NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  product_id uuid REFERENCES products (id) ON DELETE SET NULL,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  rate numeric(14, 2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  tax numeric(14, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  line_total numeric(14, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  number text NOT NULL,
  purchase_order_id uuid REFERENCES purchase_orders (id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES vendors (id) ON DELETE RESTRICT,
  warehouse_id uuid REFERENCES warehouses (id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT current_date,
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  tax numeric(14, 2) NOT NULL DEFAULT 0,
  total numeric(14, 2) NOT NULL DEFAULT 0,
  paid numeric(14, 2) NOT NULL DEFAULT 0,
  balance numeric(14, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'received', 'paid', 'void')),
  CONSTRAINT purchases_client_number_unique UNIQUE (client_id, number)
);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  purchase_id uuid NOT NULL REFERENCES purchases (id) ON DELETE CASCADE,
  product_id uuid REFERENCES products (id) ON DELETE SET NULL,
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  rate numeric(14, 2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  tax numeric(14, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  line_total numeric(14, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  number text NOT NULL,
  purchase_id uuid NOT NULL REFERENCES purchases (id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES vendors (id) ON DELETE RESTRICT,
  date date NOT NULL DEFAULT current_date,
  total numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT purchase_returns_client_number_unique UNIQUE (client_id, number)
);

CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  number text NOT NULL,
  invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers (id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT current_date,
  total numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  method text,
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid,
  CONSTRAINT refunds_client_number_unique UNIQUE (client_id, number)
);

CREATE TABLE IF NOT EXISTS banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  account_number text NOT NULL,
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0,
  current_balance numeric(14, 2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT banks_client_account_unique UNIQUE (client_id, account_number),
  CONSTRAINT banks_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  bank_id uuid NOT NULL REFERENCES banks (id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  type text NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'transfer')),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  reference text,
  note text
);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'retail' CHECK (module_key = 'retail'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  date date NOT NULL DEFAULT current_date,
  category text NOT NULL,
  account_id uuid,
  bank_id uuid REFERENCES banks (id) ON DELETE SET NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  reference text,
  attachment_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'void')),
  approved_by uuid,
  CONSTRAINT expenses_category_present CHECK (length(btrim(category)) > 0)
);

DO $$
DECLARE
  table_name text;
  business_tables text[] := ARRAY[
    'categories',
    'products',
    'product_stock',
    'stock_movements',
    'customers',
    'vendors',
    'salesmen',
    'invoices',
    'invoice_lines',
    'purchase_orders',
    'purchase_order_lines',
    'purchases',
    'purchase_lines',
    'purchase_returns',
    'refunds',
    'banks',
    'bank_transactions',
    'expenses'
  ];
BEGIN
  FOREACH table_name IN ARRAY business_tables LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (client_id, deleted_at)', table_name || '_tenant_idx', table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_tenant_isolation', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (client_id = app.current_client_id()) WITH CHECK (client_id = app.current_client_id())',
      table_name || '_tenant_isolation',
      table_name
    );
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS products_category_idx
  ON products (client_id, category_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS product_stock_warehouse_idx
  ON product_stock (client_id, warehouse_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS stock_movements_product_idx
  ON stock_movements (client_id, product_id, warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_customer_date_idx
  ON invoices (client_id, customer_id, date DESC);

CREATE INDEX IF NOT EXISTS invoices_status_date_idx
  ON invoices (client_id, status, date DESC);

CREATE INDEX IF NOT EXISTS invoice_lines_invoice_idx
  ON invoice_lines (invoice_id);

CREATE INDEX IF NOT EXISTS purchases_vendor_date_idx
  ON purchases (client_id, vendor_id, date DESC);

CREATE INDEX IF NOT EXISTS purchase_lines_purchase_idx
  ON purchase_lines (purchase_id);

CREATE INDEX IF NOT EXISTS purchase_order_lines_order_idx
  ON purchase_order_lines (order_id);

CREATE INDEX IF NOT EXISTS refunds_invoice_idx
  ON refunds (client_id, invoice_id);

CREATE INDEX IF NOT EXISTS purchase_returns_purchase_idx
  ON purchase_returns (client_id, purchase_id);

CREATE INDEX IF NOT EXISTS expenses_date_idx
  ON expenses (client_id, date DESC);

CREATE INDEX IF NOT EXISTS bank_transactions_bank_date_idx
  ON bank_transactions (client_id, bank_id, date DESC);
