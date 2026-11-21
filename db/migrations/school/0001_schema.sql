CREATE TABLE IF NOT EXISTS guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  relation text,
  phone text,
  email text,
  cnic text,
  address text,
  CONSTRAINT guardians_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  code text NOT NULL,
  level integer NOT NULL DEFAULT 0 CHECK (level >= 0),
  capacity integer NOT NULL DEFAULT 30 CHECK (capacity >= 1),
  CONSTRAINT classes_client_code_unique UNIQUE (client_id, code),
  CONSTRAINT classes_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  class_id uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  name text NOT NULL,
  class_teacher_id uuid,
  CONSTRAINT sections_client_class_name_unique UNIQUE (client_id, class_id, name),
  CONSTRAINT sections_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  admission_no text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  dob date,
  gender text CHECK (gender IN ('male', 'female', 'other')),
  guardian_id uuid REFERENCES guardians (id) ON DELETE SET NULL,
  class_id uuid REFERENCES classes (id) ON DELETE SET NULL,
  section_id uuid REFERENCES sections (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('applicant', 'active', 'graduated', 'withdrawn', 'suspended')),
  admitted_on date NOT NULL DEFAULT current_date,
  CONSTRAINT students_client_admission_unique UNIQUE (client_id, admission_no)
);

CREATE TABLE IF NOT EXISTS student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES guardians (id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  CONSTRAINT student_guardians_unique UNIQUE (client_id, student_id, guardian_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS student_guardians_one_primary_idx
  ON student_guardians (client_id, student_id)
  WHERE is_primary AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  code text NOT NULL,
  class_id uuid REFERENCES classes (id) ON DELETE SET NULL,
  is_elective boolean NOT NULL DEFAULT false,
  CONSTRAINT subjects_client_code_unique UNIQUE (client_id, code),
  CONSTRAINT subjects_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
  section_id uuid REFERENCES sections (id) ON DELETE SET NULL,
  academic_year text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'withdrawn')),
  CONSTRAINT enrollments_unique UNIQUE (client_id, student_id, academic_year)
);

CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes (id) ON DELETE SET NULL,
  section_id uuid REFERENCES sections (id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'absent', 'late', 'leave')),
  remarks text,
  CONSTRAINT attendance_client_student_date_unique UNIQUE (client_id, student_id, date)
);

CREATE TABLE IF NOT EXISTS exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  term text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  class_id uuid REFERENCES classes (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'ongoing', 'completed')),
  CONSTRAINT exams_dates_valid CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  exam_id uuid NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
  marks_obtained numeric(7, 2) NOT NULL DEFAULT 0 CHECK (marks_obtained >= 0),
  max_marks numeric(7, 2) NOT NULL DEFAULT 100 CHECK (max_marks > 0),
  grade text,
  CONSTRAINT grades_unique UNIQUE (client_id, exam_id, student_id, subject_id),
  CONSTRAINT grades_marks_within_max CHECK (marks_obtained <= max_marks)
);

CREATE TABLE IF NOT EXISTS fee_heads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  code text NOT NULL,
  amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  frequency text NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('one_time', 'monthly', 'quarterly', 'annual')),
  is_optional boolean NOT NULL DEFAULT false,
  CONSTRAINT fee_heads_client_code_unique UNIQUE (client_id, code),
  CONSTRAINT fee_heads_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS fee_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  number text NOT NULL,
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
  period text NOT NULL,
  due_date date NOT NULL,
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  discount numeric(14, 2) NOT NULL DEFAULT 0,
  total numeric(14, 2) NOT NULL DEFAULT 0,
  paid numeric(14, 2) NOT NULL DEFAULT 0,
  balance numeric(14, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'partial', 'paid', 'void')),
  CONSTRAINT fee_invoices_client_number_unique UNIQUE (client_id, number)
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  invoice_id uuid NOT NULL REFERENCES fee_invoices (id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
  date date NOT NULL DEFAULT current_date,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  method text,
  reference text,
  received_by uuid,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'reversed'))
);

CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  employee_no text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  department text,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_leave', 'resigned')),
  CONSTRAINT staff_client_number_unique UNIQUE (client_id, employee_no)
);

CREATE TABLE IF NOT EXISTS timetable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  class_id uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  section_id uuid REFERENCES sections (id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
  teacher_id uuid,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  room text,
  CONSTRAINT timetable_time_valid CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS transport_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'school' CHECK (module_key = 'school'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  vehicle_no text NOT NULL,
  driver_name text,
  driver_phone text,
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity >= 1),
  fee numeric(14, 2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  CONSTRAINT transport_routes_client_vehicle_unique UNIQUE (client_id, vehicle_no)
);

DO $$
DECLARE
  table_name text;
  business_tables text[] := ARRAY[
    'guardians',
    'classes',
    'sections',
    'students',
    'student_guardians',
    'subjects',
    'enrollments',
    'attendance',
    'exams',
    'grades',
    'fee_heads',
    'fee_invoices',
    'fee_payments',
    'staff',
    'timetable',
    'transport_routes'
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

CREATE INDEX IF NOT EXISTS students_class_idx
  ON students (client_id, class_id, section_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS sections_class_idx
  ON sections (client_id, class_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS enrollments_student_idx
  ON enrollments (client_id, student_id, academic_year);

CREATE INDEX IF NOT EXISTS attendance_student_date_idx
  ON attendance (client_id, student_id, date DESC);

CREATE INDEX IF NOT EXISTS attendance_class_date_idx
  ON attendance (client_id, class_id, date DESC);

CREATE INDEX IF NOT EXISTS grades_exam_idx
  ON grades (client_id, exam_id, student_id);

CREATE INDEX IF NOT EXISTS fee_invoices_student_idx
  ON fee_invoices (client_id, student_id, due_date DESC);

CREATE INDEX IF NOT EXISTS fee_invoices_status_idx
  ON fee_invoices (client_id, status, due_date);

CREATE INDEX IF NOT EXISTS fee_payments_invoice_idx
  ON fee_payments (client_id, invoice_id);

CREATE INDEX IF NOT EXISTS timetable_class_day_idx
  ON timetable (client_id, class_id, section_id, day_of_week);

CREATE INDEX IF NOT EXISTS staff_department_idx
  ON staff (client_id, department)
  WHERE deleted_at IS NULL;
