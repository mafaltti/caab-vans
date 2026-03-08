# Start Here

This is the canonical onboarding path for engineers who need to run or deploy this project for a client.

## Canonical Docs

Read these in order:

1. [README.md](../README.md) for the repo overview.
2. [DEPLOYMENT.md](DEPLOYMENT.md) for the supported production deployment model.
3. [OPERATIONS.md](OPERATIONS.md) for environment variables, scripts, schema, and maintenance tasks.
4. [apps/van-tracker/README.md](../apps/van-tracker/README.md) for tracker app build and provisioning.

`docs/execution/` is archive/reference only. Do not treat it as the deployer source of truth.

## Supported Production Model

This repo currently supports one production topology:

- `infra/supabase/` via Docker Compose
- Next.js app run directly on the VPS via `systemd`
- Caddy handling TLS and reverse proxying
- Optional `infra/osrm/` for road snapping and routing
- Expo/EAS for Android tracker distribution

Historical references to `infra/caab-vans/` are obsolete and not part of the supported path.

## First-Time Local Setup

1. Install root dependencies with `npm install`.
2. Start Supabase:

   ```bash
   cd infra/supabase
   cp .env.example .env
   docker compose up -d
   ```

3. Copy the app env file:

   ```bash
   cp .env.local.example .env.local
   ```

4. Run migrations:

   ```bash
   npm run db:migrate
   ```

5. If you need a development-only bootstrap superuser, run:

   ```bash
   npm run db:seed
   ```

6. Start the app:

   ```bash
   npm run dev
   ```

7. For the tracker app, follow [apps/van-tracker/README.md](../apps/van-tracker/README.md).

## Production Setup Path

For a new client deployment:

1. Follow [DEPLOYMENT.md](DEPLOYMENT.md).
2. Use `npm run auth:bootstrap` with explicit credentials for the first superuser.
3. Do not use `npm run db:seed` in production.
4. Treat OSRM as optional unless you need road-snapped ETAs from day one.

## Validation Commands

Run these before handing off or promoting a deploy:

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

Tracker workspace:

```bash
cd apps/van-tracker
npm run check
```
