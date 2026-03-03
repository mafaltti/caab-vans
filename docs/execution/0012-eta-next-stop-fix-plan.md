# ETA / Next Stop Fix Plan

> Reference: [0011-eta-next-stop-bug-analysis.md](./0011-eta-next-stop-bug-analysis.md)

## 1. The Bug

The route detail page shows two contradictory next stops:

| Component | Shows | Source | Correct? |
|-----------|-------|--------|----------|
| **Hero card** (blue header) | Mundo Plaza @ 22:40 | `getNextStop()` — pure time comparison | Yes |
| **Schedule timeline** | CAAB @ 00:00, ~0 min | `computeEta()` / `inferStopProgress()` — GPS-based | No |

### Root Cause

Two functions pick the first **pending** stop sorted by time, regardless of whether that time is in the past:

- **`computeEta`** (`src/lib/tracking/eta.ts:39-42`):
  ```ts
  const sortedPending = [...pending].sort((a, b) => a.time.localeCompare(b.time));
  const nextStop = sortedPending[0]; // picks 00:00 even at 22:35
  ```

- **`inferStopProgress`** (`src/lib/tracking/infer-stop-progress.ts:130-136`):
  ```ts
  else if (stop.status === "pending" && nextStopId === null) {
    nextStopId = stop.schedule_entry_id; // same bug: first pending by time
  }
  ```

Both assume all stops before the "next" one have been physically geofenced through. With a full-day schedule (00:00–23:40) and tracking starting mid-day, all morning stops remain `"pending"`. The first pending stop by time is CAAB @ 00:00, ETA computes as 0 minutes.

### Data Flow of the Bug

```
inferStopProgress → route_run_stops (CAAB 00:00 = "pending", first in time order)
       ↓
computeEta reads route_run_stops → nextStopId = CAAB 00:00, ETA = 0 min
       ↓
GET /api/routes/[routeId] → progress.nextStopId = CAAB 00:00
       ↓
page.tsx:20 → nextStopId = progress.nextStopId (GPS takes priority over time-based)
       ↓
ScheduleTimeline → deriveTimelineStops (passedStopIds.length > 0 branch)
       ↓
CAAB 00:00 shown with blue pulsing dot and "~0 min"
```

Additionally, the hero card ETA only displays when `route.nextStop.id === progress.nextStopId` (page.tsx:101-102). Since they differ (Mundo Plaza vs CAAB), the hero card shows no ETA.

---

## 2. Solution Approaches Evaluated

### Approach A: Time-Aware Filtering in `computeEta` + `inferStopProgress`

Filter pending stops to only include those with `time >= now - threshold`.

- **Pros**: Minimal code change (3-5 lines each). Immediately fixes the bugs. No DB changes.
- **Cons**: Past-time stops remain `"pending"` in DB. Timeline shows untouched morning stops as `"future"` instead of `"past"`.
- **Effort**: Small (1-2 hours).

### Approach B: Auto-Skip Past-Time Stops in `inferStopProgress`

Mark stops as `"passed"` or `"skipped"` if their scheduled time is past and no GPS data arrived.

- **Pros**: Database always reflects reality. Timeline naturally correct.
- **Cons**: `"passed"` is semantically wrong for unvisited stops. `"skipped"` requires DB migration and UI changes.
- **Effort**: Medium (half day).

### Approach C: Hybrid Time + GPS Derivation in the UI

Change `deriveTimelineStops` to merge both data sources — use time-based past/future as baseline, overlay GPS data where available.

- **Pros**: No DB changes. Realistic timeline view. Graceful degradation.
- **Cons**: Presentation-layer only — must be combined with Approach A anyway.
- **Effort**: Small-Medium (2-4 hours).

### Approach D: "Start Route" Feature (Driver-Initiated Route Lifecycle)

Driver explicitly starts/ends their route. Only stops after start time are considered active.

- **Pros**: Most accurate real-world model. Opens door for shift analytics.
- **Cons**: Significant new feature. What if driver forgets? Needs fallback.
- **Effort**: Large (2-3 days). See Section 4 for details.

### Approach E: Time-Windowed Active Zone

Only consider stops within a time window around "now".

- **Pros**: Automatically ignores ancient stops. No new features needed.
- **Cons**: Window size needs tuning. Doesn't fix DB state.
- **Effort**: Small-Medium (2-4 hours).

---

## 3. Recommended Implementation Plan

### Phase 1: Immediate Bug Fix (Approach A + C)

Three targeted changes in one PR:

#### 1. Fix `computeEta` (`src/lib/tracking/eta.ts`)

Filter pending stops to only those whose scheduled time is >= current time:

```ts
const nowHHmm = now.toFormat("HH:mm");
const relevantPending = pending.filter(s => s.time >= nowHHmm);
// If all pending are in the past → treat as route complete
if (relevantPending.length === 0) {
  return { etaNextStopISO: null, etaNextStopMinutes: null, ... };
}
const nextStop = relevantPending.sort(...)[0];
```

#### 2. Fix `inferStopProgress` (`src/lib/tracking/infer-stop-progress.ts`)

Same time-aware filter when building the result:

```ts
const nowHHmm = nowBahia().toFormat("HH:mm");
// In the loop: only pick nextStopId from pending stops where time >= nowHHmm
```

#### 3. Improve `deriveTimelineStops` (`src/components/public/schedule-timeline.tsx`)

When GPS data exists, also use current time to classify un-geofenced past stops:

```
Stop classification:
- "past"    → GPS confirmed passed OR (time < now AND not in passedSet)
- "current" → inferredNextStopId AND time >= now
- "future"  → time > now AND not passed
```

This requires passing `now` (or `serverTime` from the API) into the component.

#### Edge Cases

| Scenario | Behavior After Fix |
|----------|-------------------|
| Van starts tracking late (e.g., 22:00 on a 00:00–23:40 route) | Morning stops = "past" (by time), next stop = correct upcoming one |
| Van stops tracking mid-day, resumes later | Gap stops treated as "past" by time filter |
| Route spans midnight (23:00 → 01:00) | Needs special handling for `time >= nowHHmm` comparison — use minutes-since-midnight with wraparound |
| No tracking data at all | `progress = null`, timeline uses pure time-based fallback (already works) |
| All stops geofenced (perfect run) | No change — already correct |

### Phase 2: "Start Route" Feature (Deferred)

See Section 4. This is a product feature, not a bug fix. Implement when:
- Multiple drivers start at different times
- Shift-level analytics are needed (trip duration, completion %)
- Public page needs "waiting to start" vs "in progress" vs "completed" states

---

## 4. "Start Route" Feature — Design Notes

### Architectural Decision

**The Expo tracker app stays single-purpose: GPS tracking only.**

All route management features (start route, end route, driver dashboard) live in the **web app**. Drivers open it in the browser like any other user (admins, superusers). Future options:
- Install as PWA from the browser
- Wrap in a WebView-based mobile app

This keeps the Expo app simple and avoids duplicating UI/logic across platforms.

### Feature Scope (When Implemented)

- **Web UI**: Driver-facing page to start/end their assigned route
- **Data model**: `route_runs.started_at`, `route_runs.ended_at` columns
- **API**: `POST /api/routes/[routeId]/start`, `POST /api/routes/[routeId]/end`
- **Inference**: Only consider stops where `time >= started_at` for progress tracking
- **Public page**: Show "waiting to start" state when route_run exists but `started_at` is null
- **Fallback**: If driver forgets to start, the Phase 1 time-aware filtering still works as a safety net

### Authentication Consideration

Drivers need some form of auth to access route management. Options:
- Simple PIN/code per van (lightweight, no account management)
- Supabase Auth with driver role (more robust, supports future features)
- Magic link / OTP to driver's phone number

This decision should be made when speccing the feature.

---

## 5. Priority Summary

| Priority | Action | Effort | Files |
|----------|--------|--------|-------|
| **P0** | Fix `computeEta` — time-aware next stop selection | Small | `src/lib/tracking/eta.ts` |
| **P0** | Fix `inferStopProgress` — time-aware nextStopId in result | Small | `src/lib/tracking/infer-stop-progress.ts` |
| **P1** | Improve `deriveTimelineStops` — hybrid time+GPS classification | Small | `src/components/public/schedule-timeline.tsx`, `page.tsx` |
| **P1** | Handle midnight wraparound edge case | Small | Same files as above |
| **P2** | "Start Route" web feature (deferred) | Large | New spec required |

Phase 1 (P0 + P1) should be one focused PR targeting `dev`.
