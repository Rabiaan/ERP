DO $$
DECLARE
  c uuid := app.current_client_id();
  m text := app.current_module_key();
BEGIN
  IF c IS NULL OR m IS NULL THEN
    RAISE EXCEPTION 'app.client_id and app.module_key must be set before seeding';
  END IF;

  IF m <> 'hr' THEN
    RAISE EXCEPTION 'HR seed applied to module %', m;
  END IF;

  INSERT INTO branches (client_id, module_key, code, name, address, is_default)
  VALUES (c, m, 'HQ', 'Head Office', NULL, true)
  ON CONFLICT (client_id, module_key, code) DO NOTHING;

  INSERT INTO locations (client_id, module_key, name, address, timezone, country)
  SELECT c, m, 'Head Office', NULL, 'Asia/Karachi', 'Pakistan'
  WHERE NOT EXISTS (
    SELECT 1 FROM locations
     WHERE client_id = c AND module_key = m AND name = 'Head Office' AND deleted_at IS NULL
  );

  INSERT INTO numbering_series (client_id, module_key, key, prefix, next_number, padding)
  VALUES
    (c, m, 'employee', 'EMP-', 1, 4),
    (c, m, 'leave', 'LV-', 1, 4),
    (c, m, 'payrun', 'PR-', 1, 4)
  ON CONFLICT (client_id, module_key, key) DO NOTHING;

  INSERT INTO departments (client_id, module_key, name, code, is_active)
  VALUES
    (c, m, 'Human Resources', 'HR', true),
    (c, m, 'Finance', 'FIN', true),
    (c, m, 'Operations', 'OPS', true),
    (c, m, 'Sales', 'SALES', true)
  ON CONFLICT (client_id, code) DO NOTHING;

  INSERT INTO leave_types (client_id, module_key, name, code, annual_quota, is_paid)
  VALUES
    (c, m, 'Annual Leave', 'ANNUAL', 20, true),
    (c, m, 'Sick Leave', 'SICK', 10, true),
    (c, m, 'Casual Leave', 'CASUAL', 5, true),
    (c, m, 'Unpaid Leave', 'UNPAID', 0, false)
  ON CONFLICT (client_id, code) DO NOTHING;
END;
$$;
