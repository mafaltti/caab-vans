# Route Run & Stop Progress Deep Dive

## QUESTION: Please explain route_run

Based on the project memory and codebase, here's how `route_run` works:

### Route Run — Daily Route Instance

A `route_run` represents a single execution of a route on a specific day. While routes define the fixed template (which van, which stops), a `route_run` tracks whether that route is actually running today.

### State Machine

```
waiting → in_progress → completed
```

| State | Condition |
|---|---|
| `waiting` | `started_at IS NULL` |
| `in_progress` | `started_at IS NOT NULL`, `ended_at IS NULL` |
| `completed` | Both `started_at` and `ended_at` are set |

### Key Fields

- `route_id` — which route this run belongs to
- `service_date` — the calendar date (one run per route per day)
- `started_at` / `ended_at` — timestamps marking the lifecycle
- Links to `route_run_stops` — per-stop progress tracking (pending → passed via geofencing)

### API Flow

1. Driver starts route → `POST /api/routes/[routeId]/start` → creates/updates the `route_run` with `started_at = now()`
2. GPS pings arrive → geofence checks against `route_run_stops` auto-advance stops to `passed` when the van is within 50m
3. Driver ends route → `POST /api/routes/[routeId]/end` → sets `ended_at`

### Why It Exists

Routes are static templates (van X runs stops A→B→C every day). The `route_run` layer adds the daily instance so the system can track:

- Is the route active right now?
- Which stops has the van already passed today?
- What's the ETA to the next stop?

Without it, there'd be no way to distinguish "route exists" from "route is currently in progress."

---

## QUESTION: What determines state in_progress?

● *Searched for 2 patterns, read 2 files (ctrl+o to expand)*

The `in_progress` state is determined by whether any shift has no `ended_at`.

From `src/lib/tracking/run-status.ts:8-9`:

```ts
const hasActive = shifts.some((s) => s.ended_at === null);
if (hasActive) return "in_progress";
```

So concretely: a route run is `in_progress` when at least one `route_shifts` row linked to that run has `ended_at IS NULL` — meaning a driver has started a shift but hasn't ended it yet.

### The Full State Derivation

| Condition | Status |
|---|---|
| No shifts exist for the run | `waiting` |
| Any shift has `ended_at === null` | `in_progress` |
| All shifts ended + past schedule window | `completed` |
| All shifts ended + still within schedule window | `idle` |

The model uses shifts (not the `route_run` row directly) because of multi-driver support — a single run can have multiple shifts throughout the day. The route is considered active as long as any driver is currently on shift.

---

## QUESTION: And how stops that are passed in that day are persisted?

● *Searched for 3 patterns, read 1 file (ctrl+o to expand)*

### `route_run_stops` — Per-Day Stop Progress

**Schema:**

```sql
route_run_stops (
  run_id            uuid  → route_runs(id),
  schedule_entry_id uuid  → schedule_entries(id),
  status            'pending' | 'passed',
  passed_at         timestamptz,
  PRIMARY KEY (run_id, schedule_entry_id)
)
```

Each row is one stop for one day's run. Status starts as `pending` and flips to `passed` once the van arrives.

### How They Get Created

Seeded on first GPS ping (`infer-stop-progress.ts:56-77`). When the first location ping arrives for a run that has zero `route_run_stops`, the system bulk-inserts one row per `schedule_entry` — all set to `pending`.

### How They Flip to Passed

Geofence check on every GPS ping (`infer-stop-progress.ts:92-136`). For each pending stop, the system:

1. Skips stops whose scheduled time is too far in the future (early arrival window guard)
2. Skips duplicate coordinates already matched in this ping
3. Computes haversine distance between the van's current `(lat, lng)` and the stop's `(stop_lat, stop_lng)`
4. If `distance ≤ geofence_radius_m` → updates that row to `status = 'passed'` and sets `passed_at = now()`

So stops are persisted via automatic geofence detection — no manual driver action needed. Each GPS ping is an opportunity to advance pending stops.

---

## QUESTION: Ok, what if first GPS ping is for example the 10th stop of the chronological order of that route?

Good catch — stops 1–9 would remain `pending`.

The geofence logic only marks a stop as `passed` when the van is physically within its radius. There's no backfill of earlier stops. So in your scenario:

1. All stops get seeded as `pending`
2. Geofence check runs — only stop 10 matches → gets flipped to `passed`
3. Stops 1–9 stay `pending` indefinitely (unless the van physically passes through each one)

### What the Consumer Sees

In the result-building step (lines 154–166), `nextStopId` is the first pending stop with `time >= timeFloor`. Since stops 1–9 have earlier times than the route's `started_at`, they'd be skipped by the time floor filter — so `nextStopId` would correctly land on stop 11.

But `passedStopIds` would only contain stop 10, missing 1–9. Any UI relying on that list (e.g., a timeline showing checkmarks) would show stops 1–9 as not passed, which is misleading.

### The Gap

There's no chronological inference like "if stop 10 is passed, all prior stops must also be passed." The system relies purely on physical proximity, one ping at a time. If the van starts mid-route (driver forgot to start earlier, GPS was off, etc.), the earlier stops are never reconciled.

---

## QUESTION: What would be a suitable approach to solve this?

Two options that come to mind:

### Option A: Backfill on Geofence Hit (Simple)

When a stop is marked as `passed`, also mark all earlier pending stops (by scheduled time) as `passed`. This is a single additional query right after the geofence update — something like "update all pending stops for this run where `time < passedStopTime`."

**Pros:** Minimal change, one extra query, no new concepts.
**Con:** Assumes strict chronological order — if a route ever loops back to an earlier stop, it would incorrectly mark it as passed.

### Option B: Backfill on Read (Computed)

Don't change the write path. Instead, when building the `StopProgress` result, treat any pending stop with a time earlier than the latest passed stop as implicitly passed.

**Pros:** Zero write-side changes, self-correcting on every read.
**Con:** The DB doesn't reflect reality — `route_run_stops` shows stale data if queried directly.

---

Given this project's routes are fixed linear sequences (no loops), **Option A** seems like the better fit — data stays correct at the source, and it's a small, focused change in `infer-stop-progress.ts`. Want me to implement it?

---

## QUESTION: But what if a route has same stop multiple times, for example CAAB at 7:00 then again CAAB at 11:00?

Good point. With Option A naively backfilling by time, when the van hits CAAB at 11:00, it would also mark the 7:00 CAAB as passed — which is correct. But if the van hits CAAB at 7:00 first, a simple "mark all earlier stops" approach already handles that fine.

The real problem is: two `schedule_entries` can share the same `stop_lat`/`stop_lng`. The geofence check already guards against this with the `matchedCoords` set (line 108) — it only matches the first pending stop at a given coordinate per ping. So the 7:00 CAAB gets passed first, and the 11:00 CAAB stays pending until the van returns later.

The backfill doesn't break this because it's time-based, not location-based. When stop N is marked as passed, you backfill all pending stops with `time < stop_N.time`. The 11:00 CAAB has a later time, so it stays untouched.

The one edge case: what if the van skips the 7:00 CAAB entirely and the first ping near that location is at 11:00? The early arrival window guard (line 112) would prevent matching the 7:00 entry if it's too far in the past... actually let me check that.

● *Searched for 1 pattern (ctrl+o to expand)*

The guard only skips stops whose time is **in the future** (`now < stopTime - 30min`). It doesn't skip past stops. So at 11:00, the 7:00 CAAB is still eligible for geofence matching — the `matchedCoords` dedup would match the 7:00 one first (it's ordered by time), consuming that coordinate, and the 11:00 one would be skipped for that ping.

That's actually a **bug** in the skip scenario: the van arrives at CAAB at 11:00 but the 7:00 entry "eats" the geofence match, leaving the 11:00 entry pending.

### Revised Approach

Backfill by time + match geofence to the **closest-in-time** pending stop, not just the first one. Concretely:

1. When a geofence matches a coordinate, pick the pending stop whose scheduled time is **closest to now** (not the earliest)
2. After marking it passed, backfill all earlier pending stops as passed

This way, at 11:00 near CAAB, the 11:00 entry gets matched (closest to now), and the 7:00 CAAB gets backfilled. Both end up as `passed`.

Want me to implement this?
