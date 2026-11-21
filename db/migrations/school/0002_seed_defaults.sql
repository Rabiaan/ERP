DO $$
DECLARE
  c uuid := app.current_client_id();
  m text := app.current_module_key();
BEGIN
  IF c IS NULL OR m IS NULL THEN
    RAISE EXCEPTION 'app.client_id and app.module_key must be set before seeding';
  END IF;

  IF m <> 'school' THEN
    RAISE EXCEPTION 'School seed applied to module %', m;
  END IF;

  INSERT INTO branches (client_id, module_key, code, name, address, is_default)
  VALUES (c, m, 'MAIN', 'Main Campus', NULL, true)
  ON CONFLICT (client_id, module_key, code) DO NOTHING;

  INSERT INTO numbering_series (client_id, module_key, key, prefix, next_number, padding)
  VALUES
    (c, m, 'admission', 'ADM-', 1, 4),
    (c, m, 'fee_invoice', 'FEE-', 1, 5)
  ON CONFLICT (client_id, module_key, key) DO NOTHING;

  INSERT INTO classes (client_id, module_key, name, code, level, capacity)
  VALUES
    (c, m, 'Playgroup', 'PG', 0, 25),
    (c, m, 'Nursery', 'NUR', 1, 25),
    (c, m, 'Kindergarten', 'KG', 2, 30),
    (c, m, 'Grade 1', 'G1', 3, 30),
    (c, m, 'Grade 2', 'G2', 4, 30),
    (c, m, 'Grade 3', 'G3', 5, 30),
    (c, m, 'Grade 4', 'G4', 6, 30),
    (c, m, 'Grade 5', 'G5', 7, 30),
    (c, m, 'Grade 6', 'G6', 8, 35),
    (c, m, 'Grade 7', 'G7', 9, 35),
    (c, m, 'Grade 8', 'G8', 10, 35),
    (c, m, 'Grade 9', 'G9', 11, 40),
    (c, m, 'Grade 10', 'G10', 12, 40)
  ON CONFLICT (client_id, code) DO NOTHING;

  INSERT INTO sections (client_id, module_key, class_id, name)
  SELECT c, m, cls.id, 'A'
    FROM classes cls
   WHERE cls.client_id = c
     AND cls.module_key = m
     AND cls.deleted_at IS NULL
  ON CONFLICT (client_id, class_id, name) DO NOTHING;

  INSERT INTO fee_heads (client_id, module_key, name, code, amount, frequency, is_optional)
  VALUES
    (c, m, 'Tuition Fee', 'TUITION', 5000, 'monthly', false),
    (c, m, 'Admission Fee', 'ADMISSION', 10000, 'one_time', false),
    (c, m, 'Transport Fee', 'TRANSPORT', 3000, 'monthly', true),
    (c, m, 'Examination Fee', 'EXAM', 1500, 'quarterly', false)
  ON CONFLICT (client_id, code) DO NOTHING;
END;
$$;
