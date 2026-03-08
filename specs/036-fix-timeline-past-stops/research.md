# Research: Fix Timeline Past Stops

**Date**: 2026-03-04
**Status**: Complete — no unknowns remain

## Root Cause Analysis

### Decision: Use schedule order (index) as the primary classification boundary in hybrid mode

**Rationale**: The `deriveTimelineStops()` function has a hybrid mode that activates when GPS tracking data (`passedStopIds`) is available. The current logic marks a stop as "past" if it's GPS-confirmed OR if `entry.time < serverTime`. The time-based fallback was intended to catch un-geofenced stops that the van has likely already passed. However, it doesn't account for schedule order — when the van is late, stops *after* the current next stop also have `time < serverTime` and get incorrectly classified as "past".

**Fix approach**: When `inferredNextStopId` is known, find its index in the schedule array. Use this index as the classification boundary:
- Stops at index < currentIdx → "past" (schedule order)
- Stop at currentIdx → "current"
- Stops at index > currentIdx → "future"
- GPS-confirmed stops → always "past" (regardless of position)
- Fallback to time-based only when `inferredNextStopId` is absent

**Alternatives considered**:

| Alternative | Why Rejected |
|-------------|--------------|
| Remove time-based fallback entirely | Would break classification for un-geofenced stops before the current stop when GPS is spotty |
| Add `time >= serverTime` guard to exclude future stops | Fragile — doesn't handle edge cases where stop times aren't strictly monotonic |
| Move classification to the API (BFF) | Over-engineering for a client-side display bug; constitution says computed fields go in BFF, but this is purely UI presentation logic |

## Existing Test Gap

The test "classifies un-geofenced past-time stops as past (hybrid)" validates time-based fallback but only for stops genuinely before the current stop. No test covers the scenario where stops after the current stop have times before `serverTime` (late van).

**New test needed**: Schedule with 5+ stops, van late by multiple stops (inferredNextStopId is early in schedule, serverTime is past several subsequent stops). Assert stops after current are "future", not "past".

## Existing Test Compatibility

All 6 existing tests pass with the proposed fix (verified by mental walkthrough against new logic). The index-based boundary produces identical results for all existing test scenarios because none of them have stops after the current stop with times before `serverTime`.
