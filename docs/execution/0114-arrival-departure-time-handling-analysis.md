# Arrival/Departure Time Handling Analysis

Full cross-cutting analysis of how `arrival_time` and `departure_time` flow through the codebase.

**Last verified:** 2026-03-13 against current `dev` branch.

---

## Semantic Intent

- `arrival_time` = when the van should arrive at a stop (what passengers care about)
- `departure_time` = when the van should leave a stop (defines dwell time)
- DB constraint: `departure_time >= arrival_time`

---

## Data State

All 154 `schedule_entries` rows in the dev database have `arrival_time == departure_time` (backfilled from the legacy `time` column in migration `00016_schedule_time_split.sql`). The seed script (`scripts/seed-schedule.ts`) also sets both to the same value.

The test server has manually-set distinct values, so the bugs below are **already observable there**.

---

## Correct Usage (majority of codebase)

| Area | Field Used | Why Correct |
|---|---|---|
| ETA delay calculation (`eta.ts:247-251`) | `arrivalTime` | Delay = actual passage − scheduled arrival |
| ETA target (`eta.ts:348-353`) | `arrivalTime` | ETA predicts when van arrives |
| Overdue guard (`eta.ts:296,360`) | `arrivalTime` | "Atrasado" = past scheduled arrival |
| Public display (`hero-card`, `route-card`) | `arrivalTime` | Passengers need arrival time |
| Schedule timeline | Both (range when different) | Shows full picture |
| Schedule window start (`time.ts:50`) | First stop's `departure_time` | Route starts when van departs first stop |
| Cold-start detection (`start/route.ts:192`) | First stop's `departure_time` | Late start = past scheduled departure |
| Stop proximity scoring (`infer-stop-progress.ts:204-221`) | `arrival_time` | Geofence event closest to arrival |
| Stop proximity scoring (`process-device-geofence-events.ts:228-229`) | `arrival_time` | Device geofence event closest to arrival |
| Time floor filter (`eta.ts:92`) | `departureTime` | Skip stops van should have already left |

---

## Issues Found

### 1. `getNextStop()` uses wrong field — HIGH

**File:** `src/lib/time.ts:73`

```ts
const entryTime = parseTime(entry.departureTime);  // ← WRONG
if (entryTime >= now) return entry;
```

**Fix:** Change to `parseTime(entry.time)`. The function's type uses `time` (not `arrivalTime`) as the field name for arrival time.

This function finds "the next stop the van will arrive at" for public API responses (`/api/routes`, `/api/routes/[routeId]`). Using `departureTime` means if a stop has `arrival 09:00` and `departure 09:15`, and it's `09:05`, this function skips past it even though the van hasn't arrived yet.

**Callers:**
- `src/app/api/routes/route.ts:156` — routes list API
- `src/app/api/routes/[routeId]/route.ts:167` — single route detail API

**Impact:** Public route list and route detail may show wrong "next stop" when `arrival ≠ departure`.

---

### 2. Early arrival window gate uses wrong field — MEDIUM

**Files:**
- `src/lib/tracking/infer-stop-progress.ts:199`
- `src/lib/tracking/process-device-geofence-events.ts:225`

`infer-stop-progress.ts:199`:
```ts
const stopTime = stopDateTime(entry.departure_time);  // ← should be arrival_time
return eventTime >= stopTime.minus({ minutes: EARLY_ARRIVAL_WINDOW_MINUTES });
```

`process-device-geofence-events.ts:225`:
```ts
const stopTime = stopDateTime(entry.departure_time);  // ← should be arrival_time
if (eventTime < stopTime.minus({ minutes: EARLY_ARRIVAL_WINDOW_MINUTES })) continue;
```

**Fix:** Change `entry.departure_time` → `entry.arrival_time` in both files.

The gate says "allow geofence match if event is within 30 min before the stop's scheduled time." Should be 30 min before `arrival_time`. Using `departure_time` effectively widens the window by the dwell time. Note: both functions already use `arrival_time` for proximity scoring (picking the closest-in-time stop), creating an internal inconsistency within each function.

**Test files exist:**
- `src/__tests__/tracking/infer-stop-progress.test.ts`
- `src/__tests__/tracking/process-device-geofence-events.test.ts`

Both use `arrival_time === departure_time` in test data, masking the bug.

**Impact:** False early arrival matches when dwell time is significant.

---

### 3. Schedule window end uses wrong field — MEDIUM

**Files:**
- `src/lib/time.ts:51` (`isWithinScheduleWindow`)
- `src/lib/tracking/resolve-route-progress.ts:82` (`isPastScheduleWindow`)
- `src/lib/tracking/resolve-route-progress.ts:390` (orphaned shift detection)

`time.ts:51`:
```ts
const last = parseTime(sorted[sorted.length - 1].arrival_time);  // ← should be departure_time
```

`resolve-route-progress.ts:82`:
```ts
const lastTime = sortedEntries[sortedEntries.length - 1].arrival_time;  // ← should be departure_time
```

`resolve-route-progress.ts:390`:
```ts
const lastEntryTime = sortedEntries[sortedEntries.length - 1].arrival_time;  // ← should be departure_time
```

**Fix:** Change `.arrival_time` → `.departure_time` in all three locations.

A route isn't finished until the van departs the final stop, not when it arrives.

**Callers of `isWithinScheduleWindow`:**
- `src/app/api/routes/route.ts:105` — routes list API schedule status
- `src/app/api/routes/[routeId]/route.ts:104` — single route detail schedule status

**Downstream of `isPastScheduleWindow` (line 82):**
- Fed into `deriveRunStatus()` at line 86 → determines "completed" vs "idle"
- Affects early-return at lines 90-108 (completed/idle routes)

**Impact:** Route marked "past window", "completed", or "orphaned" prematurely when last stop has dwell time.

---

### 4. Driver API `isPastScheduleWindow` uses wrong field — MEDIUM

**File:** `src/app/api/driver/routes/route.ts:123`

```ts
const sortedTimes = sorted.map((e) => e.arrival_time);  // ← should be departure_time
```

This feeds into an independent `isPastScheduleWindow` calculation at lines 127-132, duplicating the same bug as issue #3 but in the driver API route listing endpoint.

**Fix:** Change `e.arrival_time` → `e.departure_time`.

**Impact:** Driver route list shows wrong run status when last stop has dwell time.

---

## Summary Matrix

| # | Location | Line | Current field | Should be | Severity |
|---|---|---|---|---|---|
| 1 | `src/lib/time.ts` `getNextStop()` | 73 | `entry.departureTime` | `entry.time` | HIGH |
| 2a | `src/lib/tracking/infer-stop-progress.ts` early gate | 199 | `entry.departure_time` | `entry.arrival_time` | MEDIUM |
| 2b | `src/lib/tracking/process-device-geofence-events.ts` early gate | 225 | `entry.departure_time` | `entry.arrival_time` | MEDIUM |
| 3a | `src/lib/time.ts` `isWithinScheduleWindow` end | 51 | `.arrival_time` | `.departure_time` | MEDIUM |
| 3b | `src/lib/tracking/resolve-route-progress.ts` `isPastScheduleWindow` | 82 | `.arrival_time` | `.departure_time` | MEDIUM |
| 3c | `src/lib/tracking/resolve-route-progress.ts` orphaned shift | 390 | `.arrival_time` | `.departure_time` | MEDIUM |
| 4 | `src/app/api/driver/routes/route.ts` `isPastScheduleWindow` | 123 | `e.arrival_time` | `e.departure_time` | MEDIUM |

All fixes are single-field swaps — no logic changes, no migrations needed. Existing tests pass because test data uses identical arrival/departure times; tests should be updated with distinct values to cover these cases.
