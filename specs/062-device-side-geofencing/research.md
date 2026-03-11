# Research: Device-Side Geofencing

**Date**: 2026-03-11
**Feature**: 062-device-side-geofencing
**Source**: `docs/execution/0106-device-side-geofencing-complete-analysis.md` (977 lines, 4 external review rounds)

All architectural decisions were resolved during the analysis phase. This document records the final decisions and rationale.

---

## R1: Expo Geofencing API Compatibility

**Decision**: Use `expo-location` `startGeofencingAsync()` with `expo-task-manager` geofence task.

**Rationale**: Already available in SDK 55 (~55.1.2), requires no new permissions (`ACCESS_BACKGROUND_LOCATION` already granted), no new native dependencies, runs in parallel with existing `startLocationUpdatesAsync()` (separate `TaskConsumer` classes on Android).

**Limitations accepted**:
- Callback provides only `eventType` + `region` — no GPS fix at trigger time. Server resolves coordinates via `placeId`.
- Does NOT survive full app termination (Expo uses broadcast PendingIntent, not service PendingIntent). Covers "foreground service killed but app alive" only.
- PR #20571 (killed-app fix) was closed without merging on 2026-02-10.
- Must re-register after device reboot (boot recovery handles this).

**Alternatives considered**:
- Custom native module to expose `GeofencingEvent.getTriggeringLocation()` — rejected (adds native dependency, violates constraint).
- Dedicated geofence endpoint instead of piggybacking — rejected (adds extra API call, wastes rate limit budget).

---

## R2: Processing Architecture

**Decision**: Dedicated `processDeviceGeofenceEvents()` helper in a new file, called from `route.ts` BEFORE ping dedup. `inferStopProgress()` is NOT modified.

**Rationale**: `inferStopProgress()` is already 454 lines with 3+ responsibilities. Adding device event processing would increase coupling and complexity. Two separate code paths with clear ownership is simpler to test and maintain.

**Alternatives considered**:
- Adding device event logic to `inferStopProgress()` — rejected (too large, mixed concerns).
- Dedicated endpoint `POST /api/tracking/{vanId}/geofence-events` — rejected (adds extra API call, but cleaner separation; may revisit if batch endpoint needs geofence support).

---

## R3: Idempotency and Event Ledger

**Decision**: `tracking_geofence_events` table with `UNIQUE (van_id, event_id)` constraint. `INSERT ... ON CONFLICT DO NOTHING` preserves prior outcomes. Retries check existing row state and re-process when appropriate.

**Rationale**: Without a durable ledger, eventId-based idempotency is meaningless. Retries after response loss would double-apply or fail to ack. The ledger also serves as an audit trail.

**Re-processing rules** (resolved in review round 4):
- `status='matched'` + stop still `passed` → skip (already resolved)
- `status='matched'` + stop healed to `pending` → RE-PROCESS (chain may have reconnected)
- `status='received'` (partial failure) → RE-PROCESS
- `status='no_match'` → skip (conditions unchanged within same request)

---

## R4: Canonical Healing and Device Events

**Decision**: Device events participate in normal canonical healing (no exemption). Gap-1 backfill + retry mechanism handles non-contiguous stops.

**Rationale**: `resolve-route-progress.ts` (lines 148-161) independently computes a contiguous prefix with zero `pass_source` awareness. Exempting `device_geofence` from healing in `enforce-canonical-prefix.ts` would NOT prevent the other code path from demoting the same rows — creating inconsistency.

**Alternatives considered**:
- Exempt `device_geofence` from canonical healing — rejected (dual demotion paths cause inconsistency).
- Add `pass_source` awareness to `resolve-route-progress.ts` — rejected (unnecessary coupling, broader change).

---

## R5: Post-Healing Acknowledgment

**Decision**: `processedEventIds` computed in `route.ts` step 7 AFTER canonical healing, by verifying matched stops still have `passed` status. Unconfirmed events stay buffered on device.

**Rationale**: The helper returns `tentativeMatchIds[]` which may be reverted by healing. Acking before healing would cause event loss — the device clears its buffer but the stop reverts to pending with no retry.

---

## R6: Confidence Scoring

**Decision**: Tiered: 0.90 base + 0.05 if recent GPS ping corroborates position. Cap at 0.95.

**Rationale**: `enteredAt` is callback-delivery time, not exact transition time. Android background geofence delivery latency is 2-6 minutes. With repeated places (Mundo Plaza at 13:50 and 14:30, 40-min gap), flat 0.95 is too aggressive — delivery lag can blur closest-in-time match.

---

## R7: Duplicate Ping Flow

**Decision**: Duplicate pings with geofence events do NOT return early. Steps 4-6 (OSRM snap, position update, GPS inference) are skipped, but step 7 (processedEventIds) runs. Pure-GPS duplicate pings retain existing early return.

**Rationale**: Without this, events on duplicate pings would never produce `processedEventIds`, leaving them stuck in the device buffer forever.

---

## R8: Device-Side Radius

**Decision**: 150m for device-side OS geofencing. 50m server-side unchanged.

**Rationale**: Android OS geofencing uses cell/WiFi positioning (~100-150m accuracy). At 50km/h, van spends ~22s in 150m radius. Minimum inter-stop distance is 371m (Rota 03), leaving 71m gap — no overlap. Server-side 50m is appropriate for high-accuracy GPS readings.

---

## R9: Migration Conventions

**Decision**: Next migration file is `00015_device_side_geofencing.sql`. Uses existing project conventions.

**Findings**:
- `set_updated_at()` function already exists (migration 00001)
- `pass_source` uses inline CHECK constraint with IN list
- `schedule_entries` has `created_at` but no `updated_at` column
- Migration naming: `NNNNN_kebab-case-description.sql`
- Comment style: 1-3 line descriptive comments at top
