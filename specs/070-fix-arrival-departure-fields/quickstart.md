# Quickstart: Fix Arrival/Departure Time Field Usage

## Fix Map

All 7 fixes are single-field swaps. No logic changes, no new files, no migrations.

### Fix #1 — `getNextStop()` (HIGH)

**File**: `src/lib/time.ts:73`
**FR**: FR-001

```diff
- const entryTime = parseTime(entry.departureTime);
+ const entryTime = parseTime(entry.time);
```

### Fix #2a — Server geofence early arrival gate (MEDIUM)

**File**: `src/lib/tracking/infer-stop-progress.ts:199`
**FR**: FR-002

```diff
- const stopTime = stopDateTime(entry.departure_time);
+ const stopTime = stopDateTime(entry.arrival_time);
```

Note: The `entry` destructuring at line 177 includes `departure_time` but not `arrival_time`. Update the type to include `arrival_time`.

### Fix #2b — Device geofence early arrival gate (MEDIUM)

**File**: `src/lib/tracking/process-device-geofence-events.ts:225`
**FR**: FR-003

```diff
- const stopTime = stopDateTime(entry.departure_time);
+ const stopTime = stopDateTime(entry.arrival_time);
```

### Fix #3a — `isWithinScheduleWindow` end (MEDIUM)

**File**: `src/lib/time.ts:51`
**FR**: FR-004

```diff
- const last = parseTime(sorted[sorted.length - 1].arrival_time);
+ const last = parseTime(sorted[sorted.length - 1].departure_time);
```

### Fix #3b — `isPastScheduleWindow` (MEDIUM)

**File**: `src/lib/tracking/resolve-route-progress.ts:82`
**FR**: FR-005

```diff
- const lastTime = sortedEntries.length > 0 ? sortedEntries[sortedEntries.length - 1].arrival_time : null;
+ const lastTime = sortedEntries.length > 0 ? sortedEntries[sortedEntries.length - 1].departure_time : null;
```

### Fix #3c — Orphaned shift detection (MEDIUM)

**File**: `src/lib/tracking/resolve-route-progress.ts:390`
**FR**: FR-006

```diff
- const lastEntryTime = sortedEntries[sortedEntries.length - 1].arrival_time;
+ const lastEntryTime = sortedEntries[sortedEntries.length - 1].departure_time;
```

### Fix #4 — Driver API `isPastScheduleWindow` (MEDIUM)

**File**: `src/app/api/driver/routes/route.ts:123`
**FR**: FR-007

```diff
- const sortedTimes = sorted.map((e) => e.arrival_time);
+ const sortedTimes = sorted.map((e) => e.departure_time);
```

## Verification

After applying all fixes:

```bash
npx eslint .
npx tsc --noEmit
npx vitest run
npm run build
```

All must pass. Existing tests verify backward compatibility (FR-008 / SC-004).

## Test Validation on Test Server

The test server has manually-set distinct arrival/departure values. After deploying:

1. Check public route pages — verify correct "next stop" during dwell windows.
2. Check route status — verify routes don't prematurely show "ended" at the last stop.
3. Trigger geofence events — verify early arrival window rejects events correctly.
