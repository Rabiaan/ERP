ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS active_module text,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_active_module_key
    CHECK (active_module IS NULL OR active_module IN ('hr', 'retail', 'school', 'accounts'));

ALTER TABLE sessions
  ADD CONSTRAINT sessions_realm_context
    CHECK (
      (realm = 'platform' AND client_id IS NULL AND active_module IS NULL)
      OR (realm = 'tenant' AND client_id IS NOT NULL AND active_module IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS sessions_context_active_idx
  ON sessions (client_id, active_module)
  WHERE revoked_at IS NULL;
