CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only table %.% rejects %', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION app.current_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.client_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_module_key()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.module_key', true), '');
$$;

CREATE TABLE IF NOT EXISTS tenant_meta (
  id smallint PRIMARY KEY DEFAULT 1
    CHECK (id = 1),
  client_id uuid NOT NULL,
  module_key text NOT NULL
    CHECK (module_key IN ('hr', 'retail', 'school', 'accounts')),
  schema_version text NOT NULL DEFAULT '1.0.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS module_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL
    CHECK (module_key IN ('hr', 'retail', 'school', 'accounts')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  email citext,
  role_label text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'suspended', 'disabled')),
  CONSTRAINT module_users_client_user_unique UNIQUE (client_id, user_id)
);

CREATE TABLE IF NOT EXISTS module_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL
    CHECK (module_key IN ('hr', 'retail', 'school', 'accounts')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(settings) = 'object'),
  CONSTRAINT module_settings_client_unique UNIQUE (client_id, module_key)
);

CREATE TABLE IF NOT EXISTS module_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL
    CHECK (module_key IN ('hr', 'retail', 'school', 'accounts')),
  actor_id uuid,
  actor_type text NOT NULL
    CHECK (actor_type IN ('platform', 'tenant', 'system')),
  action text NOT NULL,
  entity text,
  entity_id uuid,
  "before" jsonb,
  "after" jsonb,
  reason text,
  platform_override boolean NOT NULL DEFAULT false,
  request_id text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT module_audit_action_present CHECK (length(btrim(action)) > 0)
);

CREATE TABLE IF NOT EXISTS __migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  checksum text NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL
    CHECK (module_key IN ('hr', 'retail', 'school', 'accounts')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  code text NOT NULL,
  name text NOT NULL,
  address text,
  is_default boolean NOT NULL DEFAULT false,
  CONSTRAINT branches_client_code_unique UNIQUE (client_id, module_key, code)
);

CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL
    CHECK (module_key IN ('hr', 'retail', 'school', 'accounts')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  branch_id uuid NOT NULL REFERENCES branches (id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  CONSTRAINT warehouses_client_code_unique UNIQUE (client_id, module_key, code)
);

CREATE TABLE IF NOT EXISTS tax_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL
    CHECK (module_key IN ('hr', 'retail', 'school', 'accounts')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  code text NOT NULL,
  name text NOT NULL,
  rate numeric(14, 4) NOT NULL DEFAULT 0
    CHECK (rate >= 0),
  is_inclusive boolean NOT NULL DEFAULT false,
  CONSTRAINT tax_codes_client_code_unique UNIQUE (client_id, module_key, code)
);

CREATE TABLE IF NOT EXISTS numbering_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module_key text NOT NULL
    CHECK (module_key IN ('hr', 'retail', 'school', 'accounts')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  key text NOT NULL,
  prefix text NOT NULL DEFAULT '',
  next_number integer NOT NULL DEFAULT 1
    CHECK (next_number >= 1),
  padding smallint NOT NULL DEFAULT 4
    CHECK (padding BETWEEN 1 AND 12),
  CONSTRAINT numbering_series_client_key_unique UNIQUE (client_id, module_key, key)
);

CREATE INDEX IF NOT EXISTS module_users_client_idx
  ON module_users (client_id, deleted_at);

CREATE INDEX IF NOT EXISTS module_settings_client_idx
  ON module_settings (client_id, deleted_at);

CREATE INDEX IF NOT EXISTS module_audit_client_created_idx
  ON module_audit (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS module_audit_entity_idx
  ON module_audit (entity, entity_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS branches_one_default_idx
  ON branches (client_id, module_key)
  WHERE is_default AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_default_idx
  ON warehouses (client_id, module_key)
  WHERE is_default AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tax_codes_client_idx
  ON tax_codes (client_id, deleted_at);

CREATE INDEX IF NOT EXISTS numbering_series_client_idx
  ON numbering_series (client_id, deleted_at);

DO $$
DECLARE
  table_name text;
  shared_tables text[] := ARRAY[
    'tenant_meta',
    'module_users',
    'module_settings',
    'module_audit',
    'branches',
    'warehouses',
    'tax_codes',
    'numbering_series'
  ];
  versioned_tables text[] := ARRAY[
    'module_users',
    'module_settings',
    'branches',
    'warehouses',
    'tax_codes',
    'numbering_series'
  ];
BEGIN
  FOREACH table_name IN ARRAY shared_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_tenant_isolation', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (client_id = app.current_client_id()) WITH CHECK (client_id = app.current_client_id())',
      table_name || '_tenant_isolation',
      table_name
    );
  END LOOP;

  FOREACH table_name IN ARRAY versioned_tables LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE TRIGGER module_audit_append_only
  BEFORE UPDATE OR DELETE ON module_audit
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE OR REPLACE TRIGGER module_audit_no_truncate
  BEFORE TRUNCATE ON module_audit
  FOR EACH STATEMENT EXECUTE FUNCTION reject_append_only_mutation();

INSERT INTO tenant_meta (client_id, module_key)
SELECT app.current_client_id(), app.current_module_key()
WHERE app.current_client_id() IS NOT NULL
  AND app.current_module_key() IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tenant_meta);

DO $$
DECLARE
  existing_client uuid;
  existing_module text;
BEGIN
  SELECT client_id, module_key INTO existing_client, existing_module
    FROM tenant_meta
   WHERE id = 1;

  IF existing_client IS NULL THEN
    RAISE EXCEPTION 'tenant_meta was not initialized; app.client_id and app.module_key must be set';
  END IF;

  IF existing_client <> app.current_client_id() OR existing_module <> app.current_module_key() THEN
    RAISE EXCEPTION 'tenant_meta identity mismatch: database belongs to %/%, caller set %/%',
      existing_client, existing_module, app.current_client_id(), app.current_module_key();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.grant_tenant_role()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  app_role text := nullif(current_setting('lilac.tenant_app_role', true), '');
  obj record;
BEGIN
  IF app_role IS NULL THEN
    RAISE EXCEPTION 'lilac.tenant_app_role is not set';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    RAISE EXCEPTION 'tenant application role % does not exist', app_role;
  END IF;

  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), app_role);
  EXECUTE 'REVOKE ALL ON SCHEMA public FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON SCHEMA app FROM PUBLIC';
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);
  EXECUTE format('GRANT USAGE ON SCHEMA app TO %I', app_role);

  FOR obj IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', obj.tablename);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO %I', obj.tablename, app_role);
  END LOOP;

  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.module_audit FROM %I', app_role);
  EXECUTE format('GRANT SELECT, INSERT ON public.module_audit TO %I', app_role);
  EXECUTE format('REVOKE ALL ON public.__migrations FROM %I', app_role);

  FOR obj IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO %I', obj.sequencename, app_role);
  END LOOP;

  EXECUTE format('GRANT EXECUTE ON FUNCTION app.current_client_id() TO %I', app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.current_module_key() TO %I', app_role);
  EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', app_role);

  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    app_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
    app_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO %I',
    app_role
  );
END;
$$;

REVOKE ALL ON FUNCTION app.grant_tenant_role() FROM PUBLIC;
