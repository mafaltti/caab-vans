# Research: Fix Tracking Freshness Check

## R1: Freshness threshold value

**Decision**: 10 minutes (600 seconds)

**Rationale**: The Expo tracker app sends GPS pings approximately every 30 seconds. A 10-minute threshold provides generous buffer (~20 missed pings) for connectivity gaps, app backgrounding, or brief network outages, while still marking inactive vans as stale within a reasonable timeframe for passengers.

**Alternatives considered**:
- 5 minutes: Too aggressive — a brief tunnel or poor signal area could cause false negatives.
- 15 minutes: Too lenient — passengers would see stale data for too long after a van actually stops.
- 30 minutes: Far too lenient for real-time tracking use case.

## R2: Recency check implementation approach

**Decision**: Replace `isSameDay(dt)` with `isLocationFresh(dt)` that computes `now.diff(dt, 'minutes').minutes` and checks against the threshold constant.

**Rationale**: Luxon's `diff()` handles timezone-aware arithmetic correctly, including midnight boundaries and DST transitions. This is simpler and more accurate than calendar-day comparison.

**Alternatives considered**:
- Raw timestamp subtraction (`Date.now() - timestamp`): Works but mixes Luxon and native Date, inconsistent with project conventions (constitution V: all date/time ops use Luxon).
- Database-level age check (e.g., `WHERE location_updated_at > now() - interval '10 minutes'`): Would require changing the Supabase query structure. Over-engineering for this use case since we already fetch `location_updated_at` and compute in BFF.

## R3: What happens to the old `isSameDay` function

**Decision**: Remove `isSameDay` from `src/lib/time.ts` since it has no other callers.

**Rationale**: Grep confirms `isSameDay` is only imported by the two route handlers being updated. Keeping dead code violates KISS. If needed in the future, it can be re-added.

## R4: Threshold as constant vs configuration

**Decision**: Export a named constant (`STALENESS_THRESHOLD_MINUTES = 10`) from `src/lib/time.ts`.

**Rationale**: Per constitution I (YAGNI), no UI or database configuration is needed. A code constant is sufficient and can be changed in one place if the threshold needs tuning. Both API routes import from the same module, satisfying DRY.
