DO $$
DECLARE
  app_password text := nullif(current_setting('lilac.app_password', true), '');
  migrator_password text := nullif(current_setting('lilac.migrator_password', true), '');
BEGIN
  IF app_password IS NULL OR length(app_password) < 16 THEN
    RAISE EXCEPTION 'lilac.app_password must be set and at least 16 characters';
  END IF;

  IF migrator_password IS NULL OR length(migrator_password) < 16 THEN
    RAISE EXCEPTION 'lilac.migrator_password must be set and at least 16 characters';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lilac_platform_app') THEN
    EXECUTE format(
      'ALTER ROLE lilac_platform_app WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
      app_password
    );
  ELSE
    EXECUTE format(
      'CREATE ROLE lilac_platform_app WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
      app_password
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lilac_migrator') THEN
    EXECUTE format(
      'ALTER ROLE lilac_migrator WITH LOGIN PASSWORD %L NOSUPERUSER CREATEDB CREATEROLE INHERIT',
      migrator_password
    );
  ELSE
    EXECUTE format(
      'CREATE ROLE lilac_migrator WITH LOGIN PASSWORD %L NOSUPERUSER CREATEDB CREATEROLE INHERIT',
      migrator_password
    );
  END IF;
END;
$$;

DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO lilac_platform_app', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO lilac_migrator', current_database());
END;
$$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO lilac_platform_app;
GRANT USAGE, CREATE ON SCHEMA public TO lilac_migrator;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lilac_platform_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lilac_migrator;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM lilac_platform_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM lilac_migrator;
GRANT SELECT, INSERT ON audit_events TO lilac_platform_app, lilac_migrator;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lilac_platform_app, lilac_migrator;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO lilac_platform_app, lilac_migrator;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lilac_platform_app, lilac_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO lilac_platform_app, lilac_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO lilac_platform_app, lilac_migrator;

ALTER DEFAULT PRIVILEGES FOR ROLE lilac_migrator IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE lilac_migrator IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE lilac_migrator IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE lilac_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lilac_platform_app;
ALTER DEFAULT PRIVILEGES FOR ROLE lilac_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO lilac_platform_app;
ALTER DEFAULT PRIVILEGES FOR ROLE lilac_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO lilac_platform_app;

CREATE OR REPLACE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE OR REPLACE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_append_only_mutation();

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_select ON audit_events;
CREATE POLICY audit_events_select
  ON audit_events
  FOR SELECT
  TO lilac_platform_app, lilac_migrator
  USING (true);

DROP POLICY IF EXISTS audit_events_insert ON audit_events;
CREATE POLICY audit_events_insert
  ON audit_events
  FOR INSERT
  TO lilac_platform_app, lilac_migrator
  WITH CHECK (true);
