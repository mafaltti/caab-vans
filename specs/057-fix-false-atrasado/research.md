# Research: Fix False "Atrasado" (Overdue) Status

**Branch**: `057-fix-false-atrasado` | **Date**: 2026-03-09

## No NEEDS CLARIFICATION Items

All technical context is already known from the codebase analysis. No unknowns to resolve.

## Decision Log

### D1: Fix location — backend only vs. frontend guard

- **Decision**: Fix in backend (`eta.ts`) only.
- **Rationale**: All 4 frontend components (`route-card.tsx`, `route-detail-peek.tsx`, `schedule-timeline.tsx`, `hero-card.tsx`) blindly trust `etaStatus`. Fixing at the source eliminates the bug for all consumers without duplicating guard logic in 4 places.
- **Alternatives considered**: Adding a schedule-time guard in each frontend component — rejected because it violates DRY (4 identical guards) and the constitution principle that computed fields belong in the BFF.

### D2: Guard condition — `scheduledTime <= now`

- **Decision**: Add `scheduledTime <= now` as an AND condition to the existing `etaDateTime <= now` check, where `scheduledTime` is derived from `now.set({ hour, minute })` using the parsed `nextStop.time` HH:mm value.
- **Rationale**: `nextStop.time` (HH:mm) is always available for pending stops. The guard ensures overdue is only reported when the scheduled time has actually passed. We use `now.set()` instead of `parseTime()` because `parseTime()` internally calls `nowBahia()` (system clock), which would make the guard non-deterministic in tests where `now` is injected at a different date.
- **Alternatives considered**:
  - Using `parseTime(nextStop.time) <= now` — rejected because `parseTime()` anchors to the real system date via `nowBahia()`, breaking time-frozen tests and introducing a subtle clock dependency.
  - Clamping ETA to `max(etaDateTime, scheduledTime)` — more complex, changes the ETA value itself rather than just the status, and could confuse downstream consumers.
  - Adding a tolerance buffer (e.g., 5 minutes after scheduled time) — over-engineering for YAGNI; the scheduled time boundary is the natural threshold.

### D4: Clamp fallback `etaNextStopMinutes` to zero

- **Decision**: Wrap both fallback estimated-path minute calculations with `Math.max(0, ...)`.
- **Rationale**: When the guard prevents false overdue (scheduled time still in the future but computed ETA is in the past), the estimated path returns a negative `etaNextStopMinutes`. The GPS branch already clamps with `Math.max(0, ...)` (line 218); applying the same pattern to segment and schedule fallbacks ensures the UI never renders negative minutes.

### D3: Apply guard to schedule fallback too

- **Decision**: Apply the same `scheduledTime <= now` guard to the schedule fallback path (line 333).
- **Rationale**: Although the schedule fallback is less likely to false-positive (it's anchored to schedule + delay), a negative delay (early van) could still push the ETA into the past while the scheduled time hasn't arrived. Consistency across both fallback paths.
- **Alternatives considered**: Leaving the schedule fallback unchanged — rejected for robustness and consistency.
