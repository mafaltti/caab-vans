# Research: Fix Cold-Start Confirmed Stop

## Root Cause Analysis

### Decision: The confirmed stop must be included in the bulk-mark operation

**Rationale**: The confirm-start-stop endpoint filters stops with `seq < confirmedStopSequence`, excluding the confirmed stop itself. Since the only stop progression mechanism is device geofence events (which require an outside-to-inside transition), a van already inside the geofence will never trigger an enter event. The confirmed stop remains `pending` indefinitely, blocking the head-of-line guard for all subsequent stops.

**Alternatives considered**:

1. **Fire a synthetic geofence event for the confirmed stop** — Rejected. Adds complexity and a new code path. The confirm-start-stop endpoint already writes to `route_run_stops`, so it's simpler to include the confirmed stop there.

2. **Add a separate "departure detected" mechanism** — Rejected. Would require GPS-based departure detection (e.g., distance > geofence radius from confirmed stop). Over-engineered for this problem. YAGNI.

3. **Re-enable server-side `inferStopProgress`** — Rejected. This function was removed from the tracking pipeline in spec 065 (tracking simplification). Re-adding it contradicts the simplification goal.

## Idempotency Guard Update

### Decision: Detect retry by checking confirmed stop's passed status

**Rationale**: After the fix, `next_stop_id` no longer equals the confirmed `stopId` (it points to the stop after). The idempotency check must use a different signal. Checking `targetStop.status === 'passed' && targetStop.pass_source === 'manual'` combined with all passed stops being manual reliably detects a cold-start retry without conflicting with geofence-progressed routes.

**Alternatives considered**:

1. **Store a `cold_start_confirmed_stop_id` on route_runs** — Rejected. New column for a single idempotency check. YAGNI.
2. **Use `last_passed_stop_id === stopId`** — Viable but requires selecting `last_passed_stop_id` from route_runs. The target stop's own status is already available from the existing query.

## Scope Confirmation

No new database migrations, no new dependencies, no UI changes. The fix is isolated to `confirm-start-stop/route.ts` and its tests.
