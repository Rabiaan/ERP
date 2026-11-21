ALTER TABLE provisioning_jobs
  ADD COLUMN IF NOT EXISTS initial_grants text[] NOT NULL DEFAULT '{}';
