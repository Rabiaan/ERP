# Local setup and provisioning check

This guide covers running Lilac Office on a Windows development machine with Docker Desktop.
The API listens on port `3001`, the Vite app on `3000`, and PostgreSQL on the port configured by
`POSTGRES_PORT` in `.env`.

## One-time setup

1. Install Node.js (20 or later) and Docker Desktop, then start Docker Desktop.
2. Create `.env` from `.env.example` if this is a fresh checkout. Set the PostgreSQL password and
   port, and replace the `APP_SECRET` and `KMS_LOCAL_KEY` placeholders with fresh values. Generate
   them with:

   ```powershell
   node -e "const c=require('node:crypto'); console.log('APP_SECRET='+c.randomBytes(32).toString('base64url')); console.log('KMS_LOCAL_KEY='+c.randomBytes(32).toString('base64'))"
   ```

   Copy both generated values into `.env`. Keep `.env` private; do not commit it.
3. Install project dependencies and start PostgreSQL:

   ```powershell
   npm install
   npm run db:up
   ```

4. Apply platform migrations and create the dedicated provisioning role:

   ```powershell
   npm run db:migrate
   npm run db:provision:setup
   ```

   The setup command creates or rotates `lilac_provisioner`, grants it `CONNECT` to the platform
   database plus `CREATEDB` and `CREATEROLE`, verifies it is not a superuser, and writes its
   generated connection string to `.env`. It requires `PLATFORM_ADMIN_URL` to connect as a database
   administrator. Do not give the platform application role provisioning privileges. If you remove
   the Docker volume with `docker compose --env-file .env -f db/docker-compose.yml down -v`, rerun
   `npm run db:provision:setup` after `db:up` and before `db:setup`, because the provisioner role is
   stored in the database volume.

5. Ensure `.env` contains:

   ```dotenv
   BACKUP_DIR="storage/backups"
   PG_DUMP_DOCKER_CONTAINER="lilac-postgres"
   ```

   The local PostgreSQL 16 Docker image includes `pg_dump` 16.15. The worker uses that executable
   through Docker and copies completed dumps into `storage/backups`; a separate Windows `pg_dump`
   install is not required for this Docker-based local setup. This mode assumes the worker and the
   database are using the `lilac-postgres` Compose container. For a non-Docker deployment, unset
   `PG_DUMP_DOCKER_CONTAINER` and install a compatible PostgreSQL client so `pg_dump` is on `PATH`.

## Run and verify locally

```powershell
npm run typecheck
npm test
npm run db:provision:smoke
npm run dev:full
```

Open [http://localhost:3000](http://localhost:3000). The API runs on port `3001`.
The provisioning smoke command creates a temporary client and HR tenant, applies its migrations,
checks activation, snapshots it with `pg_dump`, deprovisions it, and removes the temporary records
and snapshot. It is restricted to `NODE_ENV=development`; do not run it against production data.

The worker processes one batch and exits:

```powershell
npm run db:provision:worker
```

Run it after a provisioning job has been queued; production deployments need a scheduler or worker
loop. Platform HTTP provisioning endpoints are implemented, and the live smoke command is the local
end-to-end provisioning check.

## Current project limitations

- `npm run db:setup` now creates the Phase 10 demo. Demo users share the local password
  `ChangeMe123!`; the Super Admin must change it and enroll MFA before using guarded routes.
- The frontend is wired to the real API-backed login, tenant screens, platform console, and module
  workspaces; there are no mock-driven tenant screens remaining.
- The real local provisioning role and full tenant snapshot/deprovision lifecycle were verified
  with `npm run db:provision:smoke` in this environment.
