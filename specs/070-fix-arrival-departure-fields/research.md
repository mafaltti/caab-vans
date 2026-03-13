# Research: Fix Arrival/Departure Time Field Usage

**Date**: 2026-03-13
**Source**: `docs/execution/0114-arrival-departure-time-handling-analysis.md`

## No Open Unknowns

All technical questions were resolved during the analysis phase. The analysis document provides exact file locations, line numbers, current code, and required fixes — all verified against the current codebase on 2026-03-13.

## Key Decisions

### Decision 1: Fix `getNextStop()` field name

- **Decision**: Use `entry.time` (not `entry.arrivalTime` or `entry.departureTime`)
- **Rationale**: The function's type signature uses `time` as the field name for arrival time. The analysis doc originally said "should use `arrivalTime`" but the actual field in the type is `time`.
- **Alternatives considered**: Renaming the type field to `arrivalTime` — rejected because it would expand scope beyond the bug fix and require updating all callers.

### Decision 2: No schema or migration changes

- **Decision**: All fixes are application-level field swaps only.
- **Rationale**: The database schema already has both `arrival_time` and `departure_time` columns (added in migration `00016_schedule_time_split.sql`). The bug is purely in which field the application code reads.
- **Alternatives considered**: None — this is the only correct approach.

### Decision 3: Test strategy — add distinct-time test cases

- **Decision**: Add new test cases with distinct arrival/departure values to existing test files. Do not modify existing tests.
- **Rationale**: Existing tests use `arrival_time === departure_time` and correctly verify current behavior for that case. New tests with distinct values (e.g., 15-minute dwell) will cover the fixed logic paths. This satisfies both SC-004 (existing tests pass) and SC-005 (new coverage).
- **Alternatives considered**: Modifying existing test fixtures to use distinct times — rejected because it would break the backward-compatibility verification (SC-004).

### Decision 4: Data state verification

- **Decision**: Dev database confirmed to have identical arrival/departure times (154/154 rows). Test server has manually-set distinct values.
- **Rationale**: Verified via direct database query on 2026-03-13. The bugs are dormant in dev but observable on the test server.

## Test Files to Update

| Fix | Test File | Exists |
|-----|-----------|--------|
| #1 (getNextStop) | `src/__tests__/lib/time.test.ts` or inline | Needs check |
| #2a (infer-stop-progress early gate) | `src/__tests__/tracking/infer-stop-progress.test.ts` | Yes |
| #2b (device geofence early gate) | `src/__tests__/tracking/process-device-geofence-events.test.ts` | Yes |
| #3a (isWithinScheduleWindow) | `src/__tests__/lib/time.test.ts` or inline | Needs check |
| #3b (isPastScheduleWindow) | `src/__tests__/tracking/resolve-route-progress.test.ts` | Yes |
| #3c (orphaned shift) | `src/__tests__/tracking/resolve-route-progress.test.ts` | Yes |
| #4 (driver routes isPastScheduleWindow) | No dedicated test file | Needs creation or skip |
