# Research: Fix ETA & Next Stop Time-Awareness

**Feature**: 019-fix-eta-next-stop
**Date**: 2026-03-01

## Decision 1: Time Comparison Strategy for "HH:mm" Strings

**Decision**: Compare `HH:mm` strings directly via `>=` / `<` string comparison for same-day routes. For midnight wraparound, convert to minutes-since-midnight and apply a threshold-based heuristic.

**Rationale**: `HH:mm` strings sort lexicographically in the same order as chronologically (e.g., `"08:00" < "22:00"`). This already works for the vast majority of CAAB routes which operate within a single day. For midnight-spanning routes, a simple heuristic treats any stop time more than 12 hours behind current time as "tomorrow" (i.e., in the future).

**Alternatives considered**:
- **Full DateTime comparison**: Convert every `HH:mm` to a Luxon DateTime via `parseTime()` and compare. More precise but unnecessary overhead — `parseTime` always sets today's date, so midnight wraparound still needs special handling. Also creates many DateTime objects per call.
- **Minutes-since-midnight everywhere**: Convert all times to integers (e.g., `"22:35"` → `1355`). Clean but requires converting all HH:mm strings, adding code for a marginal edge case.

**Conclusion**: Use string comparison (`time >= nowHHmm`) as the primary filter, matching the existing code patterns. Add a defensive guard for midnight wraparound only if current routes actually span midnight (they don't — CAAB routes run 00:00–23:40 within one day).

## Decision 2: Where to Inject Current Time

**Decision**: Each function receives current time through its existing parameter convention:
- `computeEta` already receives `now: DateTime` — derive `HH:mm` from it.
- `inferStopProgress` uses `nowBahia()` internally — derive `HH:mm` from it.
- `deriveTimelineStops` will receive `serverTime: string` (HH:mm) as a new parameter.

**Rationale**: Follows KISS. No new time-passing infrastructure. The API already returns `serverTime` in the response. The page component already has access to it via `data.serverTime`.

**Alternatives considered**:
- **Shared time context/provider**: Unnecessary indirection for 3 call sites.
- **Pass DateTime to all functions**: Would require changing `deriveTimelineStops` to accept a Luxon DateTime in a client component, pulling in Luxon client-side. Unnecessary — `HH:mm` string comparison is sufficient.

## Decision 3: DB State vs. Read-Time Filtering

**Decision**: Filter at read time. Do not mutate DB state for past-time pending stops.

**Rationale**: Simpler (no migration, no new status value). The "pending" status in DB is technically correct — the van didn't visit those stops. The time-aware filter at read time correctly classifies them for display and ETA purposes. This matches Approach A from the fix plan (0012).

**Alternatives considered**:
- **Approach B (auto-mark as "skipped")**: Requires DB migration, new status enum value, UI changes for "skipped" styling. Over-engineered for the current need.
- **Approach D ("Start Route" feature)**: Correct long-term but deferred — it's a product feature, not a bug fix.

## Decision 4: Timeline Classification Logic

**Decision**: When GPS data exists (`passedStopIds.length > 0`), classify stops using hybrid logic:
- "past" if in `passedSet` (GPS confirmed) OR `stop.time < serverTime` (time-based)
- "current" if `stop.id === inferredNextStopId` (from time-aware `inferStopProgress`)
- "future" otherwise

**Rationale**: This merges both data sources cleanly. GPS data is authoritative where available; time fills in for un-geofenced past stops. The `inferredNextStopId` is now guaranteed to be time-aware (after fixing `inferStopProgress`), so the "current" check is correct.

**Alternatives considered**:
- **Time-only classification (ignore GPS)**: Loses the value of GPS geofencing data.
- **GPS-only classification (current behavior)**: The bug. Un-geofenced past stops are misclassified.
