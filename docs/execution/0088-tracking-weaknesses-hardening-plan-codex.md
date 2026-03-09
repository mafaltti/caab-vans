## Tracking Weaknesses Hardening Plan

### Summary
Implement five changes to close the remaining correctness and consistency gaps in the tracking system:

- auto-close orphaned active shifts with a repo-owned reconciliation script
- make stop-passage confidence deterministic and computed from one ordered evidence set per inference pass
- stop returning misleading `0 min` ETA from degraded fallback branches
- make snapped confidence monotonic and explicitly evidence-based
- fully wire `includeLastKnown=true` through the top-level route summary

This plan adds two public API fields and no schema changes.

### Key Changes

#### 1. Orphaned active shift reconciliation
- Add a repo-owned script `scripts/reconcile-orphaned-shifts.ts` and an npm script entry such as `tracking:reconcile-shifts`.
- The script will close active `route_shifts` when all conditions are true:
  - `ended_at IS NULL`
  - the route run is past its scheduled end by at least **90 minutes**
  - the run has had no activity for at least **30 minutes**
- Define `lastActivityAt` as `GREATEST(vans.last_gps_fix_at, route_runs.progress_updated_at, route_shifts.started_at)`.
- Determine scheduled end from `route_runs.service_date` plus the route’s last `schedule_entries.time` in `America/Bahia`.
- Set `route_shifts.ended_at = now()` for matching rows and emit structured JSON logs with closed shift ids and counts.
- Support `DRY_RUN=1` so ops can inspect would-close candidates before enabling the cron.
- Document scheduling the script every **5 minutes** in `docs/OPERATIONS.md` using the supported host-level cron/systemd timer approach.
- Do not mutate read paths to “pretend close” orphaned shifts; fix the underlying data instead.

#### 2. Deterministic confidence evidence in stop inference
- Refactor `inferStopProgress()` so recent ping evidence is fetched **once per invocation**, before group matching, not once per stop group.
- Query recent evidence from `van_location_pings` using:
  - `device_ts >= now - 5 minutes`
  - explicit `order("device_ts", { ascending: false })`
  - no arbitrary `limit(50)` cap
- Reuse that ordered evidence set for every candidate stop in the inference pass.
- Keep `CONFIDENCE_PING_WINDOW_MINUTES = 5`.
- Backfill gating stays confidence-based only; no gap-based bypass.
- Preserve existing backfill confidence scaling by gap:
  - `gap <= 1 => 0.7`
  - `gap <= 3 => 0.5`
  - else `0.3`

#### 3. Monotonic snapped/raw confidence scoring
- Replace the current raw/snapped confidence branches with a deterministic score table:
  - Raw match:
    - current raw ping inside geofence, fewer than 2 confirming recent raw pings: `0.70`
    - current raw ping inside geofence, 2+ confirming recent raw pings: `0.90`
  - Snapped match:
    - snapped inside geofence, raw outside geofence: `0.65`
    - snapped inside geofence, raw also inside geofence: `0.85`
    - if 2+ confirming recent raw pings, add `+0.10`, capped at `0.95`
    - if snap displacement is `<= 15m`, add `+0.05`, capped at `0.95`
- Keep `pass_source` as the coordinate source actually used for the passage decision.
- Treat `pass_confidence` as confidence in the passage event, not as a statement that raw and snapped evidence are equally sourced.
- Use the existing per-stop snapped/raw comparison logic, but retain the current `50m` snap-eligibility threshold.

#### 4. Degraded ETA overdue semantics
- Extend `RouteProgress` with `etaStatus: "estimated" | "overdue" | "none"`.
- Compute `etaStatus` inside `computeEta()`:
  - `estimated` when a usable ETA exists
  - `overdue` when `nextStopId` exists but a `segment` or `schedule` prediction is already in the past
  - `none` when there is no next stop / no ETA target
- For `segment` and `schedule` branches only:
  - if predicted arrival `<= now` and the stop is still pending, return:
    - `etaStatus = "overdue"`
    - `etaNextStopMinutes = null`
    - `etaNextStopISO = predicted past ISO timestamp`
    - keep `etaSource` as the branch that produced the overdue prediction
- Keep GPS ETA behavior unchanged:
  - `0 min` remains valid when the van is effectively at the stop
- Preserve the current accumulated-distance segment fallback, including multi-segment accumulation from last passed stop to target.

#### 5. Complete `includeLastKnown` top-level summary behavior
- Extend route response types with `nextStopMode: "live" | "last_known" | null`.
- In both public route APIs:
  - when `isRunning === true`, behavior stays the same and `nextStopMode = "live"`
  - when `includeLastKnown=true`, `isRunning === false`, and `progress.nextStopId` resolves to a schedule entry:
    - populate top-level `nextStop`
    - populate `currentStopIndex`
    - set `nextStopMode = "last_known"`
  - otherwise keep top-level summary nulls and `nextStopMode = null`
- Prefer `progress.nextStopId` for last-known summary resolution; do not run schedule-time `getNextStop()` for non-running routes.
- Keep `isRunning` semantics unchanged: it remains tied to `runStatus === "in_progress"`.

### Public API / Type Changes
- Add to `RouteProgress`:
  - `etaStatus: "estimated" | "overdue" | "none"`
- Add to `RouteWithStatus` and route detail/list payloads:
  - `nextStopMode: "live" | "last_known" | null`
- Behavioral contract updates:
  - `etaNextStopMinutes` may now be `null` while `nextStopId` is still present when `etaStatus = "overdue"`
  - top-level `nextStop/currentStopIndex` may be populated for non-running routes when `includeLastKnown=true` and `nextStopMode = "last_known"`

### Test Plan
- Add inference tests covering:
  - >50 recent pings in the 5-minute window still produce deterministic confidence
  - recent ping evidence is fetched once and reused across groups
  - snapped confidence increases monotonically with stronger evidence
  - backfill only happens for `pass_confidence > 0.7`
- Add ETA tests covering:
  - accumulated segment fallback still works across multiple intermediate stops
  - overdue `segment` fallback returns `etaStatus = "overdue"` and `etaNextStopMinutes = null`
  - overdue `schedule` fallback returns `etaStatus = "overdue"` and `etaNextStopMinutes = null`
  - GPS branch still allows valid `0 min` ETA at the stop
- Add route API tests covering:
  - `includeLastKnown=true` populates top-level `nextStop/currentStopIndex`
  - `nextStopMode = "last_known"` for non-running routes with persisted progress
  - `nextStopMode = "live"` for active routes
  - top-level summary remains null when last-known data is unavailable
- Add reconciliation tests covering:
  - orphaned shift closes when past end + inactivity thresholds are met
  - active delayed route with fresh GPS/progress is not auto-closed
  - `DRY_RUN=1` reports candidates without mutating data

### Assumptions And Defaults
- Supported scheduling mechanism is a **repo-owned host cron/systemd timer**, not `pg_cron`.
- Reconciliation thresholds:
  - past scheduled end grace: **90 minutes**
  - inactivity threshold: **30 minutes**
  - schedule frequency: **every 5 minutes**
- Canonical timezone remains `America/Bahia`.
- No schema changes are required for this plan.
- Midnight-crossing schedules remain out of scope; reconciliation uses the existing same-day schedule model already documented in the repo.
