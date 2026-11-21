CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key citext NOT NULL UNIQUE,
  name text NOT NULL,
  max_users integer NOT NULL DEFAULT 5
    CHECK (max_users >= 1),
  max_branches integer NOT NULL DEFAULT 1
    CHECK (max_branches >= 1),
  max_modules integer NOT NULL DEFAULT 1
    CHECK (max_modules >= 1),
  storage_mb bigint NOT NULL DEFAULT 1024
    CHECK (storage_mb >= 0),
  price_pkr numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (price_pkr >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plans_key_shape CHECK (key::text ~ '^[a-z][a-z0-9-]*$')
);

CREATE OR REPLACE TRIGGER plans_set_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug citext NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'active', 'suspended', 'archived')),
  plan_id uuid NOT NULL REFERENCES plans (id) ON DELETE RESTRICT,
  max_users integer,
  max_branches integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT clients_name_present CHECK (length(btrim(name)) > 0),
  CONSTRAINT clients_slug_shape
    CHECK (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT clients_max_users_positive
    CHECK (max_users IS NULL OR max_users >= 1),
  CONSTRAINT clients_max_branches_positive
    CHECK (max_branches IS NULL OR max_branches >= 1)
);

CREATE OR REPLACE TRIGGER clients_set_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS clients_status_idx
  ON clients (status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS modules (
  key text PRIMARY KEY
    CHECK (key IN ('hr', 'retail', 'school', 'accounts')),
  name text NOT NULL,
  latest_version text NOT NULL DEFAULT '1.0.0',
  migration_path text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER modules_set_updated_at
  BEFORE UPDATE ON modules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO modules (key, name, latest_version, migration_path)
VALUES
  ('hr', 'Human Resources', '1.0.0', 'db/migrations/hr'),
  ('retail', 'Retail', '1.0.0', 'db/migrations/retail'),
  ('school', 'School', '1.0.0', 'db/migrations/school'),
  ('accounts', 'Accounts', '1.0.0', 'db/migrations/accounts')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS client_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES modules (key) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'active', 'disabled', 'archived')),
  granted_by uuid,
  db_name text UNIQUE,
  db_secret_ref text,
  schema_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_modules_unique UNIQUE (client_id, module_key),
  CONSTRAINT client_modules_db_name_shape
    CHECK (db_name IS NULL OR db_name ~ '^tenant_[a-z0-9_]+$'),
  CONSTRAINT client_modules_active_is_complete
    CHECK (
      status <> 'active'
      OR (db_name IS NOT NULL AND db_secret_ref IS NOT NULL AND schema_version IS NOT NULL)
    )
);

CREATE OR REPLACE TRIGGER client_modules_set_updated_at
  BEFORE UPDATE ON client_modules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS client_modules_status_idx
  ON client_modules (status);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES modules (key) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'custom'
    CHECK (role IN ('client_admin', 'module_admin', 'manager', 'operator', 'viewer', 'custom')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'revoked')),
  created_by uuid,
  created_by_membership_id uuid REFERENCES memberships (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_unique UNIQUE (user_id, client_id, module_key),
  CONSTRAINT memberships_no_self_delegation
    CHECK (created_by_membership_id IS NULL OR created_by_membership_id <> id)
);

CREATE OR REPLACE TRIGGER memberships_set_updated_at
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS memberships_user_client_idx
  ON memberships (user_id, client_id);

CREATE INDEX IF NOT EXISTS memberships_client_module_idx
  ON memberships (client_id, module_key);

CREATE INDEX IF NOT EXISTS memberships_delegation_idx
  ON memberships (created_by_membership_id)
  WHERE created_by_membership_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES modules (key) ON DELETE RESTRICT,
  name text NOT NULL,
  permissions_json jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(permissions_json) = 'array'),
  created_by uuid,
  created_by_membership_id uuid REFERENCES memberships (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_name_present CHECK (length(btrim(name)) > 0),
  CONSTRAINT roles_unique_name UNIQUE (client_id, module_key, name)
);

CREATE OR REPLACE TRIGGER roles_set_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS roles_client_module_idx
  ON roles (client_id, module_key);

CREATE TABLE IF NOT EXISTS permissions (
  key text PRIMARY KEY
    CHECK (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  module_key text NOT NULL
    CHECK (module_key IN ('platform', 'administration', 'hr', 'retail', 'school', 'accounts')),
  resource text NOT NULL,
  action text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permissions_key_matches_parts
    CHECK (key = module_key || '.' || resource || '.' || action)
);

CREATE INDEX IF NOT EXISTS permissions_module_idx
  ON permissions (module_key, resource);

CREATE TABLE IF NOT EXISTS role_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES memberships (id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permissions (key) ON DELETE RESTRICT,
  role_id uuid REFERENCES roles (id) ON DELETE SET NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_grants_unique UNIQUE (membership_id, permission_key),
  CONSTRAINT role_grants_not_platform
    CHECK (permission_key NOT LIKE 'platform.%')
);

CREATE INDEX IF NOT EXISTS role_grants_membership_idx
  ON role_grants (membership_id);

CREATE INDEX IF NOT EXISTS role_grants_role_idx
  ON role_grants (role_id)
  WHERE role_id IS NOT NULL;

ALTER TABLE invite_tokens
  ADD CONSTRAINT invite_tokens_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE;
