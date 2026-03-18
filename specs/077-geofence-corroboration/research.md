# Research: GPS Corroboration Gate

**Feature**: 077-geofence-corroboration
**Date**: 2026-03-18

## Decision 1: New Event Status vs. Reusing "deferred"

**Decision**: Add a new `"awaiting_corroboration"` status to `tracking_geofence_events.status`.

**Rationale**: The existing `"deferred"` status has specific semantics — it means the event matched a stop but is blocked by the contiguous-prefix guard (an earlier stop is still pending). Corroboration waiting is a fundamentally different lifecycle phase: the event matched and IS head-of-line, but needs GPS confirmation. Overloading "deferred" would break `replayDeferredEvents()` which specifically re-evaluates contiguous-prefix ordering, not GPS proximity.

**Alternatives considered**:
- Reuse "deferred" with a flag column → Adds ambiguity to the existing cascade logic; `replayDeferredEvents()` would need to distinguish two unrelated reasons for deferral.
- In-memory only (no DB status) → Loses state across server restarts and across requests; staleness fallback needs the receipt timestamp persisted.

## Decision 2: Where to Hook Corroboration Evaluation

**Decision**: Add a new function `evaluatePendingCorroborations()` called from the tracking API route (`POST /api/tracking/[vanId]`) AFTER the ping is upserted and position updated, but BEFORE the response is built.

**Rationale**: The corroboration check needs the CURRENT ping's position (just upserted) to evaluate distance. Geofence events are already processed earlier in the flow (before ping upsert) and set to `"awaiting_corroboration"`. The evaluation runs on every ping, checking all awaiting events for this van.

**Alternatives considered**:
- Hook into `persistCanonicalProgress()` → Wrong layer; that function enforces prefix invariants, not geofence matching logic.
- Hook into `processDeviceGeofenceEvents()` → Circular; the current ping hasn't been upserted yet when geofence events are processed.

## Decision 3: Staleness Detection Method

**Decision**: Compare `tracking_geofence_events.received_at` (server timestamp) against the current server time. If `now() - received_at >= 30s` AND no GPS ping has been received for this van since the event's `received_at`, the event is stale.

**Rationale**: Using server-side `received_at` avoids device clock skew (FR-012). The 30-second threshold covers ~6x the typical 5-second ping interval, accommodating background-mode gaps. Checking `vans.location_updated_at` or querying `van_location_pings.received_at` gives the authoritative last-ping-received time.

**Alternatives considered**:
- Use `vans.last_gps_fix_at` → This is device_ts, not server receipt time; subject to clock skew.
- Fixed timeout without liveness check → Would trigger even when GPS pings are actively arriving but show van >50m away.

## Decision 4: Staleness Evaluation Timing

**Decision**: Staleness fallback is evaluated inside `evaluatePendingCorroborations()` which runs on every incoming request (GPS ping or geofence-only). For the case where GPS is completely unavailable (FR-013), staleness is also checked when the geofence event first arrives in `processOneEvent()` — if no GPS ping has ever been received for this van in the current run, the event falls back immediately.

**Rationale**: The system is request-driven; there's no background process to trigger the fallback. When GPS is dead, the tracker still sends geofence events (they're buffered on-device). These arrive via the tracking endpoint, triggering the evaluation.

**Alternatives considered**:
- Only evaluate staleness in `processOneEvent()` → Misses the case where GPS was alive when the event arrived but dies afterward. Need the per-ping evaluation too.

## Decision 5: Confidence Scoring

**Decision**: Three confidence tiers for device geofence events:
- **0.95**: GPS-corroborated (ping within `geofence_radius_m`)
- **0.90**: Staleness fallback (GPS was alive but died; have some recent pings)
- **0.85**: No GPS stream fallback (never had GPS data in this run)

**Rationale**: Mirrors the existing tiered model (0.90/0.95) but adds a lower tier for the weakest evidence. GPS-corroborated is the highest confidence because both signals agree. Staleness fallback retains the current 0.90 baseline (same confidence as today's immediate match). No-GPS is lowest because there's zero corroborating evidence.

**Alternatives considered**:
- Binary 0.90/0.95 only → Doesn't distinguish the no-GPS case from the GPS-was-alive-but-died case.

## Decision 6: Response Handling for Awaiting Events

**Decision**: Events in `"awaiting_corroboration"` status are NOT included in `processedEventIds`. The device retains them and resubmits on the next ping.

**Rationale**: The device only clears events from its buffer when they appear in `processedEventIds`. By not acknowledging awaiting events, the device naturally resubmits them with each ping, giving the server repeated opportunities to corroborate. This reuses the existing retry mechanism with zero device-side changes.

**Alternatives considered**:
- Acknowledge immediately and track server-side only → Requires the server to maintain its own retry logic; breaks the existing "device resubmits unacked events" contract.

## Decision 7: Migration Strategy

**Decision**: Single migration adding `"awaiting_corroboration"` to the `tracking_geofence_events.status` CHECK constraint.

**Rationale**: Minimal schema change. No new tables, no new columns. The existing `received_at` column already provides the server timestamp needed for staleness evaluation. The `matched_schedule_entry_id` column can be populated when the event first matches a stop (before corroboration), allowing the corroboration check to know which stop to evaluate distance against.

**Alternatives considered**:
- New `pending_corroborations` table → Over-engineering; the existing events table already has all needed columns.
- Add `corroboration_deadline` column → YAGNI; the 30-second threshold is a constant, not per-event.
