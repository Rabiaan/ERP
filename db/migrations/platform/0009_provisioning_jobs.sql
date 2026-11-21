ALTER TABLE provisioning_jobs
  ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'provision',
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS admin_user_id uuid REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE provisioning_jobs
  ADD CONSTRAINT provisioning_jobs_type_check
    CHECK (job_type IN ('provision', 'deprovision'));

CREATE INDEX IF NOT EXISTS provisioning_jobs_ready_idx
  ON provisioning_jobs (status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'failed');
