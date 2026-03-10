# CAAB Vans — Live Tracking Spec

## Context (Current Repo State)

- Next.js App Router web+BFF. Server routes at `src/app/api/*/route.ts`. Supabase service role client on server. **No Edge Functions.** Timezone: `America/Bahia`.
- Vans have `location_url` (Google Maps URL — being deprecated) and `location_updated_at`, updated via `POST /api/ingest/[vanId]` with `x-ingestion-token` header.
- Routes have `schedule_entries` (`stop_name` + `time`). Public UI shows "next scheduled stop/time".
- Rate limiting: `src/lib/api/rate-limit.ts`. Error helpers: `src/lib/api/errors.ts`. Timezone helpers: `src/lib/time.ts`.
- Expo tracker app spec: `docs/android-app+tracking/expo-background-geolocation-app.md`.

## Goal

Build an end-to-end live tracking system:

1. **Ingest** location pings from the Expo tracker app — store history + update latest position.
2. **Infer** stop progress ("passed") for today's route run using proximity detection.
3. **Compute** ETA for the next stop using schedule-shifted delay.
4. **Expose** tracking progress through existing public API endpoints for the web UI.

## Hard Constraints

- **KISS / DRY / YAGNI** — build only what's needed now.
- No Supabase Edge Functions.
- Service role key stays server-only.
- `America/Bahia` for all date/time comparisons (Luxon).
- English in code/comments; Portuguese in UI text (existing convention).
- Follow existing repo conventions — read before writing.

---

## API Contract (Tracking Endpoint)

Shared contract between the Expo app and backend. See the Expo app spec for client-side details.

**Endpoint:** `POST /api/tracking/[vanId]`

**Headers:**

- `Content-Type: application/json`
- `x-ingestion-token: <token>` — from `vans.ingestion_token`

**Body:**

```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "lat": -12.9714,
  "lng": -38.5124,
  "accuracy": 8.5,
  "speed": 12.3,
  "heading": 180.0,
  "ts": 1717012345678
}
```

| Field | Type | Description |
|-------|------|-------------|
| `deviceId` | `string` (UUID) | Persisted device identifier (diagnostic/audit) |
| `lat` | `number` | Latitude, WGS84 |
| `lng` | `number` | Longitude, WGS84 |
| `accuracy` | `number \| null` | Horizontal accuracy in meters |
| `speed` | `number \| null` | Speed in m/s |
| `heading` | `number \| null` | Heading in degrees (0–360) |
| `ts` | `number` | Device timestamp — Unix milliseconds, UTC |

`vanId` is in the URL path. `deviceId` is for diagnostic/audit — it does not affect routing.

**Responses:**

| Status | Body | When |
|--------|------|------|
| `200` | `{ "received": true, "ts": <server_unix_ms> }` | Ping accepted |
| `400` | `{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }` | Invalid body |
| `401` | `{ "error": { "code": "UNAUTHORIZED", "message": "..." } }` | Bad/missing token |
| `404` | `{ "error": { "code": "NOT_FOUND", "message": "..." } }` | Van not found |
| `429` | `{ "error": { "code": "RATE_LIMITED", "message": "..." } }` | Rate limit exceeded |

**Rate limit:** 40 requests/minute per van (~2,400/hour). Accommodates 3s client interval (~1,200/hour) plus headroom for buffer flushes.

---

## Deliverables

### A) Database Migration

File: `supabase/migrations/00002_live_tracking.sql`

#### 1) Stop Geofencing Fields on `schedule_entries`

```sql
ALTER TABLE schedule_entries ADD COLUMN stop_lat DOUBLE PRECISION;
ALTER TABLE schedule_entries ADD COLUMN stop_lng DOUBLE PRECISION;
ALTER TABLE schedule_entries ADD COLUMN geofence_radius_m INTEGER NOT NULL DEFAULT 50;
```

Nullable lat/lng for backward compatibility. Inference skips entries without coordinates.

Single radius (V1 simplification) — no enter/exit hysteresis.

#### 2) Latest Van Location Fields on `vans`

```sql
ALTER TABLE vans ADD COLUMN last_lat DOUBLE PRECISION;
ALTER TABLE vans ADD COLUMN last_lng DOUBLE PRECISION;
ALTER TABLE vans ADD COLUMN last_accuracy_m DOUBLE PRECISION;
ALTER TABLE vans ADD COLUMN last_speed_mps DOUBLE PRECISION;
ALTER TABLE vans ADD COLUMN last_heading_deg DOUBLE PRECISION;
```

Reuses existing `location_updated_at` column — updated on each ping. No new timestamp column needed.

#### 3) Location History Table

```sql
CREATE TABLE van_location_pings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    van_id      UUID NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
    device_id   UUID NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    accuracy_m  DOUBLE PRECISION,
    speed_mps   DOUBLE PRECISION,
    heading_deg DOUBLE PRECISION,
    device_ts   TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_van_location_pings_van_received
    ON van_location_pings (van_id, received_at DESC);
```

#### 4) Route Run + Stop Status Tables

```sql
CREATE TABLE route_runs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id     UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    service_date DATE NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (route_id, service_date)
);

CREATE TRIGGER trg_route_runs_updated_at
    BEFORE UPDATE ON route_runs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE route_run_stops (
    run_id            UUID NOT NULL REFERENCES route_runs(id) ON DELETE CASCADE,
    schedule_entry_id UUID NOT NULL REFERENCES schedule_entries(id) ON DELETE CASCADE,
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'passed')),
    passed_at         TIMESTAMPTZ,
    PRIMARY KEY (run_id, schedule_entry_id)
);

CREATE INDEX idx_route_run_stops_run_status
    ON route_run_stops (run_id, status);
```

V1 uses two states only: `pending` → `passed`. No `arrived` state or dwell timer. The CHECK constraint can be extended in V2 if needed (adding `'arrived'` is a non-breaking schema change).

#### 5) RLS

```sql
ALTER TABLE van_location_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_run_stops ENABLE ROW LEVEL SECURITY;
-- No anon policies. All access via service role in BFF.
```

---

### B) Location Ping Ingestion Endpoint

**Route handler:** `src/app/api/tracking/[vanId]/route.ts`

Follows patterns from existing `src/app/api/ingest/[vanId]/route.ts`.

**Flow:**

1. Rate limit check — `createRateLimiter({ windowMs: 60_000, maxRequests: 40 })`.
2. Read `x-ingestion-token` header. Return `401` if missing.
3. Look up van by `vanId`. Return `404` if not found, `401` if token mismatch.
4. Parse and validate body with Zod.
5. Convert `ts` (milliseconds) to timestamptz. If `ts` is > 24h in the future, fall back to `now()`.
6. Insert into `van_location_pings`.
7. Update `vans`: set `last_lat`, `last_lng`, `last_accuracy_m`, `last_speed_mps`, `last_heading_deg`, `location_updated_at = now()`.
8. **Best-effort** stop inference (try/catch — if it fails, log error, still return 200).
9. Return `{ received: true, ts: Date.now() }`.

**Validation (`src/lib/validators/tracking.ts`):**

```ts
import { z } from "zod";

export const trackingSchema = z.object({
  deviceId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().nullable(),
  speed: z.number().nonnegative().nullable(),
  heading: z.number().min(0).max(360).nullable(),
  ts: z.number().int().positive(),
});
```

---

### C) Stop Inference — V1 (Simple Proximity)

**Module:** `src/lib/tracking/infer-stop-progress.ts`

**Algorithm (runs on each accepted ping):**

1. Find the route for this van (`routes` where `van_id = vanId`).
2. Ensure `route_run` exists for `(route_id, today's Bahia date)`. On first creation, bulk-insert `route_run_stops` rows for each `schedule_entry` of that route, all with status `'pending'`.
3. Fetch unpassed stops (`status = 'pending'`) that have coordinates, ordered by `time` ASC.
4. For each unpassed stop (in schedule order):
   - Compute haversine distance from ping `(lat, lng)` to stop `(stop_lat, stop_lng)`.
   - If distance <= `geofence_radius_m`: mark `status = 'passed'`, set `passed_at = now()`.
5. Return: `{ passedStopIds: string[], nextStopId: string | null, lastPassedStopId: string | null }`.

**Haversine:** Implement in `src/lib/tracking/haversine.ts`. Pure function, easy to unit test.

**V1 simplification:** No hysteresis, no dwell timer. One ping within geofence radius = passed. If real-world data shows GPS jitter causing false positives, V2 adds dwell/hysteresis.

**Skipping rule:** Entries without `stop_lat`/`stop_lng` are skipped — no inference attempted.

---

### D) ETA Computation (Schedule-Shifted)

**Module:** `src/lib/tracking/eta.ts`

**Algorithm:**

1. Find the last passed stop and its `passed_at` timestamp.
2. Get that stop's scheduled time (parsed in `America/Bahia`).
3. `delay = passed_at - scheduled_time`.
4. For the next stop: `predicted_arrival = scheduled_time(nextStop) + delay`.
5. Return `{ etaISO: string, etaMinutes: number }` (ceil minutes).

**Edge cases:**

- No stop passed yet → ETA = next stop's scheduled time (zero delay).
- All stops passed → ETA = null (route complete).

**Limitation:** Linear shift model — assumes delay is uniform. Sufficient for fixed urban routes. A rolling-average model can replace this in V2 if data warrants it.

---

### E) Public API Extension

Update `GET /api/routes` and `GET /api/routes/[routeId]` responses.

**Additions to route response shape:**

```ts
// Extend existing van object
van: {
  id: string;
  locationUrl: string | null;        // existing (deprecated)
  locationUpdatedAt: string | null;   // existing
  isLocationOutdated: boolean;        // existing
  lastLat: number | null;             // NEW
  lastLng: number | null;             // NEW
};

// New top-level field on route
progress: {
  serviceDate: string;                // "YYYY-MM-DD"
  nextStopId: string | null;
  passedStopIds: string[];
  etaNextStopISO: string | null;
  etaNextStopMinutes: number | null;
  delayMinutes: number | null;
} | null;
```

`progress` is `null` when no tracking data exists for today. Existing UI behavior is fully preserved — tracking data is additive.

> **Important:** Keep existing `nextStop` (schedule-based). We are **adding** inferred `progress`, not replacing the schedule concept. Both coexist — UI labels them truthfully ("scheduled" vs "estimated").

---

### F) Admin UI — Stop Coordinates

Update schedule editor to accept lat/lng per stop.

**`src/components/admin/schedule-editor.tsx`:**

- Add optional `Latitude` and `Longitude` number inputs per schedule entry.
- Show as collapsed/secondary fields to keep the UI clean.

**Validator extension (`src/lib/validators/schedule-entry.ts`):**

```ts
stop_lat: z.number().min(-90).max(90).nullable().optional(),
stop_lng: z.number().min(-180).max(180).nullable().optional(),
```

**Admin API endpoints:** Include `stop_lat` and `stop_lng` in GET responses and accept them in POST/PUT.

`geofence_radius_m` uses the DB default (50m). No UI for editing in V1.

---

### G) Public UI — ETA + Passed Stops

#### `schedule-timeline.tsx`

Add optional props: `passedStopIds?: string[]`, `inferredNextStopId?: string | null`.

When tracking data is available, use it to determine stop statuses instead of index-based inference. Fall back to current behavior when no tracking data.

#### `hero-card.tsx`

When `isRunning` and `progress?.etaNextStopMinutes` exists:

- Display: `"Chegada estimada: HH:mm (≈X min)"`

When `van.lastLat` and `van.lastLng` exist:

- Show a "Ver no mapa" link or embedded map view (Leaflet/OpenStreetMap). Full map component is a separate spec.

#### `route-card.tsx`

When `progress?.etaNextStopMinutes` exists:

- Show: `"ETA: ~X min"` below the next stop line.

---

### H) Expo Tracker App

**See separate spec:** `docs/android-app+tracking/expo-background-geolocation-app.md`

The Expo app is an independent deliverable. It sends location pings to the API contract defined above. It handles:

- Background tracking with screen locked (Android foreground service)
- Client-side throttle (5m distance / 3s interval)
- Offline buffering (50 points in AsyncStorage)
- Settings UI (API Base URL, Van ID, Ingestion Token)

The Expo app lives in `apps/van-tracker/` (per TECH.md monorepo layout).

---

### I) Tests

Unit tests with vitest for:

- **Haversine distance** — known coordinate pairs → expected distance in meters.
- **Stop inference transitions** — given ping coordinates + stop locations, verify correct stops marked as passed.
- **ETA computation** — given passed stop with known delay, verify predicted ETA.

---

### J) Documentation

Add `docs/TRACKING.md` covering:

- How to configure stop coordinates (admin panel).
- How the driver app authenticates (ingestion token from admin).
- Operational expectations (battery, foreground notification, best-effort tracking).
- Data retention policy.

---

## Operational Concerns

### Data Retention

`van_location_pings` grows at ~1,200 rows/hour per active van. Implement a cleanup job:

- Keep pings for **30 days**.
- Daily cleanup: `DELETE FROM van_location_pings WHERE received_at < now() - INTERVAL '30 days'`.
- Use pg_cron or an external scheduled job.

### Rollback Strategy

If inference logic has bugs after deploy:

- `progress` in the API response is already nullable — frontend falls back to schedule-based behavior automatically.
- Revert inference code; the tracking endpoint continues to store pings independently.
- Tables remain for forensics; clean up once verified safe.

### Android Background Tracking Caveats

- Android Doze mode may delay pings by 5–15 minutes when the device is idle and stationary.
- Users should disable battery optimization for the tracker app.
- The foreground service notification keeps the app alive — this is expected behavior, not a bug.
- Tracking is **best-effort**; gaps in pings should not break inference (it processes whatever data is available).

### Monitoring (Future)

- Alert if a van that should be running has no pings in 15+ minutes.
- Alert if `van_location_pings` table exceeds a size threshold.

---

## Phasing Strategy

Break into focused PRs, all targeting `dev`:

| Phase | Scope | Depends On |
|-------|-------|------------|
| **1 — DB + Ingestion** | Migration (A) + tracking endpoint (B) + Zod validator | — |
| **2 — Inference + ETA** | Stop inference (C) + ETA module (D) + unit tests (I) | Phase 1 |
| **3 — API Surface** | Public API extension (E) — add `progress` + `lastLat/Lng` to route responses | Phase 2 |
| **4 — Frontend** | Admin UI (F) + public UI changes (G) | Phase 3 |
| **5 — Mobile App** | Expo app (H) — can be built **in parallel** with phases 2–4 | Phase 1 (API contract) |
| **6 — Docs + Ops** | Documentation (J) + retention cron setup | Phase 4 |

Each PR is independently reviewable and deployable. Earlier phases don't break existing functionality.

---

## Implementation Notes

- Reuse existing helpers: `createRateLimiter`, `apiError`, `validationError`, `createServiceClient`, `nowBahia`.
- Keep DB writes efficient — the ingestion endpoint should be 2–3 queries max (insert ping + update vans + upsert run stop).
- Use Luxon for all `America/Bahia` date comparisons.
- Prefer minimal diffs; don't refactor unrelated code.
