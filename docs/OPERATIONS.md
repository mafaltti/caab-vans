# Operations Guide

Complete reference for running, configuring, and maintaining the CAAB Vans system. Read this if you're new to the project.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Environment Variables](#environment-variables)
- [Infrastructure](#infrastructure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Scripts](#scripts)
- [ETA System](#eta-system)
- [Tracking Pipeline](#tracking-pipeline)
- [Authentication & Authorization](#authentication--authorization)
- [Operational Procedures](#operational-procedures)
- [Known Limitations](#known-limitations)

---

## Architecture Overview

Three components:

1. **Next.js web app** — public portal + admin panel + BFF API (`/api/*`)
2. **Supabase self-hosted** — Postgres, Auth, Realtime (Docker Compose stack)
3. **Van tracker app** — standalone Expo/Android app sending GPS pings

Data flow: `Web UI -> Next.js BFF (/api/*) -> Supabase (Postgres)`. The tracker posts GPS pings to the ingest endpoint. OSRM provides optional road-snapping and routing.

---

## Environment Variables

### App (.env.local)

| Variable | Required | Scope | Description |
|----------|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Client + Server | Supabase API URL. Dev: `http://localhost:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client + Server | Supabase anon JWT (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server only | Supabase service role JWT. **Never expose to client.** |
| `DATABASE_URL` | Yes (scripts) | Scripts only | Postgres connection string. Not used by the app at runtime — only by migration and data scripts. Format: `postgresql://user:pass@host:port/db` |
| `OSRM_BASE_URL` | No | Server + Scripts | Road routing service URL. Dev: `https://router.project-osrm.org` (1 req/sec limit). Prod: `http://localhost:5000` (self-hosted). If omitted, ETA falls back to haversine estimation. |
| `NEXT_PUBLIC_TILE_URL` | No | Client | Map tile server URL. Falls back to `https://tile.openstreetmap.org/{z}/{x}/{y}.png` if omitted. |
| `DEBUG_ETA` | No | Server | Set to any value to enable verbose ETA computation logging. Produces ~900-1,500 log entries/hour — use only for debugging. |
| `TRACKING_PROGRESS_SOURCE` | No | Server | Progress pointer rollout mode: `legacy` (default — time-based ETA selection), `shadow` (compute both legacy and persisted, serve legacy, log mismatches), `persisted` (use validated pointer for ETA targeting with legacy fallback). See `specs/052-progress-pointer-cutover/quickstart.md` for rollout guide. |
| `APP_URL` | No | Scripts | Used by `simulate-tracking.ts` only. Defaults to `http://localhost:3000`. |

### Supabase (infra/supabase/.env)

See `infra/supabase/.env.example` for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Database password |
| `JWT_SECRET` | JWT signing secret (min 32 chars) |
| `ANON_KEY` | Generated anon JWT |
| `SERVICE_ROLE_KEY` | Generated service role JWT |
| `API_EXTERNAL_URL` | Supabase API endpoint (default `http://localhost:54321`) |
| `KONG_HTTP_PORT` | API gateway port (default `54321`) |
| `STUDIO_PORT` | Supabase Studio port (default `54323`) |
| `DISABLE_SIGNUP` | Set `true` — users created by admin only |

### OSRM (infra/osrm/.env)

| Variable | Description |
|----------|-------------|
| `OSRM_PORT` | Service port (default `5000`) |

---

## Infrastructure

### Supabase Stack (`infra/supabase/`)

```bash
cd infra/supabase
cp .env.example .env   # edit secrets
docker compose up -d
```

Components: Postgres, GoTrue (Auth), PostgREST, Kong (API gateway), Studio, PG Meta.

- **Studio** accessible at `http://localhost:54323` — protect with Basic auth in production
- **Postgres** never exposed publicly — only through Kong gateway
- **Signup disabled** — all users created via admin panel or seed script

### OSRM Stack (`infra/osrm/`)

Self-hosted road routing for ETA and GPS snap-to-road. Uses Nordeste (Brazil) road data from Geofabrik.

```bash
cd infra/osrm
docker compose up -d
```

- Data source: `https://download.geofabrik.de/south-america/brazil/nordeste-latest.osm.pbf`
- Algorithm: MLD (Multi-Level Dijkstra)
- Memory limit: 4 GB
- Health check: `/match/v1/driving/...` every 30s

**Updating road data** (monthly recommended):

```bash
cd infra/osrm
./scripts/update-data.sh
```

Downloads latest extract, processes (extract -> partition -> customize), swaps data with minimal downtime, restarts container.

### Production Deployment

Two Docker Compose stacks on a single VPS behind Caddy (TLS + routing):

- `infra/supabase/` — Supabase stack
- `infra/caab-vans/` — Next.js app (not yet configured)

Caddy routes:
- `vans.danilocarneiro.com` -> Next.js (public)
- `api-vans.danilocarneiro.com` -> Supabase gateway
- `studio.danilocarneiro.com` -> Supabase Studio (Basic auth protected)

---

## Database Schema

9 tables across 8 migrations (`supabase/migrations/00001-00008`).

### Tables

#### Public Read (anon RLS)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `vans` | Van reference + current GPS position | `name`, `ingestion_token` (unique), `last_lat/lng`, `snapped_lat/lng`, `last_speed_mps`, `last_heading_deg` |
| `routes` | Route definitions (1:1 with van) | `name`, `van_id` (unique FK to vans) |
| `schedule_entries` | Fixed daily stops (no date column) | `route_id`, `stop_name`, `time` (HH:mm), `stop_lat/lng`, `geofence_radius_m` (default 50), `osrm_distance_m` |
| `announcements` | Notices with optional expiry | `title`, `body`, `is_pinned`, `is_urgent`, `expires_at`. Anon reads filtered: `expires_at IS NULL OR expires_at > now()` |

#### Service Role Only (no anon RLS)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `van_location_pings` | Immutable GPS audit trail | `van_id`, `device_ts` (unique with van_id), `lat/lng`, `speed_mps`, `heading_deg`, `seq`, `buffer_size`, `battery_level`, `network_type` |
| `route_runs` | Daily route instance | `route_id`, `service_date` (unique with route_id). No status column — derived from shifts. |
| `route_run_stops` | Stop progress tracking | `run_id`, `schedule_entry_id` (composite PK), `status` ('pending' or 'passed'), `passed_at` |
| `van_drivers` | Many-to-many van-driver assignment | `van_id`, `driver_id` (composite PK). `driver_id` is a logical FK to `auth.users` (no DB constraint). |
| `route_shifts` | Driver work sessions within a run | `run_id`, `driver_id`, `started_at`, `ended_at` (null = active) |

### Key Schema Patterns

- **No soft deletes** — all tables use hard deletes with CASCADE on FKs
- **UUIDs everywhere** — `gen_random_uuid()` for all PKs
- **`updated_at` auto-trigger** — `set_updated_at()` trigger on vans, routes, announcements, route_runs
- **Schedule entries have no date** — `time` is Postgres `time` type (HH:mm). Daily recurrence is implicit; paired with `route_runs.service_date` at runtime.
- **Route run status is derived** — no status column. Computed from `route_shifts` (active shift?) + schedule window.
- **Stop progress is one-way** — `pending` -> `passed` only. Accumulates across driver shifts within the same run.
- **Driver FK is logical** — `van_drivers.driver_id` and `route_shifts.driver_id` reference `auth.users(id)` but have no DB foreign key (cross-schema constraint). Validated at application level.
- **Dedup via unique constraint** — `van_location_pings(van_id, device_ts)` prevents duplicate pings. Upsert with `ignoreDuplicates: true`.

### RLS Summary

| Access | Tables |
|--------|--------|
| Public read (anon) | vans, routes, schedule_entries, announcements (with expiry filter) |
| Service role only | van_location_pings, route_runs, route_run_stops, van_drivers, route_shifts |

All write operations go through the BFF with service role key. RBAC (admin/superuser/driver) enforced at application level via `requireAuth()` and `requireRole()`.

---

## API Reference

### Public Endpoints (No Auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/routes` | All routes with real-time status, ETA, van position |
| GET | `/api/routes/:routeId` | Single route detail with full schedule and progress |
| GET | `/api/announcements` | Active (non-expired) announcements |

### Admin Endpoints (Session Cookie)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/admin/auth/login` | None | Login (10 req/15min rate limit) |
| POST | `/api/admin/auth/logout` | Cookie | Logout |
| GET/POST | `/api/admin/announcements` | Cookie | List all / Create |
| PUT/DELETE | `/api/admin/announcements/:id` | Cookie | Update / Delete |
| GET/POST | `/api/admin/routes` | Cookie | List / Create (validates 1:1 van uniqueness) |
| PUT/DELETE | `/api/admin/routes/:id` | Cookie | Update / Delete (cascades to schedule_entries) |
| GET/POST | `/api/admin/routes/:id/schedule` | Cookie | List / Create entries (validates unique time per route) |
| PUT/DELETE | `/api/admin/routes/:id/schedule/:entryId` | Cookie | Update / Delete |
| GET/POST | `/api/admin/vans` | Cookie | List / Create (auto-generates ingestion_token) |
| PUT/DELETE | `/api/admin/vans/:id` | Cookie | Update (can regenerate token, set driverIds) / Delete (fails if van assigned to route) |
| GET/POST | `/api/admin/users` | Superuser | List / Create users |
| PUT | `/api/admin/users/:id` | Superuser | Update role/password/active (prevents deactivating last superuser) |

### Driver Endpoints (Session Cookie + Driver Role)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/driver/routes` | Routes for vans assigned to this driver |
| POST | `/api/routes/:routeId/start` | Start a shift (creates route_run if needed, validates no active shift exists) |
| POST | `/api/routes/:routeId/end` | End active shift (validates shift belongs to this driver) |

### Tracking Endpoints (Token Auth via `x-ingestion-token` header)

| Method | Path | Rate Limit | Description |
|--------|------|------------|-------------|
| POST | `/api/tracking/:vanId` | 25/min | Single GPS ping |
| POST | `/api/tracking-batch/:vanId` | 25/min | Batch GPS pings (1-100 points) |
| POST | `/api/ingest/:vanId` | 10/min | Location URL ingestion (legacy) |

**Tracking processing pipeline** (per ping):
1. Validate token against `vans.ingestion_token`
2. Clamp future timestamps to +5 minutes
3. Reject pings older than 24 hours
4. Upsert into `van_location_pings` (deduplicate by `van_id + device_ts`)
5. If newest ping: update `vans` table (lat, lng, speed, heading, accuracy)
6. If OSRM available: snap to road, store `snapped_lat/lng`
7. Run `inferStopProgress()` — geofence detection, auto-advance stops

### Rate Limiting

In-memory rate limiter (per server instance, resets on redeploy):

| Endpoint | Window | Max Requests | Key |
|----------|--------|-------------|-----|
| Login | 15 min | 10 | Email |
| Tracking (single) | 1 min | 25 | Van ID |
| Tracking (batch) | 1 min | 25 | Van ID |
| Ingest | 1 min | 10 | Van ID |

---

## Scripts

All scripts in `scripts/`. Run with `npx tsx scripts/<name>.ts`.

| Script | Env Vars | When to Run | Description |
|--------|----------|-------------|-------------|
| `migrate.ts` | `DATABASE_URL` | After schema changes | Runs all SQL migrations in order |
| `seed.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Initial setup | Creates default superuser (`admin@caab.org.br` / `caab2026!`) — change password after first login |
| `seed-schedule.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Initial setup | Populates demo routes and schedule entries |
| `precompute-stop-distances.ts` | `DATABASE_URL`, `OSRM_BASE_URL` | After adding/changing stops | Pre-computes OSRM road distances between consecutive stops. Re-run after stop changes. |
| `compute-time-factors.ts` | `DATABASE_URL`, `OSRM_BASE_URL` | Monthly (manual) | Generates `data/time-factors.json` from historical route data. Requires 14+ days of data. |
| `simulate-tracking.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` (optional) | Development/testing | Sends simulated GPS pings for testing |

### npm Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run db:migrate` | Run migrations via `scripts/migrate.ts` |
| `npm run db:seed` | Seed via `scripts/seed.ts` |

---

## ETA System

ETA computation lives in `src/lib/tracking/eta.ts` and `src/lib/tracking/time-factors.ts`.

### How ETA Works

Two modes, selected automatically per request:

1. **GPS-based** (`etaSource: "gps"` or `"gps_osrm"`) — distance/speed calculation when:
   - Van has coordinates AND next stop has coordinates
   - Location is fresh (< 10 minutes old)
   - Van is moving (speed >= 1.0 m/s) OR near stop (< 500m) OR recently moving (hysteresis)

2. **Schedule-based** (`etaSource: "schedule"`) — fallback using scheduled time + delay from last passed stop

### Key Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `STALENESS_THRESHOLD_MINUTES` | 10 | `src/lib/time.ts` | Location freshness check |
| `MIN_SPEED_MPS` | 1.0 | `eta.ts` | Movement threshold |
| `PROXIMITY_THRESHOLD_M` | 500 | `eta.ts` | Near-stop GPS activation |
| `FALLBACK_SPEED_MPS` | 4.2 | `eta.ts` | ~15 km/h — used when stationary but GPS active |
| `HYSTERESIS_WINDOW_S` | 60 | `eta.ts` | Grace period before switching to schedule |
| `DIRECTION_THRESHOLD_DEG` | 90 | `eta.ts` | Heading-away detection in haversine fallback |
| `ROAD_FACTOR` | 1.3 | `eta.ts` | Haversine-to-road distance multiplier |
| `REFERENCE_SPEED_MPS` | 8.3 | `time-factors.ts` | ~30 km/h baseline for congestion factor |
| `MIN_BLEND_SEGMENTS` | 3 | `time-factors.ts` | Min stops before blending real-time congestion |

### Congestion Factor (timeFactor)

Multiplier applied to travel time. Blends historical time-of-day patterns with real-time observations:

- **Historical**: Loaded from `data/time-factors.json` (generated by calibration script) or built-in defaults
- **Real-time**: Computed from today's passed stop segments (actual vs predicted travel time)
- **Blending**: 70% historical + 30% real-time, only when >= 3 segments available
- **Defaults**: Weekday peak hours 1.1-1.4, Saturday 1.05-1.1, Sunday 0.95

### OSRM Integration

- **Runtime routing** (`/route/v1/driving/`): 100ms timeout. Used for van-to-stop ETA.
- **Road snapping** (`/match/v1/driving/`): 50ms timeout. Snaps GPS to nearest road.
- **Script routing**: 500ms timeout (batch jobs tolerate more latency).
- **Graceful degradation**: If OSRM unavailable, falls back to haversine × 1.3 for distance, schedule for direction-ambiguous cases.

---

## Tracking Pipeline

### Stop Advancement (Geofence Detection)

`inferStopProgress()` in `src/lib/tracking/infer-stop-progress.ts`:

1. Fetch pending stops with coordinates for today's route run
2. Check if van is within geofence radius (default 50m, haversine distance)
3. Filter by early arrival window (30 minutes before scheduled time)
4. Pick closest-in-time match if multiple stops in range
5. **Chronological backfill**: mark all earlier pending stops as "passed" too
6. Set `passed_at` to server time

### Timestamp Handling

- **Device timestamps** (`device_ts`): from tracker app GPS chip, may be skewed
- **Future clamp**: timestamps > 5 min ahead replaced with server time
- **Staleness reject**: timestamps > 24h old rejected (400 error or silent skip in batch)
- **Dedup**: unique constraint on `(van_id, device_ts)` — duplicates silently skipped

### Client Polling

| Data | Interval | Config Location |
|------|----------|-----------------|
| Routes list | 5s | `src/hooks/use-routes.ts` |
| Route detail | 5s | `src/hooks/use-route-detail.ts` |
| Announcements | 30s | `src/hooks/use-announcements.ts` |
| React Query staleTime | 10s | `src/app/providers.tsx` |

---

## Authentication & Authorization

### Auth Model

- **Supabase Auth** with session cookies (GoTrue)
- **Signup disabled** — users created by superuser via admin panel
- **Roles**: `superuser`, `admin`, `driver` (stored in `auth.users.app_metadata.role`)
- **Active flag**: `app_metadata.is_active` — inactive users cannot log in

### Auth Chain

1. **Middleware** (`src/middleware.ts`): checks session for `/admin/*` and `/driver/*` paths, redirects based on role
2. **`requireAuth()`** (`src/lib/api/auth.ts`): validates session in API route handlers
3. **`requireRole(role)`**: checks `app_metadata.role` matches required role
4. **Token auth**: tracking endpoints use `x-ingestion-token` header matched against `vans.ingestion_token`

### Security Notes

- Service role key server-only — never in `NEXT_PUBLIC_*` variables
- Anon key intentionally public (safe for browser, read access via RLS)
- No CSRF tokens — relies on SameSite cookies
- No CORS headers configured — same-origin only
- Admin rate limit: 10 login attempts per 15 minutes per email
- Superuser protection: cannot deactivate or remove role from the last active superuser

---

## Operational Procedures

### Initial Setup

1. Start Supabase: `cd infra/supabase && docker compose up -d`
2. Start OSRM (optional): `cd infra/osrm && docker compose up -d`
3. Install deps: `npm install`
4. Configure env: `cp .env.local.example .env.local` (fill in keys)
5. Run migrations: `npm run db:migrate`
6. Seed data: `npm run db:seed`
7. Pre-compute stop distances (optional): `DATABASE_URL=... OSRM_BASE_URL=... npx tsx scripts/precompute-stop-distances.ts`
8. Start dev server: `npm run dev`

### After Adding/Changing Stops

1. Update stops via admin panel or DB
2. Re-run: `npx tsx scripts/precompute-stop-distances.ts`
3. (Optional) Re-run time factor calibration if historical data exists

### Monthly Maintenance

- **OSRM data update**: `cd infra/osrm && ./scripts/update-data.sh`
- **Time factor calibration**: `npx tsx scripts/compute-time-factors.ts` (requires 14+ days of route data)
- **Postgres backups**: daily minimum + off-box storage (configure separately)

### Quality Gates (Before Merge)

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run test          # Vitest
npm run build         # Next.js production build
```

---

## Known Limitations

### Rate Limiter

- **In-memory only** — resets on server restart/redeploy
- **Per-instance** — no distributed rate limiting across multiple servers
- **Memory cleanup** at 1000-key threshold only

### Timezone

- All times forced to `America/Bahia` — hardcoded, not configurable
- `schedule_entries.time` has no date — midnight-crossing schedules not supported
- `parseTime()` creates DateTime for "today" — edge case at day boundary (23:59 -> 00:01)

### GPS & ETA

- OSRM failures are silent — no alerts, just falls back to haversine
- Haversine fallback adds 30% road factor globally — may be inaccurate for specific areas
- Heading-based direction check skipped for stationary vans (stale heading)
- No multi-stop ETA — only computes ETA for the immediate next stop

### Data Model

- Route-to-van is 1:1 — a van can only have one route
- Stop progress does NOT reset between driver shifts — accumulates across the day
- Route run created implicitly on first GPS ping or driver start — no manual setup
- No audit/changelog tables — only `created_at`/`updated_at` timestamps

### Concurrency

- No database transactions for stop inference — race condition possible with simultaneous pings
- `Promise.all` for driver email lookups fails entirely if one lookup fails (no partial results)
- Active shift enforcement is application-level — no DB unique constraint preventing concurrent shifts

### CI/CD

- **No CI/CD pipeline** — quality gates (lint, typecheck, test, build) are manual
- All checks must be run locally before merging PRs (see Quality Gates above)

### Migrations

- **No rollback procedures** — migrations are forward-only SQL files
- To undo a migration, write a new migration that reverses the changes
- `npm run db:migrate` applies all pending migrations in order via `scripts/migrate.ts`
- `npm run db:migrate:docker` is a **legacy script** — it only applies the initial migration (`00001_initial.sql`) and should not be used for normal development

### Data Retention

- **No cleanup/retention policy** for `van_location_pings` — the table grows indefinitely
- For long-running instances, consider periodically archiving or deleting old pings (e.g., older than 90 days)
- `route_run_stops` and `route_runs` also accumulate without cleanup

### Seed Data

- `npm run db:seed` runs `scripts/seed-schedule.ts` — **destructive**: deletes all existing schedule entries before inserting
- Seeds 19 hardcoded stops for demonstration routes
- Safe for development; **never run in production** with real data

### Missing Features

- No Postgres backup automation configured
- No monitoring/alerting setup
- No production Docker Compose for the Next.js app (`infra/caab-vans/` is empty)
- `POST /api/track` endpoint exists but purpose is unclear (event logging?)
- No OSRM infrastructure docs in README (update script at `infra/osrm/scripts/update-data.sh`)
