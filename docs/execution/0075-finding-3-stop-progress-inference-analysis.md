# Finding 3: Stop-Progress Inference — Comprehensive Analysis

## How Stops Get Marked Today

The system marks stops through a GPS-driven geofence pipeline with no shift awareness:

```
GPS Ping → Tracking Endpoint → update_van_position (RPC)
                                    ↓ (if position updated)
                              inferStopProgress()
                                    ↓
                              1. Upsert route_run (auto-creates!)
                              2. Seed route_run_stops (all pending)
                              3. Geofence check per pending stop
                              4. Mark matched stop as "passed"
                              5. Backfill earlier stops as "passed"
```

**Key mechanisms:**

- **Geofence:** Haversine distance ≤ `geofence_radius_m` (default 50m)
- **Early arrival window:** Stop only eligible if `now ≥ scheduled_time - 30min`
- **Closest-in-time:** If multiple pending stops share a location, picks the one nearest to current time
- **Chronological backfill:** When stop N is marked passed, all pending stops before N are also marked passed (prevents gaps)

---

## The Two Independent Subsystems

The critical insight is that stop-marking and shift lifecycle are completely decoupled:

| Subsystem | Trigger | Touches `route_run_stops`? |
|---|---|---|
| `inferStopProgress` | Every GPS ping where position updated | YES — seeds + marks stops |
| Start/End shift | Driver taps Start/End in app | NO — only touches `route_shifts` |

The start endpoint (`POST /api/routes/[routeId]/start`) creates a `route_shifts` record but never touches `route_run_stops`. The end endpoint sets `ended_at` on the shift but also never touches stops.

---

## What Happens When Driver Starts Mid-Route (e.g., at Stop 3)

Concrete scenario — van's route has 10 stops, driver starts shift when already near stop 3:

**Before shift starts (van tracker already sending pings):**

1. Ping arrives → `inferStopProgress` runs
2. `route_run` auto-created (no shift exists)
3. All 10 `route_run_stops` seeded as "pending"
4. If van is within 50m of stop 1 and within the 30-min window → stop 1 marked "passed"
5. Stops continue accumulating "passed" status from GPS alone

**Driver starts shift at stop 3:**

1. `POST /start` creates `route_shifts` with `started_at = now()`
2. Stops 1 and 2 may already be marked "passed" from pre-shift pings
3. Next ping: stop 3 detected via geofence → marked "passed"
4. Backfill kicks in: any remaining pending stops before stop 3 also marked "passed"
5. From this point forward, normal progression continues

**Net effect:** The system handles mid-route start gracefully at the data level. The backfill mechanism means the driver doesn't need to start at stop 1 — wherever they are, earlier stops get auto-passed.

---

## The Real Problem: Pre-Shift Stop Marking

The issue isn't mid-route start — it's that stops get marked before any shift exists:

| Scenario | What Happens | User-Visible Impact |
|---|---|---|
| Van parked near stop overnight | Pings arrive → stop marked "passed" at 3am | Next morning, progress shows stop already done |
| Pre-shift device testing | Driver tests tracker near a stop → marked "passed" | UI shows premature progress |
| Midnight buffer flush | Batch arrives after midnight for new day → new `route_run` + stops seeded and marked | Day starts with phantom progress |

---

## Why Users Don't See It (The Safety Net)

The consumer API (`GET /api/routes/[routeId]`) has a critical gate at lines 265-266:

```ts
const isRunning = withinWindow && locationFresh &&
  progress?.runStatus === "in_progress";
```

Where `runStatus` comes from `deriveRunStatus()`:
- No shifts → `"waiting"` → `isRunning = false`
- Active shift → `"in_progress"` → `isRunning = true` (if other conditions met)

**When `isRunning = false`:**
- `nextStop` falls back to schedule-based (line 268: `isRunning ? getNextStop(...) : null`)
- Tracking-based override is skipped (line 283: `if (isRunning && progress?.nextStopId)`)
- The progress object is still returned in the response, but the UI logic relies on `isRunning`

So the UI is partially protected — the `isRunning` flag prevents showing GPS-based next stop when no shift is active. However:

1. `passedStopIds` is still returned in the progress object regardless of `isRunning`
2. `route_run_stops` data is permanently mutated — once "passed", it stays passed
3. When the driver eventually starts the shift, `isRunning` flips to `true` and the pre-marked stops immediately appear as passed — the UI shows an instant jump in progress

---

## Impact Assessment

| Impact Area | Severity | Explanation |
|---|---|---|
| Progress bar accuracy | Medium | When shift starts, progress may show stops already passed that the driver hasn't actually served |
| ETA computation | Medium | `nextStopId` may skip stops that were geofence-marked pre-shift, leading to ETA to a stop further ahead |
| Stop sequence integrity | Low | Backfill ensures no gaps, but the "passed" status is technically incorrect for unvisited stops |
| Data audit trail | Low | `passed_at` timestamps will reflect pre-shift times, which is misleading |
| Operational correctness | Low-Medium | For this transit use case, it's unlikely parents/riders rely on per-stop precision, but it sets wrong expectations |

---

## Why the Report's Fix Is Correct but Insufficient

The report proposes adding a shift check after the `route_runs` upsert:

```ts
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

This is correct — it gates stop marking on an active shift. But consider:

1. **Auto-creation of `route_run` still happens** — the upsert runs before the shift check. This is fine (`route_run` is just a container), but worth noting.
2. **Seeding of `route_run_stops` should also be gated** — currently happens before the shift check would be inserted. The proposed location (after line 62) is before seeding (line 65). If we want to avoid even seeding stops pre-shift, the check should go before line 65.
3. **Mid-route start still works** — when the driver starts, the next ping will find an active shift, seed stops, and the geofence + backfill will catch up correctly.

---

## Recommendations

1. Implement the proposed shift gate as described in the report — it's the minimal correct fix
2. Place it before stop seeding (before current line 65, not after line 62) to also prevent premature seeding
3. No schema changes needed — `route_shifts` table already exists with the right structure
4. Keep `route_run` auto-creation — it's harmless and needed for the shift to reference a run
5. Consider: Should `route_run` creation also be gated? Probably not — the start endpoint itself creates it, and having it exist pre-shift is fine

The fix is ~10 lines, low risk, and backward compatible. It cleanly separates "the tracker is sending pings" from "the driver is actively running the route."
