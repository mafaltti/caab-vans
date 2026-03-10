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

## Supported Topology

The supported deployment shape for this repo is:

- `infra/supabase/` via Docker Compose
- Next.js app via `systemd`
- Caddy in front of the app, Supabase gateway, and Studio
- Optional `infra/osrm/`
- Tracker app distributed with EAS

`infra/caab-vans/` is not part of the supported deployment path.

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
| `DEBUG_ETA` | No | Server | Verbose ETA comparison logging |
| `TRACKING_PROGRESS_SOURCE` | No | Server | `legacy`, `shadow`, or `persisted` |
| `APP_URL` | No | Scripts | Used by `simulate-tracking.ts` |
| `BOOTSTRAP_SUPERUSER_EMAIL` | No | Scripts | Required only by `npm run auth:bootstrap` |
| `BOOTSTRAP_SUPERUSER_PASSWORD` | No | Scripts | Required only by `npm run auth:bootstrap` |

### Supabase Env (`infra/supabase/.env`)

| Variable | Notes |
|----------|-------|
| `POSTGRES_PASSWORD` | Database password |
| `POSTGRES_DB` | Defaults to `postgres` |
| `POSTGRES_PORT` | Recommended `5433` |
| `JWT_SECRET` | Shared JWT secret |
| `JWT_EXP` | JWT expiration in seconds |
| `ANON_KEY` | Public anon key |
| `SERVICE_ROLE_KEY` | Service role key |
| `API_EXTERNAL_URL` | Public gateway URL |
| `SITE_URL` | Public app URL |
| `KONG_HTTP_PORT` | Defaults to `54321` |
| `STUDIO_PORT` | Recommended `54324` |
| `PGRST_PORT` | Defaults to `3001` |
| `GOTRUE_PORT` | Defaults to `9999` |
| `DISABLE_SIGNUP` | Keep `true` |

### OSRM Env (`infra/osrm/.env`)

| Variable | Notes |
|----------|-------|
| `OSRM_PORT` | Defaults to `5000` |

## Standard Local Ports

| Service | Default |
|---------|---------|
| Next.js app | `3000` |
| Kong / Supabase gateway | `54321` |
| Postgres | `5433` |
| Supabase Studio | `54324` |
| PostgREST | `3001` |
| GoTrue | `9999` |
| OSRM | `5000` |

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

Studio defaults to `http://localhost:54324` when using the checked-in example env.

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

Notable columns and functions added after the initial schema:

- `schedule_entries.stop_lat`, `stop_lng`, `geofence_radius_m`, `osrm_distance_m`, `stop_group_id`
- `route_run_stops.pass_source`, `pass_confidence`
- `route_runs.last_passed_stop_id`, `next_stop_id`, `progress_updated_at`
- `van_location_pings.buffer_size`, `failure_count`, `battery_level`, `network_type`
- `vans.last_lat`, `last_lng`, `last_speed_mps`, `snapped_lat`, `snapped_lng`, `last_gps_fix_at`
- RPC: `update_van_position(...)` for atomic latest-position writes

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

Tracking auth and rate limits:

- `x-ingestion-token` header is required for all three endpoints
- `/api/tracking/:vanId` and `/api/tracking-batch/:vanId` are limited to 40 requests/minute per van
- `/api/ingest/:vanId` is limited to 10 requests/minute per van

Tracker GPS payload contract:

```json
{
  "deviceId": "uuid",
  "lat": -12.97,
  "lng": -38.50,
  "accuracy": 12.3,
  "speed": 8.5,
  "heading": 180,
  "ts": 1772074800000,
  "bufferSize": 0,
  "failureCount": 0,
  "batteryLevel": 0.76,
  "networkType": "wifi"
}
```

Batch tracking payload contract:

```json
{
  "points": [
    {
      "deviceId": "uuid",
      "lat": -12.97,
      "lng": -38.50,
      "accuracy": 12.3,
      "speed": 8.5,
      "heading": 180,
      "ts": 1772074800000
    }
  ]
}
```

Legacy location-url ingest contract:

```json
{
  "message": "Van location: https://maps.google.com/..."
}
```

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

`npm run db:migrate:docker` is a legacy helper that only pipes `00001_initial_schema.sql` into the `supabase-db-1` container. Do not use it for normal workflows.

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
- Only `superuser` can manage users
- The API prevents deactivating or demoting the last active superuser

The in-repo rate limiter is in-memory and process-local.

## Operational Procedures

### Local Bring-Up

1. Start Supabase.
2. Copy `.env.local.example` to `.env.local`.
3. Run `npm run db:migrate`.
4. Optionally run `npm run db:seed` for development-only bootstrap work.
5. Start the app with `npm run dev`.

Seed output:

- Email: `admin@caab.org.br`
- Password: `caab2026!`

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

### Application Release Procedure

For normal updates:

```bash
cd /opt/caab-vans
git fetch --all
git checkout <target-branch-or-commit>
npm ci
npm run db:migrate
npm run build
sudo systemctl restart caab-vans
```

Restart the app whenever `.env.local` changes.

### Database Backup

Create a logical backup from the Supabase compose directory:

```bash
cd /opt/caab-vans/infra/supabase
docker compose exec -T db pg_dump -U postgres -d postgres > /var/backups/caab-vans-$(date +%F).sql
```

Recommended cadence:

- Before every production deploy
- Before manual SQL maintenance
- On a regular schedule outside the app repo

### Database Restore

Restore into a maintenance window:

```bash
cd /opt/caab-vans/infra/supabase
cat /var/backups/caab-vans-YYYY-MM-DD.sql | docker compose exec -T db psql -U postgres -d postgres
```

If you restore over a live app database, restart the app afterwards so pooled connections are reset.

### Ping Retention Cleanup

There is no automated retention job in the repo for `van_location_pings`. To prune old data manually:

```sql
DELETE FROM van_location_pings
WHERE received_at < now() - interval '90 days';
```

Follow large deletions with:

```sql
VACUUM ANALYZE van_location_pings;
```

### After Changing Stops or Stop Coordinates

Run:

```bash
npx tsx scripts/precompute-stop-distances.ts
```

Then optionally recalibrate time factors if enough route history exists:

```bash
npx tsx scripts/compute-time-factors.ts
```

### Tracker Fleet Operations

Important current behaviors from `apps/van-tracker/`:

- The app sends the live point first to `/api/tracking/:vanId`, then flushes buffered points to `/api/tracking-batch/:vanId`.
- Buffered points are kept for up to 24 hours and capped at 100 points.
- After 3 consecutive `401` responses, the tracker pauses auth-sensitive sends until settings are corrected.
- Admin van responses expose tracker health. A van is marked stale after 10 minutes without GPS, and unhealthy when it is stale, buffer size is over 20, or failure count is over 3.
- Ingestion token rotation is handled by the van edit API (`regenerateToken`). Re-provision the device immediately after rotating a token.
- Support logs can be exported from the tracker Diagnostics screen.

### OSRM Operations

- Bring up the stack from `infra/osrm/` only if you want road-snapped positions and OSRM routing.
- Refresh Nordeste data with `infra/osrm/scripts/update-data.sh`.
- Changing OSRM env vars requires restarting the app process because the env is read at process start.
- If OSRM is unavailable, ETA falls back automatically to haversine-based distance.

### ETA Operations

- `TRACKING_PROGRESS_SOURCE=legacy` is the current safe default.
- `TRACKING_PROGRESS_SOURCE=shadow` computes both legacy and persisted stop pointers and logs mismatches.
- `TRACKING_PROGRESS_SOURCE=persisted` uses stored stop pointers when valid and falls back to legacy when they are stale or invalid.
- `data/time-factors.json` is environment-specific generated data. It is read on each API request, so replacing the file does not require an app restart.

### Logs and Debugging

Useful commands:

```bash
sudo systemctl status caab-vans
sudo journalctl -u caab-vans -n 200 --no-pager
cd /opt/caab-vans/infra/supabase && docker compose ps
cd /opt/caab-vans/infra/osrm && docker compose logs --tail=100 osrm
```

Optional debug aids:

- Set `DEBUG_ETA=1` to emit structured ETA comparison logs
- Use `apps/van-tracker` Diagnostics export for field incidents
- Use `scripts/simulate-tracking.ts` to send synthetic pings against a configured app URL

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

### Orphaned Shift Reconciliation

**This is required runtime infrastructure**, not optional maintenance. Without it, orphaned shifts stay open indefinitely, and the read path will surface `runHealth: "orphaned"` to clients but cannot self-heal.

Shifts can become orphaned (stuck with `ended_at IS NULL`) when a driver's app crashes, loses connectivity, or the driver forgets to end the shift. The reconciliation script detects and auto-closes these stale shifts. The same criteria are used by the API read path to set `runHealth: "orphaned"` on active routes, giving clients early visibility before reconciliation runs.

**Closure criteria** (both must be true):
- Route is past its last scheduled stop by **≥ 90 minutes**
- No activity (GPS ping, progress update, or shift start) for **≥ 30 minutes**

**Required environment variables:**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://api-vans.example.com
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

**Usage:**

```bash
# Dry run — logs candidates as JSON, no database mutations
DRY_RUN=1 npx tsx scripts/reconcile-orphaned-shifts.ts

# Live run — closes orphaned shifts and logs results
npx tsx scripts/reconcile-orphaned-shifts.ts

# Via npm script
npm run tracking:reconcile-shifts
```

**Output format:** Structured JSON lines to stdout. Each run emits `reconcile_start`, then either `reconcile_candidates` + `reconcile_done` (with `closedCount`) or `reconcile_dry_run`. Pipe to a log file for audit.

**Scheduling (recommended: every 5 minutes):**

Cron:
```cron
*/5 * * * * cd /opt/caab-vans && npx tsx scripts/reconcile-orphaned-shifts.ts >> /var/log/caab-vans/reconcile-shifts.log 2>&1
```

Systemd timer (alternative):
```ini
# /etc/systemd/system/reconcile-shifts.timer
[Unit]
Description=Reconcile orphaned van shifts

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/reconcile-shifts.service
[Unit]
Description=Reconcile orphaned van shifts

[Service]
Type=oneshot
WorkingDirectory=/opt/caab-vans
ExecStart=/usr/bin/npx tsx scripts/reconcile-orphaned-shifts.ts
Environment=NEXT_PUBLIC_SUPABASE_URL=https://api-vans.example.com
EnvironmentFile=/opt/caab-vans/.env.local
StandardOutput=append:/var/log/caab-vans/reconcile-shifts.log
StandardError=append:/var/log/caab-vans/reconcile-shifts.log
```

Enable with `systemctl enable --now reconcile-shifts.timer`.

**First-time setup checklist:**
1. Ensure `.env.local` (or equivalent) has both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
2. Run a dry run to verify connectivity and see current candidates
3. Run a live run manually and confirm results in Supabase Studio
4. Set up the cron job or systemd timer
5. Verify log output appears after the first scheduled run

## Known Limitations

- Rate limiting is in-memory and per process.
- Migrations are forward-only.
- There is no automated backup or monitoring setup in the repo.
- There is no e2e or integration test suite.
- `schedule_entries.time` does not support midnight-crossing schedules well.
- Data retention for ping history is not automated.
