# Research: Fix Geofence Duplicate Stop Passing

**Feature**: `023-fix-geofence-dedup`
**Date**: 2026-03-02

## R1: Current Geofence Logic and the Bug

**Decision**: The bug is in `inferStopProgress` (step 6) — the `for` loop iterates over ALL pending stops and marks every one within the geofence radius. For repeated locations (same lat/lng at different schedule times), all occurrences match simultaneously.

**Rationale**: The loop has no `break` and no coordinate-deduplication guard. When a van is at CAAB and CAAB appears 3 times in the schedule, all 3 pending entries have the same `stop_lat`/`stop_lng` and all pass the distance check.

**Alternatives considered**:
- Breaking on first match per coordinate group — simple but doesn't handle the time window guard.
- Tracking "already matched coordinates" in a Set — adds unnecessary state.

## R2: Fix Approach — First-Pending-Only + Time Window

**Decision**: Modify the geofence loop to track which coordinates have already been matched in this ping, and only mark the first pending occurrence. Additionally, skip any stop whose scheduled time is more than 30 minutes in the future.

**Rationale**:
- "First pending by schedule order" is the natural behavior users expect — the loop already iterates in time-ascending order.
- The 30-minute time window guard (FR-006) prevents premature marking when a van parks at a repeated stop between trips.
- Both guards can be implemented in the same loop iteration with minimal code change.

**Alternatives considered**:
- Database-level constraint (trigger/check) — over-engineered for this, violates KISS.
- Separate dedup pass after geofence check — two passes over the same data is unnecessary.

## R3: Time Window Implementation

**Decision**: Use Luxon's `parseTime()` to convert the stop's `HH:mm` time to a DateTime, then check `now >= stopTime.minus({ minutes: 30 })`. This reuses existing time utilities.

**Rationale**: `parseTime()` already handles Bahia timezone and today's date. The 30-minute window is a configurable constant (`EARLY_ARRIVAL_WINDOW_MINUTES`).

**Alternatives considered**:
- String-based time comparison — fragile around midnight boundaries.
- Minute-of-day arithmetic — reinvents what Luxon already provides.

## R4: Test Strategy

**Decision**: Add unit tests for `inferStopProgress` covering:
1. Single-occurrence stop (regression — must still work)
2. Repeated stop — only first pending marked
3. Time window guard — stop too far in the future is skipped
4. Sequential visits — second visit marks second occurrence

**Rationale**: The existing test file (`src/__tests__/tracking/infer-stop-progress.test.ts`) only tests the haversine function. The main `inferStopProgress` function has no tests, which is why this bug wasn't caught. Tests will need to mock the Supabase client.

**Alternatives considered**:
- Integration tests against real DB — slower and harder to set up for CI; unit tests with mocked Supabase are sufficient for this logic.
