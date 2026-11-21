CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'accounts' CHECK (module_key = 'accounts'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL
    CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  parent_id uuid REFERENCES chart_of_accounts (id) ON DELETE SET NULL,
  is_group boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT chart_of_accounts_client_code_unique UNIQUE (client_id, code),
  CONSTRAINT chart_of_accounts_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'accounts' CHECK (module_key = 'accounts'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'locked')),
  CONSTRAINT fiscal_periods_dates_valid CHECK (ends_on > starts_on),
  CONSTRAINT fiscal_periods_name_unique UNIQUE (client_id, name)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'accounts' CHECK (module_key = 'accounts'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  number text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  period_id uuid REFERENCES fiscal_periods (id) ON DELETE RESTRICT,
  memo text,
  source text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'void')),
  posted_by uuid,
  posted_at timestamptz,
  CONSTRAINT journal_entries_client_number_unique UNIQUE (client_id, number)
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'accounts' CHECK (module_key = 'accounts'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  journal_entry_id uuid NOT NULL REFERENCES journal_entries (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES chart_of_accounts (id) ON DELETE RESTRICT,
  debit numeric(14, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description text,
  CONSTRAINT journal_lines_one_side CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'accounts' CHECK (module_key = 'accounts'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  account_number text NOT NULL,
  bank_name text,
  opening_balance numeric(14, 2) NOT NULL DEFAULT 0,
  current_balance numeric(14, 2) NOT NULL DEFAULT 0,
  CONSTRAINT bank_accounts_client_number_unique UNIQUE (client_id, account_number),
  CONSTRAINT bank_accounts_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'accounts' CHECK (module_key = 'accounts'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  date date NOT NULL DEFAULT current_date,
  bank_account_id uuid NOT NULL REFERENCES bank_accounts (id) ON DELETE CASCADE,
  statement_balance numeric(14, 2) NOT NULL DEFAULT 0,
  ledger_balance numeric(14, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reconciled')),
  reconciled_by uuid
);

CREATE TABLE IF NOT EXISTS ar_open_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'accounts' CHECK (module_key = 'accounts'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  customer_ref text NOT NULL,
  invoice_ref text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL,
  original numeric(14, 2) NOT NULL DEFAULT 0 CHECK (original >= 0),
  paid numeric(14, 2) NOT NULL DEFAULT 0 CHECK (paid >= 0),
  balance numeric(14, 2) NOT NULL DEFAULT 0,
  bucket text,
  CONSTRAINT ar_open_items_dates_valid CHECK (due_date >= date)
);

CREATE TABLE IF NOT EXISTS ap_open_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'accounts' CHECK (module_key = 'accounts'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  vendor_ref text NOT NULL,
  bill_ref text NOT NULL,
  date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL,
  original numeric(14, 2) NOT NULL DEFAULT 0 CHECK (original >= 0),
  paid numeric(14, 2) NOT NULL DEFAULT 0 CHECK (paid >= 0),
  balance numeric(14, 2) NOT NULL DEFAULT 0,
  bucket text,
  CONSTRAINT ap_open_items_dates_valid CHECK (due_date >= date)
);

DO $$
DECLARE
  table_name text;
  business_tables text[] := ARRAY[
    'chart_of_accounts',
    'fiscal_periods',
    'journal_entries',
    'journal_lines',
    'bank_accounts',
    'bank_reconciliations',
    'ar_open_items',
    'ap_open_items'
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

CREATE INDEX IF NOT EXISTS chart_of_accounts_parent_idx
  ON chart_of_accounts (client_id, parent_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS journal_entries_date_idx
  ON journal_entries (client_id, date DESC);

CREATE INDEX IF NOT EXISTS journal_entries_period_idx
  ON journal_entries (client_id, period_id, status);

CREATE INDEX IF NOT EXISTS journal_lines_entry_idx
  ON journal_lines (journal_entry_id);

CREATE INDEX IF NOT EXISTS journal_lines_account_idx
  ON journal_lines (client_id, account_id);

CREATE INDEX IF NOT EXISTS bank_reconciliations_account_idx
  ON bank_reconciliations (client_id, bank_account_id, date DESC);

CREATE INDEX IF NOT EXISTS ar_open_items_due_idx
  ON ar_open_items (client_id, due_date)
  WHERE balance > 0;

CREATE INDEX IF NOT EXISTS ap_open_items_due_idx
  ON ap_open_items (client_id, due_date)
  WHERE balance > 0;
