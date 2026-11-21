CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  code text NOT NULL,
  head_employee_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT departments_client_code_unique UNIQUE (client_id, code),
  CONSTRAINT departments_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  address text,
  timezone text NOT NULL DEFAULT 'Asia/Karachi',
  country text NOT NULL DEFAULT 'Pakistan',
  CONSTRAINT locations_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  employee_no text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  dob date,
  gender text CHECK (gender IN ('male', 'female', 'other')),
  address text,
  department_id uuid REFERENCES departments (id) ON DELETE SET NULL,
  title text,
  manager_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  location_id uuid REFERENCES locations (id) ON DELETE SET NULL,
  employment_type text NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'intern')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_leave', 'probation', 'terminated')),
  hire_date date NOT NULL DEFAULT current_date,
  exit_date date,
  salary_base numeric(14, 2) NOT NULL DEFAULT 0 CHECK (salary_base >= 0),
  emergency_contact jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(emergency_contact) = 'object'),
  CONSTRAINT employees_client_number_unique UNIQUE (client_id, employee_no),
  CONSTRAINT employees_client_email_unique UNIQUE (client_id, email),
  CONSTRAINT employees_dates_valid CHECK (exit_date IS NULL OR exit_date >= hire_date)
);

CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  clock_in timestamptz,
  clock_out timestamptz,
  hours numeric(6, 2) NOT NULL DEFAULT 0 CHECK (hours >= 0),
  status text NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'late', 'absent', 'remote')),
  source text,
  notes text,
  CONSTRAINT attendance_client_employee_date_unique UNIQUE (client_id, employee_id, date),
  CONSTRAINT attendance_clock_order CHECK (clock_out IS NULL OR clock_in IS NULL OR clock_out >= clock_in)
);

CREATE TABLE IF NOT EXISTS leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  code text NOT NULL,
  annual_quota numeric(6, 1) NOT NULL DEFAULT 0 CHECK (annual_quota >= 0),
  is_paid boolean NOT NULL DEFAULT true,
  CONSTRAINT leave_types_client_code_unique UNIQUE (client_id, code),
  CONSTRAINT leave_types_name_present CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES leave_types (id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  entitled numeric(6, 1) NOT NULL DEFAULT 0 CHECK (entitled >= 0),
  used numeric(6, 1) NOT NULL DEFAULT 0 CHECK (used >= 0),
  pending numeric(6, 1) NOT NULL DEFAULT 0 CHECK (pending >= 0),
  CONSTRAINT leave_balances_unique UNIQUE (client_id, employee_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES leave_types (id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric(6, 1) NOT NULL CHECK (days > 0),
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approver_id uuid,
  decided_at timestamptz,
  comment text,
  CONSTRAINT leave_requests_dates_valid CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  base numeric(14, 2) NOT NULL DEFAULT 0 CHECK (base >= 0),
  allowances jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(allowances) = 'array'),
  deductions jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(deductions) = 'array'),
  currency char(3) NOT NULL DEFAULT 'PKR',
  effective_from date NOT NULL DEFAULT current_date
);

CREATE TABLE IF NOT EXISTS pay_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'processing', 'approved', 'paid')),
  totals jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(totals) = 'object'),
  approved_by uuid,
  CONSTRAINT pay_runs_period_valid CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  pay_run_id uuid NOT NULL REFERENCES pay_runs (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  base numeric(14, 2) NOT NULL DEFAULT 0 CHECK (base >= 0),
  allowances numeric(14, 2) NOT NULL DEFAULT 0 CHECK (allowances >= 0),
  deductions numeric(14, 2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
  gross numeric(14, 2) NOT NULL DEFAULT 0 CHECK (gross >= 0),
  net numeric(14, 2) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'PKR',
  payment_method text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'void')),
  CONSTRAINT payslips_run_employee_unique UNIQUE (client_id, pay_run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS job_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  title text NOT NULL,
  department_id uuid REFERENCES departments (id) ON DELETE SET NULL,
  location_id uuid REFERENCES locations (id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'full_time'
    CHECK (type IN ('full_time', 'part_time', 'contract', 'intern')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'on_hold', 'closed')),
  hiring_manager_id uuid,
  opened_at date NOT NULL DEFAULT current_date,
  experience_level text
);

CREATE TABLE IF NOT EXISTS candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  job_id uuid NOT NULL REFERENCES job_openings (id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  stage text NOT NULL DEFAULT 'applied'
    CHECK (stage IN ('applied', 'screen', 'interview', 'offer', 'hired', 'rejected')),
  source text,
  rating numeric(3, 1) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  applied_date date NOT NULL DEFAULT current_date,
  resume_url text,
  notes text
);

CREATE TABLE IF NOT EXISTS interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  candidate_id uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  interviewer_id uuid,
  scheduled_at timestamptz NOT NULL,
  mode text NOT NULL DEFAULT 'onsite'
    CHECK (mode IN ('onsite', 'phone', 'video')),
  meet_link text,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'))
);

CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text,
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  due_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS review_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  name text NOT NULL,
  period text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed')),
  due_date date
);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  cycle_id uuid NOT NULL REFERENCES review_cycles (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  reviewer_id uuid,
  rating numeric(3, 1) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'acknowledged')),
  comments text,
  CONSTRAINT reviews_cycle_employee_unique UNIQUE (client_id, cycle_id, employee_id)
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL DEFAULT 'hr' CHECK (module_key = 'hr'),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid,
  expires_at date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'archived'))
);

DO $$
DECLARE
  table_name text;
  business_tables text[] := ARRAY[
    'departments',
    'locations',
    'employees',
    'attendance',
    'leave_types',
    'leave_balances',
    'leave_requests',
    'salary_structures',
    'pay_runs',
    'payslips',
    'job_openings',
    'candidates',
    'interviews',
    'goals',
    'review_cycles',
    'reviews',
    'documents'
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

CREATE INDEX IF NOT EXISTS employees_department_idx
  ON employees (client_id, department_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS employees_manager_idx
  ON employees (client_id, manager_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_employee_date_idx
  ON attendance (client_id, employee_id, date DESC);

CREATE INDEX IF NOT EXISTS leave_requests_status_date_idx
  ON leave_requests (client_id, status, start_date);

CREATE INDEX IF NOT EXISTS leave_requests_employee_idx
  ON leave_requests (client_id, employee_id, start_date DESC);

CREATE INDEX IF NOT EXISTS payslips_run_idx
  ON payslips (client_id, pay_run_id);

CREATE INDEX IF NOT EXISTS candidates_job_stage_idx
  ON candidates (client_id, job_id, stage);

CREATE INDEX IF NOT EXISTS interviews_candidate_date_idx
  ON interviews (client_id, candidate_id, scheduled_at);

CREATE INDEX IF NOT EXISTS goals_employee_idx
  ON goals (client_id, employee_id, status);

CREATE INDEX IF NOT EXISTS reviews_cycle_idx
  ON reviews (client_id, cycle_id);

CREATE INDEX IF NOT EXISTS documents_employee_idx
  ON documents (client_id, employee_id, type);
