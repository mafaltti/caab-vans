# Tracking System Findings — Detailed Technical Report

**Date:** 2026-03-07
**Source:** Codex analysis (0072) verified and expanded by deep codebase inspection.

---

## Finding 1: `location_updated_at` Models the Wrong Thing

**Status: CONFIRMED | Severity: HIGH**

### Problem

`location_updated_at` on the `vans` table is set to **server time** (`new Date().toISOString()`) when GPS pings are stored, not the actual GPS device timestamp (`device_ts`). All consumers (ETA, freshness checks, "is running" logic) treat this field as a measure of GPS recency, but it actually measures "when did we last write to this row."

### Data Flow

#### Ingest paths that write `location_updated_at`:

| Endpoint | File | Line | Value Written |
|----------|------|------|---------------|
| Single ping | `src/app/api/tracking/[vanId]/route.ts` | 202 | `new Date().toISOString()` |
| Batch ping | `src/app/api/tracking-batch/[vanId]/route.ts` | 211 | `new Date().toISOString()` |
| Legacy ingest | `src/app/api/ingest/[vanId]/route.ts` | 72 | `nowBahia().toISO()` |

All three use **server time**, not the ping's `device_ts`.

Meanwhile, `device_ts` (the actual GPS timestamp) is correctly stored in `van_location_pings` but **never propagated to the `vans` table**.

#### Consumers of `location_updated_at`:

| Consumer | File | Lines | What It Does |
|----------|------|-------|-------------|
| Freshness check | `src/app/api/routes/[routeId]/route.ts` | 88-90 | `isLocationFresh(DateTime.fromISO(van.location_updated_at))` |
| Freshness check | `src/app/api/routes/route.ts` | 88-90 | Same |
| ETA VanPosition | `src/app/api/routes/[routeId]/route.ts` | 120 | `locationUpdatedAt: DateTime.fromISO(van.location_updated_at)` |
| ETA age calc | `src/lib/tracking/eta.ts` | 91-95 | `now.diff(vanPosition.locationUpdatedAt, "minutes").minutes` |
| isRunning gate | `src/app/api/routes/[routeId]/route.ts` | 255-256 | `withinWindow && locationFresh && progress?.runStatus === "in_progress"` |
| Tracker health | `src/lib/tracking/tracker-health.ts` | 40-47 | Staleness calc from `van.location_updated_at` |
| Admin APIs | `src/app/api/admin/vans/route.ts` | 21, 50 | Returned to admin UI |

### Impact Scenarios

**Scenario A — Offline buffer flush:**
1. Van loses network at 14:00, GPS keeps buffering locally.
2. Network returns at 15:50, device sends batch of 50 pings (14:00–15:50).
3. Server stamps `location_updated_at = 15:50` (server now), stores `device_ts` correctly in pings table.
4. Client checks freshness: `isLocationFresh(15:50)` → TRUE (only seconds old).
5. **Result:** Position from 14:00–15:50 appears "just received." ETA uses GPS branch with potentially stale coordinates.

**Scenario B — Old batch with recent server time:**
1. Device sends batch at 14:20 containing pings from 10:00–10:04 (4 hours old).
2. Server stamps `location_updated_at = 14:20`.
3. At 14:25, client sees location as 5 minutes old → fresh.
4. **Result:** A 4-hour-old GPS position drives live ETA.

### Proposed Fix

1. **New column:** `ALTER TABLE vans ADD COLUMN last_gps_fix_at timestamptz;`
2. **Backfill:** Populate from latest `van_location_pings.device_ts` per van.
3. **Ingest routes:** Write `last_gps_fix_at: deviceTs` (clamped device timestamp) instead of server `now()`.
4. **All consumers:** Read `last_gps_fix_at` instead of `location_updated_at` for freshness/ETA.
5. **Keep `location_updated_at`** for admin/audit ("when was this row last synced") — just stop using it for freshness.

**Files to change:**
- New migration file
- `src/app/api/tracking/[vanId]/route.ts` (line 202)
- `src/app/api/tracking-batch/[vanId]/route.ts` (line 211)
- `src/app/api/routes/[routeId]/route.ts` (lines 88-90, 120)
- `src/app/api/routes/route.ts` (lines 88-90, 111-123)
- `src/lib/tracking/eta.ts` (interface + age calc)
- `src/lib/tracking/tracker-health.ts` (lines 40-47)
- `src/types/index.ts` (Van type)

---

## Finding 2: Current-Position Projection on `vans` Is Race-Prone

**Status: CONFIRMED | Severity: HIGH**

### Problem

Both ingest endpoints follow a **read → decide → update** pattern with no atomic protection. Two concurrent pings can both read the same `previousLatest` snapshot, both decide they are "newest," and both unconditionally update the `vans` row. Whichever writes last wins, even if it carries an older `device_ts`.

### The Vulnerable Pattern

**Single ping** (`src/app/api/tracking/[vanId]/route.ts`):

```
Line 90-97:  SELECT previousLatest.device_ts FROM van_location_pings (snapshot)
Line 100-121: UPSERT ping into van_location_pings
Line 159-161: isNewest = deviceTs > previousLatest.device_ts (stale snapshot)
Line 192-208: UPDATE vans SET last_lat=..., WHERE id=vanId (NO timestamp guard)
```

**Batch ping** (`src/app/api/tracking-batch/[vanId]/route.ts`):

```
Line 71-77:  SELECT previousLatest.device_ts (snapshot before loop)
Line 83-142: Loop: UPSERT each ping, track newestUpserted
Line 167-170: isNewest = newestUpserted.deviceTs >= previousLatest.device_ts
Line 201-213: UPDATE vans (NO timestamp guard)
```

### Database Protections: None

- No `WHERE` clause on `device_ts` in the vans UPDATE.
- No optimistic locking column (version/timestamp guard).
- No trigger preventing regression.
- No RPC function for atomic compare-and-swap.
- No `SELECT FOR UPDATE` or explicit transactions.
- The unique index on `van_location_pings(van_id, device_ts)` protects the audit log but not `vans`.

Each Supabase client call is a separate HTTP request — no transaction wrapping.

### Race Walkthrough

Van has existing ping at `t1 = 10:00:00`. Two new pings arrive concurrently:
- **Ping A:** `device_ts = 10:01:00` (newer)
- **Ping B:** `device_ts = 10:00:30` (older than A)

| Step | Request A (t=10:01:00) | Request B (t=10:00:30) |
|------|----------------------|----------------------|
| 1. Read | `previousLatest = 10:00:00` | `previousLatest = 10:00:00` |
| 2. Upsert | Insert ping A | Insert ping B |
| 3. Decide | `10:01:00 > 10:00:00` → TRUE | `10:00:30 > 10:00:00` → TRUE |
| 4. Update vans | `last_lat = A.lat` | `last_lat = B.lat` |

**If B writes after A:** `vans.last_lat = B.lat` (from the older ping). Position regressed.

### Likelihood

- Tracker sends pings every 5-10 seconds per van.
- Request processing takes 50-500ms (validation + OSRM snap + DB writes).
- With a fleet of 10-50 vans, overlapping requests per van are plausible during batch flushes.
- **Moderate to high probability in production**, especially after offline buffer flushes.

### Proposed Fix

**Atomic compare-and-swap via RPC function:**

```sql
CREATE OR REPLACE FUNCTION update_van_position(
  p_van_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_accuracy_m DOUBLE PRECISION,
  p_speed_mps DOUBLE PRECISION,
  p_heading_deg DOUBLE PRECISION,
  p_snapped_lat DOUBLE PRECISION,
  p_snapped_lng DOUBLE PRECISION,
  p_device_ts TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE vans
  SET
    last_lat = p_lat,
    last_lng = p_lng,
    last_accuracy_m = p_accuracy_m,
    last_speed_mps = p_speed_mps,
    last_heading_deg = p_heading_deg,
    snapped_lat = p_snapped_lat,
    snapped_lng = p_snapped_lng,
    last_gps_fix_at = p_device_ts,
    location_updated_at = NOW()
  WHERE id = p_van_id
    AND (last_gps_fix_at IS NULL OR p_device_ts > last_gps_fix_at);

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
```

**Benefits:**
- Single atomic SQL statement — no interleaving possible.
- `WHERE last_gps_fix_at IS NULL OR p_device_ts > last_gps_fix_at` prevents regression.
- Returns `FOUND` boolean — only run `inferStopProgress` when position actually updated.
- Eliminates the `previousLatest` query entirely (no longer needed).

**Code changes:**
- Both ingest routes: Replace `previousLatest` query + `isNewest` check + direct UPDATE with single `.rpc("update_van_position", {...})` call.
- Conditionally run `inferStopProgress` only when RPC returns true.

**Note:** This fix also addresses Finding 1 if `p_device_ts` is used for `last_gps_fix_at`.

---

## Finding 3: Stop-Progress Inference Not Gated by Route Lifecycle

**Status: CONFIRMED | Severity: MEDIUM**

### Problem

`inferStopProgress()` runs on every newest ping with no check for whether a driver has started their shift. It:

1. Auto-creates `route_runs` for `todayBahiaDate()` via upsert (line 47-62 in `infer-stop-progress.ts`).
2. Seeds all `route_run_stops` as "pending" (lines 64-102).
3. Marks stops as "passed" based on geofence proximity and time window (lines 122-196).

The explicit start flow (`POST /api/routes/[routeId]/start`) creates a `route_shift` with `started_at`, but `inferStopProgress` never checks for an active shift.

### Call Sites

| Endpoint | File | Lines | Guard |
|----------|------|-------|-------|
| Single ping | `src/app/api/tracking/[vanId]/route.ts` | 210-214 | `isNewest` only |
| Batch ping | `src/app/api/tracking-batch/[vanId]/route.ts` | 219-228 | `isNewest` only |

### What `inferStopProgress` Does (No Lifecycle Gate)

```
1. Get route for van                                    (line 26-42)
2. serviceDate = todayBahiaDate()                       (line 44-45)
3. UPSERT route_run(route_id, service_date)             (line 47-62)  ← auto-creates!
4. Seed route_run_stops if count=0                      (line 64-102) ← all stops seeded
5. Fetch pending stops with coordinates                 (line 104-120)
6. For each pending stop within geofence + time window: (line 122-196)
   - Mark as "passed"
   - Backfill earlier stops
7. Return progress object                               (line 228-270)
```

**Missing:** No query to `route_shifts` to check `ended_at IS NULL`.

### Data Model

```
route_runs (one per route per day)
  ├── route_shifts (driver shift with started_at, ended_at)
  └── route_run_stops (pending → passed, with passed_at)
```

- `route_runs` has `started_at` and `ended_at` (from migration 00003) but these are legacy/unused.
- `route_shifts` is the actual lifecycle table (migration 00004) with NOT NULL `started_at`.
- `inferStopProgress` upserts `route_runs` with only `route_id` + `service_date` — no `started_at`.

### Impact Scenarios

**Scenario A — Van parked overnight near stop:**
- Van at 40m from stop (within 50m geofence), no driver on duty.
- GPS ping arrives → `inferStopProgress` runs → seeds stops → marks first stop as "passed."
- Next morning, UI shows progress before driver starts shift.

**Scenario B — Pre-shift device testing:**
- Driver tests tracker at home, happens to be near a route stop.
- Stops get marked as "passed" before shift starts.

**Scenario C — Midnight buffer flush:**
- Batch arrives at 00:05 for new calendar day.
- New `route_run` created for today, stops seeded and marked from overnight pings.

### Consumer Impact

Stops marked as "passed" flow to:
- `passedStopIds` array in API response → wrong progress bar in UI.
- `nextStopId` calculation → may skip stops.
- ETA computation → wrong baseline, skewed estimates.
- `delayMinutes` → may show negative delay (ahead of schedule when not).

### Proposed Fix

Add a shift check after the `route_runs` upsert, before any stop marking:

```typescript
// After line 62 in infer-stop-progress.ts:

// Check for active shift — skip inference if no driver has started
const { data: shifts } = await supabase
  .from("route_shifts")
  .select("id, ended_at")
  .eq("run_id", run.id)
  .is("ended_at", null)
  .limit(1);

if (!shifts || shifts.length === 0) {
  return EMPTY_PROGRESS;
}
```

**Changes required:**
- `src/lib/tracking/infer-stop-progress.ts`: Add ~10 lines after route_runs upsert.
- No schema changes needed — `route_shifts` table already exists.
- Backward compatible — existing data unchanged.

### Edge Cases Handled

- **Multiple shifts per day:** `ended_at IS NULL` matches any active shift.
- **Overnight routes:** Shift stays active (ended_at still NULL) across midnight.
- **Admin overrides:** Manual stop marking via admin API remains unaffected.

---

## Finding 4: Sequence Counter (`resetSequence`) Is Dead Code

**Status: CONFIRMED | Severity: LOW | Recommendation: REMOVE**

### Problem

The van-tracker app has a sequence counter (`currentSeq`) that increments on every ping and a `resetSequence()` function that is exported but **never called anywhere**. On the server side, `seq` is received, stored in the database, and used only for `console.warn` gap logging — no business logic depends on it.

### What Exists

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| `currentSeq` state | `apps/van-tracker/src/location/task.ts` | 47 | Module-level counter |
| Set on ping | `apps/van-tracker/src/location/task.ts` | 337 | `point.seq = currentSeq` |
| Increment + persist | `apps/van-tracker/src/location/task.ts` | 352-354 | `currentSeq++; AsyncStorage.setItem(...)` |
| Cold-start hydration | `apps/van-tracker/src/location/task.ts` | 239-241 | Restore from AsyncStorage |
| `resetSequence()` | `apps/van-tracker/src/location/task.ts` | 410-414 | Set to 0, persist — **NEVER CALLED** |
| `seq` in type | `apps/van-tracker/src/types.ts` | 8 | `seq?: number \| null` |
| `seq` in API client | `apps/van-tracker/src/api/client.ts` | 49, 127 | Sent in request body |
| `seq` in validator | `src/lib/validators/tracking.ts` | 11 | `z.int().nonnegative().nullable().optional()` |
| `seq` in upsert | `src/app/api/tracking/[vanId]/route.ts` | 112 | Stored in DB |
| Gap detection | `src/app/api/tracking/[vanId]/route.ts` | 136-154 | `console.warn` only |
| Gap detection | `src/app/api/tracking-batch/[vanId]/route.ts` | 144-163 | `console.warn` only |
| DB column | `supabase/migrations/00007_tracker_resilience.sql` | 4 | `seq integer` (nullable) |
| DB index | `supabase/migrations/00007_tracker_resilience.sql` | 12-14 | Partial index on `(van_id, seq)` |

### Why It's Useless

1. **`resetSequence()` is never called** — exhaustive search confirms zero callers.
2. **No route-start coupling** — the server-side start API has no way to notify the mobile tracker.
3. **Counter never resets** — spans multiple route runs, making per-run gap detection meaningless.
4. **Server only logs gaps** — `console.warn`, no alerts, no retry, no business logic.
5. **Spec says observational only** — FR-016/FR-017 explicitly state "no automatic recovery is attempted."
6. **`device_ts` ordering is superior** — the immutable ping log with `device_ts` and `received_at` provides better ordering than a client-side counter.

### Recommendation: Remove Entire Mechanism

Removing just `resetSequence()` leaves a counter that increments forever with no reset, no consumer, and false semantics. Remove the whole thing.

**Removal scope (~81 lines across 7 files):**

| File | What to Remove |
|------|---------------|
| `apps/van-tracker/src/location/task.ts` | `currentSeq` decl (47), hydration (239-241), set (337), increment (352-354), `resetSequence` (410-414) |
| `apps/van-tracker/src/types.ts` | `seq` field (8) |
| `apps/van-tracker/src/api/client.ts` | `seq` in request body (49, 127) |
| `src/app/api/tracking/[vanId]/route.ts` | `seq` destructuring (72), upsert field (112), gap detection block (136-154) |
| `src/app/api/tracking-batch/[vanId]/route.ts` | `seq` upsert field (107), gap detection block (144-163) |
| `src/lib/validators/tracking.ts` | `seq` schema field (11) |

**DB column removal** (future migration, not urgent):
```sql
DROP INDEX IF EXISTS idx_van_location_pings_van_seq;
ALTER TABLE van_location_pings DROP COLUMN IF EXISTS seq;
```

---

## Finding 5: OSRM Timeouts Too Aggressive for Production

**Status: CONFIRMED | Severity: MEDIUM**

### Problem

OSRM timeouts are hardcoded to **50ms** (road snapping via `/match`) and **100ms** (ETA via `/route`). These are too tight for a production VPS/container environment and will frequently force silent fallback to lower-quality haversine calculations.

### OSRM Client Code

**File:** `src/lib/tracking/osrm.ts`

**`osrmRoute` — ETA distance/duration (line 19):**
```typescript
const timer = setTimeout(() => controller.abort(), 100);  // 100ms
```
Returns `OsrmRouteResult | null`. On any failure (timeout, network, bad response), returns `null`.

**`snapToRoad` — Road snapping (line 69):**
```typescript
const timer = setTimeout(() => controller.abort(), 50);   // 50ms
```
Returns `{ lat, lng } | null`. Distinguishes `AbortError` in logging but returns `null` regardless.

Both functions catch all errors and return `null` — the callers cannot distinguish a timeout from a genuine "no route" response.

### Callers and Fallback Behavior

#### ETA computation (`src/lib/tracking/eta.ts`, lines 116-167)

```
osrmRoute(van, nextStop) → OsrmRouteResult | null
  ├── If result: baseTravelMinutes = osrmResult.durationSeconds / 60
  │              etaSource = "gps_osrm"
  └── If null:   baseTravelMinutes = haversineDistance × ROAD_FACTOR / speed / 60
                 etaSource = "gps"
```

Called from:
- `GET /api/routes/[routeId]` (line 228)
- `GET /api/routes` (line 228)

#### Road snapping (tracking routes, lines 167-190 / 176-199)

```
snapToRoad(trajectory) → { lat, lng } | null
  ├── If result: snappedLat/snappedLng set → stored on vans table
  └── If null:   snappedLat/snappedLng remain null → raw GPS used for map
```

Called from:
- `POST /api/tracking/[vanId]` (line 185)
- `POST /api/tracking-batch/[vanId]` (line 194)

### Quality Degradation

| Scenario | With OSRM | Haversine Fallback |
|----------|-----------|-------------------|
| Straight avenue | ~5% ETA error | ~15% error |
| Grid neighborhood | ~5% error | ~10% error |
| Winding hillside road | ~10% error | **~40-60% error** |
| One-way detour | ~15% error | **~50-100% error** |

**Road snapping degradation:** Raw GPS shows van off-road or on wrong street. Snapped position refines ~10m GPS accuracy to ~2m road-center accuracy.

**`ROAD_FACTOR = 1.3`** is a fixed multiplier applied to haversine distance. Real road-to-straight ratios vary from 1.05 (straight avenues) to 2.0+ (hillside neighborhoods in Salvador/Bahia).

### Timeout Likelihood

| Environment | Snap (50ms) timeout rate | Route (100ms) timeout rate |
|------------|------------------------|--------------------------|
| Localhost OSRM (unloaded) | ~5-10% | ~1-5% |
| Localhost OSRM (concurrent load) | ~10-20% | ~5-10% |
| Public demo OSRM | ~95% | ~70-80% |

Note: Batch scripts (`scripts/precompute-stop-distances.ts`, `scripts/compute-time-factors.ts`) use **500ms** timeouts — 5-10x more generous than runtime.

### Observability Gap

**What exists:** `console.warn` on timeout/error in `osrm.ts` (lines 76, 83, 89, 98-101).

**What's missing:**
- No counter for timeouts per hour/day.
- No histogram of OSRM response latencies.
- No fallback frequency tracking.
- No way to answer "how often did OSRM timeout today?"
- ETA response includes `etaSource: "gps"` vs `"gps_osrm"`, but this isn't aggregated.

### Proposed Fix

**1. Make timeouts configurable via environment variables:**

```typescript
// osrm.ts
const OSRM_ROUTE_TIMEOUT_MS = parseInt(process.env.OSRM_ROUTE_TIMEOUT_MS ?? "300", 10);
const OSRM_MATCH_TIMEOUT_MS = parseInt(process.env.OSRM_MATCH_TIMEOUT_MS ?? "200", 10);
```

**Recommended defaults:** 300ms (route), 200ms (match) — safe for localhost OSRM with headroom for load spikes.

**2. Add structured logging with timeout distinction:**

```typescript
// In catch blocks, log structured data:
console.warn("[osrm] timeout", { endpoint: "route", timeoutMs: OSRM_ROUTE_TIMEOUT_MS, vanId });
console.warn("[osrm] timeout", { endpoint: "match", timeoutMs: OSRM_MATCH_TIMEOUT_MS, vanId });
```

**3. (Optional) Add metrics endpoint:**

Expose `/api/metrics/osrm` with request counts, timeout counts, timeout rates, and p99 latencies for operational monitoring.

**Files to change:**
- `src/lib/tracking/osrm.ts` (lines 19, 69 — replace hardcoded values)
- `.env.local.example` (add `OSRM_ROUTE_TIMEOUT_MS`, `OSRM_MATCH_TIMEOUT_MS`)
- `docs/OPERATIONS.md` (update timeout documentation)

---

## Implementation Priority

| Priority | Finding | Fix Complexity | Can Be Combined |
|----------|---------|---------------|-----------------|
| 1 | #1 + #2 | Medium (1 migration + 1 RPC + update 2 ingest routes + consumers) | Yes — single PR, single RPC solves both |
| 2 | #3 | Small (~10 lines in `infer-stop-progress.ts`) | Separate PR |
| 3 | #4 | Small (~81 lines removed across 7 files) | Separate PR |
| 4 | #5 | Small (2 lines in `osrm.ts` + env vars + docs) | Separate PR |

**Findings #1 and #2 should be fixed together** — the RPC function that adds `last_gps_fix_at` with a `WHERE` guard addresses both the wrong-timestamp problem and the race condition in one atomic operation.

**Finding #5 is low-effort, low-risk** — changing two hardcoded values to env-configurable defaults. Can be shipped independently at any time.
