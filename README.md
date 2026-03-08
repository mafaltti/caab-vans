# CAAB Vans

CAAB Vans is a Next.js web app plus an Expo-based Android tracker app for route status, schedules, announcements, and live van tracking.

## Start Here

Use the canonical docs in this order:

1. [docs/START-HERE.md](docs/START-HERE.md) for newcomer onboarding.
2. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the supported production runbook.
3. [docs/OPERATIONS.md](docs/OPERATIONS.md) for environment, scripts, schema, and maintenance reference.

Historical notes under `docs/execution/` are archive/reference only.

## Supported Topology

The supported production setup for this repo is:

- `infra/supabase/` via Docker Compose
- Next.js app via `systemd` on the VPS
- Caddy for TLS and reverse proxying
- Optional `infra/osrm/` for road snapping and ETA routing
- `apps/van-tracker/` built and distributed via EAS

## Workspace Layout

```text
caab-vans/
  apps/van-tracker/   Expo Android tracker app
  docs/               Canonical docs plus archived execution notes
  infra/supabase/     Supabase self-host stack
  infra/osrm/         Optional OSRM stack
  scripts/            Migration and operator scripts
  specs/              Feature specs and research
  src/                Next.js app, API routes, shared libraries
  supabase/migrations/SQL migrations
```

## Local Development Summary

1. Install dependencies with `npm install`.
2. Start Supabase from `infra/supabase/`.
3. Copy `.env.local.example` to `.env.local` and fill the values.
4. Run `npm run db:migrate`.
5. Optionally run `npm run db:seed` for development-only bootstrap data.
6. Start the app with `npm run dev`.

Detailed local setup lives in [docs/START-HERE.md](docs/START-HERE.md).

## Additional Docs

- [docs/TECH.md](docs/TECH.md) for architecture and infrastructure constraints
- [apps/van-tracker/README.md](apps/van-tracker/README.md) for tracker setup and provisioning
- [docs/PRINCIPLES.md](docs/PRINCIPLES.md) for engineering constraints
- [docs/GIT-WORKFLOW.md](docs/GIT-WORKFLOW.md) and [docs/DELIVERY-WORKFLOW.md](docs/DELIVERY-WORKFLOW.md) for branch and release process

## License

Private / internal use only.
