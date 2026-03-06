# Research: Tracker Resilience

**Feature**: 040-tracker-resilience | **Date**: 2026-03-05

## Decision Log

### D1: Batch Endpoint Design

**Decision**: New `POST /api/tracking-batch/[vanId]` accepting an array of points.

**Rationale**: Current sequential flush sends up to 50 individual requests. On 3G (~300ms RTT), that's 15+ seconds. Also hits server rate limit (25 req/min) at point 26. Single batch POST eliminates both issues.

**Alternatives considered**:
- WebSocket streaming: Overkill for unidirectional fire-and-forget pings. Adds connection management complexity.
- GraphQL batch mutation: Project uses REST exclusively. Adding GraphQL for one endpoint violates KISS.
- Sequential with fallback: Spec clarification ruled this out — hard requirement, no fallback.

**Server processing**: Upsert each point individually (preserves dedup via unique `van_id,device_ts` index). Run OSRM snap-to-road and `inferStopProgress` only on the newest chronological point.

### D2: Health Metadata Delivery

**Decision**: Piggyback health fields on existing location pings (no separate endpoint).

**Rationale**: Avoids new endpoint, zero extra HTTP requests. Health data arrives naturally with location data. During outages, health data buffers alongside location points.

**Alternatives considered**:
- Separate `/health` endpoint: Adds complexity, extra requests, separate rate limiting. During outages when health data matters most, it would fail alongside pings anyway.
- Server-side inference only (stale `location_updated_at`): Passive — can't distinguish "offline" from "app crashed" from "GPS failed."

**Fields added to ping payload**: `buffer_size` (int), `failure_count` (int), `battery_level` (float 0-1, nullable), `network_type` (string: wifi/cellular/none).

### D3: Exponential Backoff Scope

**Decision**: Backoff delays ALL sending (current point + flush). Current point is buffered during backoff.

**Rationale**: Per doc 0057, the whole point of backoff is to stop hammering a failing connection every 5s on shared 3G. Exempting the current point defeats battery/bandwidth savings. Buffered current points are sent on first post-backoff probe.

**Backoff schedule**: 5s → 10s → 30s → 60s → 2min → 5min (cap). Reset to 0 on any successful send.

**State**: Module-level `consecutiveFailures` counter + `backoffUntil` timestamp (same pattern as existing `lastSentLat/Lng` hydration).

### D4: Sequence Numbering Scope

**Decision**: Sequence number scoped to route run (resets on "Start Route").

**Rationale**: Maps cleanly to existing `route_run` lifecycle. Gives operators per-route gap analysis. Server tracks `last_seq` per van per route_run.

**Implementation**: Module-level counter in task.ts, initialized to 0 on route start. Persisted to AsyncStorage for cold-start hydration. New `seq` column on `van_location_pings`.

### D5: Buffer Eviction Strategy

**Decision**: Hard maximum of 100 points. Oldest evicted when full (ring buffer).

**Rationale**: 100 points = ~8 min moving, ~100 min stationary. Predictable storage usage. Oldest points are least valuable (closest to 24h TTL expiry). Storage cost: 100 × ~100 bytes ≈ 10KB — negligible.

### D6: Task Kill Detection Mechanism

**Decision**: Store `@lastTaskInvocationAt` timestamp on each task callback. Home screen checks staleness on foreground resume.

**Rationale**: Simplest detection. No new background process needed. If `Date.now() - lastInvocation > 5 min`, show warning. Covers the most common failure mode (Android OEM battery optimization kills foreground service).

**Alert UI**: Modal dialog with "Tracking may have stopped" message + "Restart Tracking" action button.

### D7: 401 Escalation Threshold

**Decision**: After 3 consecutive 401 responses, pause sending and show persistent alert.

**Rationale**: Single 401 could be transient. 3 consecutive confirms the token is invalid. Points are buffered during pause (token might be re-enabled). Driver alert directs to Settings screen.

### D8: Battery-Adaptive GPS

**Decision**: Use `expo-battery` to detect level. Below 20%, switch to `Accuracy.Balanced` and increase `timeInterval` to 10s. Resume high accuracy at 25% (hysteresis).

**Rationale**: `Accuracy.High` uses GPS + WiFi + cellular triangulation. `Balanced` uses WiFi + cellular only — significantly less power. 5% hysteresis gap prevents rapid toggling.

**New dependency**: `expo-battery` (Expo-maintained, SDK 55 compatible).

### D9: Secure Token Storage

**Decision**: Migrate from AsyncStorage to `expo-secure-store`.

**Rationale**: AsyncStorage stores data in plaintext SQLite. `expo-secure-store` uses iOS Keychain / Android EncryptedSharedPreferences. One-time migration on app launch: read from AsyncStorage, write to SecureStore, delete from AsyncStorage.

**New dependency**: `expo-secure-store` (Expo-maintained, SDK 55 compatible).

### D10: Error Reporting Service

**Decision**: Integrate `sentry-expo` for crash reporting and error tracking.

**Rationale**: Industry standard for React Native. Automatic crash capture, breadcrumbs, source maps. Expo SDK 55 compatible.

**New dependency**: `sentry-expo` + Sentry project setup.

## Dependency Impact

| Package | Version | Stories | Install Size |
|---------|---------|---------|-------------|
| `expo-battery` | ~3.0.x | Story 5 | ~50KB |
| `expo-secure-store` | ~14.0.x | Story 6 | ~30KB |
| `sentry-expo` | ~8.x | Story 6 | ~500KB |

All three are Expo-maintained or Expo-compatible, tested with SDK 55.

**Already available** (no install needed):
- `@react-native-community/netinfo` 11.5.2 — network type detection
- `@react-native-async-storage/async-storage` 2.2.0 — buffer persistence
- `expo-task-manager` ~55.0.9 — background task
- `expo-location` ~55.1.2 — GPS

## Unknowns Resolved

All NEEDS CLARIFICATION items from Technical Context have been resolved through codebase exploration and spec clarifications. No outstanding unknowns remain.
