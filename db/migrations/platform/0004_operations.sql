CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES modules (key) ON DELETE RESTRICT,
  step text NOT NULL DEFAULT 'queued',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0
    CHECK (attempts >= 0 AND attempts <= 5),
  last_error text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(steps) = 'array'),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER provisioning_jobs_set_updated_at
  BEFORE UPDATE ON provisioning_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS provisioning_jobs_one_active_idx
  ON provisioning_jobs (client_id, module_key)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS provisioning_jobs_status_idx
  ON provisioning_jobs (status, created_at);

CREATE TABLE IF NOT EXISTS db_registry (
  client_id uuid NOT NULL,
  module_key text NOT NULL,
  db_name text NOT NULL UNIQUE
    CHECK (db_name ~ '^tenant_[a-z0-9_]+$'),
  secret_ref text NOT NULL,
  pool_config jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(pool_config) = 'object'),
  health text NOT NULL DEFAULT 'unknown'
    CHECK (health IN ('unknown', 'healthy', 'degraded', 'down')),
  schema_version text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, module_key),
  CONSTRAINT db_registry_client_module_fkey
    FOREIGN KEY (client_id, module_key)
    REFERENCES client_modules (client_id, module_key)
    ON DELETE CASCADE
);

CREATE OR REPLACE TRIGGER db_registry_set_updated_at
  BEFORE UPDATE ON db_registry
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS db_registry_health_idx
  ON db_registry (health);

CREATE TABLE IF NOT EXISTS usage_counters (
  client_id uuid NOT NULL,
  module_key text NOT NULL,
  metric text NOT NULL,
  value bigint NOT NULL DEFAULT 0
    CHECK (value >= 0),
  period_start timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, module_key, metric, period_start),
  CONSTRAINT usage_counters_client_module_fkey
    FOREIGN KEY (client_id, module_key)
    REFERENCES client_modules (client_id, module_key)
    ON DELETE CASCADE,
  CONSTRAINT usage_counters_metric_present CHECK (length(btrim(metric)) > 0)
);

CREATE OR REPLACE TRIGGER usage_counters_set_updated_at
  BEFORE UPDATE ON usage_counters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL
    CHECK (actor_type IN ('platform', 'tenant', 'system')),
  actor_id uuid,
  client_id uuid,
  module_key text,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip inet,
  user_agent text,
  request_id text,
  platform_override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_action_present CHECK (length(btrim(action)) > 0)
);

CREATE INDEX IF NOT EXISTS audit_events_client_created_idx
  ON audit_events (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx
  ON audit_events (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_action_created_idx
  ON audit_events (action, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0
    CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_key, window_start)
);

CREATE OR REPLACE TRIGGER rate_limit_buckets_set_updated_at
  BEFORE UPDATE ON rate_limit_buckets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS platform_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL REFERENCES platform_users (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES modules (key) ON DELETE RESTRICT,
  mode text NOT NULL
    CHECK (mode IN ('inspect', 'support')),
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  ended_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_module_access_reason_present
    CHECK (length(btrim(reason)) >= 3),
  CONSTRAINT platform_module_access_timeboxed
    CHECK (expires_at > started_at)
);

CREATE OR REPLACE TRIGGER platform_module_access_set_updated_at
  BEFORE UPDATE ON platform_module_access
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS platform_module_access_user_idx
  ON platform_module_access (platform_user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS platform_module_access_client_idx
  ON platform_module_access (client_id, module_key, started_at DESC);

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL REFERENCES platform_users (id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT impersonation_sessions_reason_present
    CHECK (length(btrim(reason)) >= 3)
);

CREATE OR REPLACE TRIGGER impersonation_sessions_set_updated_at
  BEFORE UPDATE ON impersonation_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS impersonation_sessions_user_idx
  ON impersonation_sessions (platform_user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS platform_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  attempts integer NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT platform_events_type_present CHECK (length(btrim(type)) > 0)
);

CREATE INDEX IF NOT EXISTS platform_events_pending_idx
  ON platform_events (created_at)
  WHERE processed_at IS NULL;
