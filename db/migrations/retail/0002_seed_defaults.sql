DO $$
DECLARE
  c uuid := app.current_client_id();
  m text := app.current_module_key();
  default_branch uuid;
BEGIN
  IF c IS NULL OR m IS NULL THEN
    RAISE EXCEPTION 'app.client_id and app.module_key must be set before seeding';
  END IF;

  IF m <> 'retail' THEN
    RAISE EXCEPTION 'Retail seed applied to module %', m;
  END IF;

  INSERT INTO branches (client_id, module_key, code, name, address, is_default)
  VALUES (c, m, 'MAIN', 'Main Branch', NULL, true)
  ON CONFLICT (client_id, module_key, code) DO NOTHING;

  SELECT id INTO default_branch
    FROM branches
   WHERE client_id = c AND module_key = m AND code = 'MAIN';

  INSERT INTO warehouses (client_id, module_key, branch_id, code, name, is_default)
  VALUES (c, m, default_branch, 'MAIN', 'Main Warehouse', true)
  ON CONFLICT (client_id, module_key, code) DO NOTHING;

  INSERT INTO tax_codes (client_id, module_key, code, name, rate, is_inclusive)
  VALUES
    (c, m, 'ST17', 'Sales Tax 17%', 17.0000, false),
    (c, m, 'ZERO', 'Zero Rated', 0.0000, false)
  ON CONFLICT (client_id, module_key, code) DO NOTHING;

  INSERT INTO numbering_series (client_id, module_key, key, prefix, next_number, padding)
  VALUES
    (c, m, 'invoice', 'INV-', 1, 5),
    (c, m, 'purchase', 'PUR-', 1, 5),
    (c, m, 'purchase_return', 'PRT-', 1, 5),
    (c, m, 'refund', 'REF-', 1, 5)
  ON CONFLICT (client_id, module_key, key) DO NOTHING;

  INSERT INTO categories (client_id, module_key, name, parent_id, is_active)
  SELECT c, m, seed.name, NULL, true
    FROM (VALUES ('General'), ('Beverages'), ('Groceries'), ('Electronics')) AS seed(name)
   WHERE NOT EXISTS (
     SELECT 1 FROM categories
      WHERE client_id = c AND module_key = m AND name = seed.name AND deleted_at IS NULL
   );

  INSERT INTO banks (client_id, module_key, name, account_number, opening_balance, current_balance, is_active)
  VALUES
    (c, m, 'Main Bank', '0001', 0, 0, true),
    (c, m, 'Cash Box', 'CASH', 0, 0, true)
  ON CONFLICT (client_id, account_number) DO NOTHING;
END;
$$;
