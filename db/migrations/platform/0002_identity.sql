CREATE TABLE IF NOT EXISTS platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  mfa_secret_enc text,
  mfa_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'disabled')),
  must_change_password boolean NOT NULL DEFAULT true,
  failed_login_count integer NOT NULL DEFAULT 0
    CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_users_email_shape
    CHECK (email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT platform_users_mfa_secret
    CHECK (NOT mfa_enabled OR mfa_secret_enc IS NOT NULL)
);

CREATE OR REPLACE TRIGGER platform_users_set_updated_at
  BEFORE UPDATE ON platform_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  password_hash text,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'suspended', 'disabled')),
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret_enc text,
  must_change_password boolean NOT NULL DEFAULT true,
  failed_login_count integer NOT NULL DEFAULT 0
    CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  invited_by uuid,
  invite_expires_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT users_email_shape
    CHECK (email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT users_mfa_secret
    CHECK (NOT mfa_enabled OR mfa_secret_enc IS NOT NULL)
);

CREATE OR REPLACE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS users_status_idx
  ON users (status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL
    CHECK (actor_type IN ('platform', 'tenant')),
  realm text NOT NULL
    CHECK (realm IN ('platform', 'tenant')),
  user_id uuid NOT NULL,
  refresh_token_hash text NOT NULL UNIQUE,
  csrf_secret text NOT NULL,
  expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_realm_matches_actor CHECK (actor_type = realm),
  CONSTRAINT sessions_refresh_after_access CHECK (refresh_expires_at >= expires_at)
);

CREATE OR REPLACE TRIGGER sessions_set_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS sessions_user_active_idx
  ON sessions (user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS sessions_refresh_expiry_idx
  ON sessions (refresh_expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_id uuid,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_tokens_user_idx
  ON invite_tokens (user_id, expires_at);
