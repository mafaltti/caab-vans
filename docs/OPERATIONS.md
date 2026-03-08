# Operations Guide

Complete reference for running and maintaining the current repo state. For newcomer flow, start with [START-HERE.md](START-HERE.md). For the supported production runbook, use [DEPLOYMENT.md](DEPLOYMENT.md).

## Architecture Overview

Runtime pieces:

1. Next.js web app for public pages, admin pages, and `/api/*` routes.
2. Self-hosted Supabase stack from `infra/supabase/`.
3. Expo-based Android tracker app from `apps/van-tracker/`.
4. Optional OSRM stack from `infra/osrm/`.

Primary flow:

- Web UI -> Next.js BFF -> Supabase
- Tracker app -> Next.js tracking endpoints -> Supabase

## Environment Variables

### Root App and Script Env (`.env.local`)

| Variable | Required | Scope | Notes |
|----------|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Client + Server | Supabase gateway URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client + Server | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server + Scripts | Server-only service role key |
| `DATABASE_URL` | Yes for scripts | Scripts | Used by migrations and data scripts |
| `OSRM_BASE_URL` | No | Server + Scripts | Self-hosted OSRM URL, usually `http://localhost:5000` |
| `OSRM_ROUTE_TIMEOUT_MS` | No | Server | Route timeout override |
| `OSRM_MATCH_TIMEOUT_MS` | No | Server | Match timeout override |
| `NEXT_PUBLIC_TILE_URL` | No | Client | Optional tile source |
| `DEBUG_ETA` | No | Server | Verbose ETA logging |
| `TRACKING_PROGRESS_SOURCE` | No | Server | `legacy`, `shadow`, or `persisted` |
| `APP_URL` | No | Scripts | Used by `simulate-tracking.ts` |
| `BOOTSTRAP_SUPERUSER_EMAIL` | No | Scripts | Required only by `npm run auth:bootstrap` |
| `BOOTSTRAP_SUPERUSER_PASSWORD` | No | Scripts | Required only by `npm run auth:bootstrap` |

### Supabase Env (`infra/supabase/.env`)

Key variables:

| Variable | Notes |
|----------|-------|
| `POSTGRES_PASSWORD` | Database password |
| `JWT_SECRET` | Shared JWT secret |
| `ANON_KEY` | Public anon key |
| `SERVICE_ROLE_KEY` | Service role key |
| `API_EXTERNAL_URL` | Public gateway URL |
| `SITE_URL` | Public app URL |
| `KONG_HTTP_PORT` | Defaults to `54321` |
| `POSTGRES_PORT` | Defaults to `5432`; production docs recommend `5433` |
| `STUDIO_PORT` | Defaults to `54324` |
| `DISABLE_SIGNUP` | Keep `true` |

### OSRM Env (`infra/osrm/.env`)

| Variable | Notes |
|----------|-------|
| `OSRM_PORT` | Defaults to `5000` |

## Infrastructure

### Supabase

Path: `infra/supabase/`

```bash
cd infra/supabase
cp .env.example .env
docker compose up -d
```

Services included:

- Postgres
- GoTrue
- PostgREST
- Kong gateway
- Studio
- Postgres Meta

Studio defaults to `http://localhost:54324` locally.

### OSRM

Path: `infra/osrm/`

```bash
cd infra/osrm
cp .env.example .env
docker compose up -d
```

The stack serves Nordeste/Brazil road data and is optional.

Road data refresh:

```bash
cd infra/osrm
./scripts/update-data.sh
```

### Supported Production Shape

- Supabase via Docker Compose
- Next.js app via `systemd`
- Caddy in front of app, gateway, and Studio
- Optional OSRM on the same VPS

`infra/caab-vans/` is not part of the supported deployment path.

## Database Schema

The live schema is represented by the SQL files in `supabase/migrations/`.

High-level tables:

| Table | Purpose |
|-------|---------|
| `vans` | Van metadata plus latest known position |
| `routes` | Route definitions, one route per van |
| `schedule_entries` | Daily recurring stops |
| `announcements` | Public notices |
| `van_location_pings` | GPS ping history |
| `route_runs` | Daily route instances |
| `route_run_stops` | Stop progress for a run |
| `van_drivers` | Driver assignments |
| `route_shifts` | Driver shift windows |

Operational patterns:

- Public reads rely on anon access and RLS where applicable.
- Writes go through the Next.js BFF with the service-role client.
- `schedule_entries.time` is a recurring `time` value with no date component.

## API Surface

### Public

- `GET /api/routes`
- `GET /api/routes/:routeId`
- `GET /api/announcements`

### Admin

- Auth under `/api/admin/auth/*`
- CRUD for announcements, routes, vans, and users under `/api/admin/*`

### Driver

- `GET /api/driver/routes`
- `POST /api/routes/:routeId/start`
- `POST /api/routes/:routeId/end`

### Tracking

- `POST /api/tracking/:vanId`
- `POST /api/tracking-batch/:vanId`
- `POST /api/ingest/:vanId`

### Event Logging

- `POST /api/track`

`/api/track` is a lightweight event logging endpoint. It is not part of the tracker ingestion path and not required for core deployment.

## Scripts

| Command | Use |
|---------|-----|
| `npm run dev` | Start Next.js locally |
| `npm run build` | Production build |
| `npm run start` | Start built app |
| `npm run lint` | Repo-wide ESLint |
| `npm run typecheck` | Root TypeScript check |
| `npm run test -- --run` | Non-watch Vitest run |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run auth:bootstrap` | Create the first production superuser using explicit env vars |
| `npm run db:seed` | Development-only convenience bootstrap |

Direct scripts:

| Script | Notes |
|--------|-------|
| `scripts/migrate.ts` | Supported migration runner |
| `scripts/auth-bootstrap.ts` | Production-safe superuser bootstrap |
| `scripts/seed.ts` | Fixed-credential development bootstrap |
| `scripts/seed-schedule.ts` | Demo schedule data helper |
| `scripts/precompute-stop-distances.ts` | Refresh per-stop OSRM distances |
| `scripts/compute-time-factors.ts` | Generate `data/time-factors.json` |
| `scripts/simulate-tracking.ts` | Send simulated GPS traffic |

`npm run db:migrate:docker` is legacy and should not be used for normal workflows.

## ETA and Tracking Notes

Main ETA modules:

- `src/lib/tracking/eta.ts`
- `src/lib/tracking/time-factors.ts`
- `src/lib/tracking/resolve-route-progress.ts`

Main tracking modules:

- `src/app/api/tracking/[vanId]/route.ts`
- `src/app/api/tracking-batch/[vanId]/route.ts`
- `src/lib/tracking/infer-stop-progress.ts`

Important constants and behavior:

- Canonical timezone: `America/Bahia`
- Location freshness threshold: `10` minutes
- Progress source flag: `TRACKING_PROGRESS_SOURCE`
- Time factors load from `data/time-factors.json` if present, otherwise built-in defaults
- OSRM failures degrade gracefully to haversine-based distance

Client polling hooks live in:

- `src/lib/queries/use-routes.ts`
- `src/lib/queries/use-route-detail.ts`
- `src/lib/queries/use-announcements.ts`

## Authentication and Authorization

- Supabase Auth with session cookies
- Roles stored in `auth.users.app_metadata.role`
- Active flag stored in `auth.users.app_metadata.is_active`
- Tracking endpoints use `x-ingestion-token`
- Middleware guards `/admin/*` and `/driver/*`

The in-repo rate limiter is in-memory and process-local.

## Operational Procedures

### Local Bring-Up

1. Start Supabase.
2. Copy `.env.local.example` to `.env.local`.
3. Run `npm run db:migrate`.
4. Optionally run `npm run db:seed` for development-only bootstrap work.
5. Start the app with `npm run dev`.

### Production Bring-Up

Use [DEPLOYMENT.md](DEPLOYMENT.md). The supported sequence is:

1. Supabase stack
2. Root `.env.local`
3. `npm run db:migrate`
4. `npm run auth:bootstrap`
5. `npm run build`
6. `systemd` service
7. Caddy
8. Optional OSRM

### After Changing Stops

Run:

```bash
npx tsx scripts/precompute-stop-distances.ts
```

Optionally recalibrate time factors if enough route history exists.

### Quality Gates

Root workspace:

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

## Known Limitations

- Rate limiting is in-memory and per process.
- Migrations are forward-only.
- There is no automated backup or monitoring setup in the repo.
- There is no e2e or integration test suite.
- `schedule_entries.time` does not support midnight-crossing schedules well.
- Data retention for ping history is not automated.
