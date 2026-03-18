# Quickstart: GPS Corroboration Gate

**Feature**: 077-geofence-corroboration
**Date**: 2026-03-18

## What This Feature Does

Changes device geofence stop advancement from "immediate mark as passed" to "wait for GPS confirmation within 50m, with a 30-second staleness fallback."

## Files to Modify

### Core Logic (server-side)

1. **`src/lib/tracking/process-device-geofence-events.ts`**
   - `processOneEvent()`: Change the flow after stop matching (currently lines 294–369). Instead of immediately marking the stop as "passed", set the event status to `"awaiting_corroboration"` and populate `matched_run_id` + `matched_schedule_entry_id`. Skip the stop update and prefix persistence.
   - Exception: If no GPS stream exists (FR-013), fall back immediately.

2. **NEW: `src/lib/tracking/evaluate-pending-corroborations.ts`**
   - New function `evaluatePendingCorroborations({ supabase, vanId, pingLat, pingLng, pingReceivedAt })`
   - Query all `"awaiting_corroboration"` events for this van
   - For each: check haversine distance from ping to matched stop
   - If ≤ `geofence_radius_m`: confirm (0.95 confidence)
   - If stale (no ping since `received_at` + 30s): fallback confirm (0.90)
   - Respect contiguous-prefix rule
   - Call `persistCanonicalProgress()` after any confirmations

3. **`src/app/api/tracking/[vanId]/route.ts`**
   - Add call to `evaluatePendingCorroborations()` AFTER ping upsert and position update, BEFORE response building
   - Pass current ping coordinates and server timestamp

4. **`src/lib/tracking/append-geofence-response.ts`** (inline in route.ts)
   - Ensure `"awaiting_corroboration"` events are NOT included in `processedEventIds`

### Migration

5. **NEW: `supabase/migrations/00022_awaiting_corroboration_status.sql`**
   - Drop + recreate CHECK constraint on `tracking_geofence_events.status` to add `'awaiting_corroboration'`

### Tests

6. **`src/__tests__/tracking/process-device-geofence-events.test.ts`**
   - Update existing tests: events now go to `"awaiting_corroboration"` instead of `"matched"`
   - Add test: event transitions to awaiting when GPS is >50m
   - Add test: immediate fallback when no GPS stream exists

7. **NEW: `src/__tests__/tracking/evaluate-pending-corroborations.test.ts`**
   - GPS ping within 50m → confirms at 0.95
   - GPS ping >50m → stays awaiting
   - Staleness fallback at 30s → confirms at 0.90
   - No GPS stream → confirms at 0.85
   - Contiguous-prefix respected
   - Multiple awaiting events evaluated in one pass
   - Shift-end expiry

8. **`src/__tests__/tracking/append-geofence-response.test.ts`**
   - Add test: `"awaiting_corroboration"` events excluded from `processedEventIds`

## No Device-Side Changes

The tracker app is unmodified. It continues to buffer geofence events and resubmit unacknowledged ones on each ping — this natural retry mechanism drives the corroboration loop.

## Key Constants

- Corroboration radius: `geofence_radius_m` (50m default, per-stop override)
- Staleness threshold: 30 seconds (from `received_at` of the event)
- Confidence: 0.95 (GPS corroborated), 0.90 (staleness fallback), 0.85 (no GPS stream)
