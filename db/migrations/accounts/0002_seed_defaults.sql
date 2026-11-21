DO $$
DECLARE
  c uuid := app.current_client_id();
  m text := app.current_module_key();
  assets uuid;
  liabilities uuid;
  equity uuid;
  income uuid;
  expenses uuid;
  fiscal_name text;
BEGIN
  IF c IS NULL OR m IS NULL THEN
    RAISE EXCEPTION 'app.client_id and app.module_key must be set before seeding';
  END IF;

  IF m <> 'accounts' THEN
    RAISE EXCEPTION 'Accounts seed applied to module %', m;
  END IF;

  INSERT INTO branches (client_id, module_key, code, name, address, is_default)
  VALUES (c, m, 'HQ', 'Head Office', NULL, true)
  ON CONFLICT (client_id, module_key, code) DO NOTHING;

  INSERT INTO numbering_series (client_id, module_key, key, prefix, next_number, padding)
  VALUES (c, m, 'journal', 'JV-', 1, 5)
  ON CONFLICT (client_id, module_key, key) DO NOTHING;

  INSERT INTO tax_codes (client_id, module_key, code, name, rate, is_inclusive)
  VALUES
    (c, m, 'ST17', 'Sales Tax 17%', 17.0000, false),
    (c, m, 'ZERO', 'Zero Rated', 0.0000, false)
  ON CONFLICT (client_id, module_key, code) DO NOTHING;

  INSERT INTO chart_of_accounts (client_id, module_key, code, name, type, parent_id, is_group, is_active)
  VALUES
    (c, m, '1000', 'Assets', 'asset', NULL, true, true),
    (c, m, '2000', 'Liabilities', 'liability', NULL, true, true),
    (c, m, '3000', 'Equity', 'equity', NULL, true, true),
    (c, m, '4000', 'Income', 'income', NULL, true, true),
    (c, m, '5000', 'Expenses', 'expense', NULL, true, true)
  ON CONFLICT (client_id, code) DO NOTHING;

  SELECT id INTO assets FROM chart_of_accounts WHERE client_id = c AND code = '1000';
  SELECT id INTO liabilities FROM chart_of_accounts WHERE client_id = c AND code = '2000';
  SELECT id INTO equity FROM chart_of_accounts WHERE client_id = c AND code = '3000';
  SELECT id INTO income FROM chart_of_accounts WHERE client_id = c AND code = '4000';
  SELECT id INTO expenses FROM chart_of_accounts WHERE client_id = c AND code = '5000';

  INSERT INTO chart_of_accounts (client_id, module_key, code, name, type, parent_id, is_group, is_active)
  VALUES
    (c, m, '1010', 'Cash', 'asset', assets, false, true),
    (c, m, '1020', 'Bank', 'asset', assets, false, true),
    (c, m, '1100', 'Accounts Receivable', 'asset', assets, false, true),
    (c, m, '1200', 'Inventory', 'asset', assets, false, true),
    (c, m, '2010', 'Accounts Payable', 'liability', liabilities, false, true),
    (c, m, '2100', 'Tax Payable', 'liability', liabilities, false, true),
    (c, m, '3010', 'Owner''s Equity', 'equity', equity, false, true),
    (c, m, '4010', 'Sales Revenue', 'income', income, false, true),
    (c, m, '4020', 'Other Income', 'income', income, false, true),
    (c, m, '5010', 'Cost of Goods Sold', 'expense', expenses, false, true),
    (c, m, '5020', 'Salaries Expense', 'expense', expenses, false, true),
    (c, m, '5030', 'Rent Expense', 'expense', expenses, false, true),
    (c, m, '5040', 'Utilities Expense', 'expense', expenses, false, true)
  ON CONFLICT (client_id, code) DO NOTHING;

  fiscal_name := 'FY ' || extract(year FROM current_date)::int;
  INSERT INTO fiscal_periods (client_id, module_key, name, starts_on, ends_on, status)
  VALUES (
    c,
    m,
    fiscal_name,
    date_trunc('year', current_date)::date,
    (date_trunc('year', current_date) + interval '1 year - 1 day')::date,
    'open'
  )
  ON CONFLICT (client_id, name) DO NOTHING;

  INSERT INTO bank_accounts (client_id, module_key, name, account_number, bank_name, opening_balance, current_balance)
  VALUES (c, m, 'Main Bank', '0001', 'Main Bank', 0, 0)
  ON CONFLICT (client_id, account_number) DO NOTHING;
END;
$$;
