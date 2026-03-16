# Research: Tracker Network Resilience

**Date**: 2026-03-16
**Feature**: 074-tracker-network-resilience

## R1: NetInfo Listener Pattern in expo-task-manager Context

**Decision**: Use `NetInfo.addEventListener()` at module level in `task.ts`, guarded by a `netInfoUnsubscribe` variable to prevent double-subscription.

**Rationale**: The `@react-native-community/netinfo` package (v11.5.2, already installed) supports event-based subscriptions. The listener fires synchronously with the current state on initial subscribe, so `lastKnownConnected` must start as `null` to avoid spurious flushes. The listener callback expects a synchronous return, so async recovery work must run in a fire-and-forget IIFE.

**Alternatives considered**:
- Polling in a setInterval: Wastes battery, misses fast transitions.
- Subscribing in `tracking.ts` instead: Would miss events during cold-start hydration before `startTracking()` runs; module-level in `task.ts` ensures subscription from first callback.

**Key finding**: `NetInfo.addEventListener` fires immediately on subscribe with current state. The `lastKnownConnected === null` guard on first invocation prevents a spurious flush.

## R2: Flush-on-Failure Safety

**Decision**: Add `flushBuffer()` calls after the 429 and 5xx error branches in the task callback, but NOT in the `NetworkError` catch block.

**Rationale**: The batch endpoint (`/api/tracking-batch/{vanId}`) uses a separate rate-limit bucket from the single-ping endpoint (`/api/tracking/{vanId}`). A 429 on the single endpoint doesn't mean the batch endpoint is also rate-limited. When there's no network at all (`NetworkError`), attempting a batch send would fail immediately and waste resources.

**Alternatives considered**:
- Always flush after any failure: Would waste one HTTP request on `NetworkError` paths.
- Only flush on successful recovery: Current behavior — proven insufficient by the Van 04 incident.

**Key finding**: The `isFlushing` guard (line 113 in task.ts) prevents concurrent flushes, making the additional call safe even if the network listener triggers a flush simultaneously.

## R3: Backoff Delay Cap

**Decision**: Change `BACKOFF_DELAYS` from `[5000, 10000, 30000, 60000, 120000, 300000]` to `[5000, 10000, 20000, 30000, 45000, 60000]`.

**Rationale**: 300s (5 min) max backoff is too aggressive for a mobile tracker. At 5s GPS intervals, 300s = 60 buffered points without delivery attempt. With 100-point buffer, overflow starts at ~8 min. 60s max means 12 points buffered per cycle — much safer margin.

**Alternatives considered**:
- Cap at 30s: Too aggressive — would hammer the server during genuine outages.
- Cap at 120s: Still 24 points per cycle, acceptable but 60s provides better recovery.
- Keep 300s but add NetInfo reset: Helps on reconnect but not during sustained partial connectivity.

**Key finding**: Server-side rate limit is 40 req/60s per van. One extra request per minute per van (from shorter backoff) is negligible load.

## R4: expo-background-fetch for Health Check

**Decision**: Install `expo-background-fetch` and register a `TaskManager.defineTask` for periodic health checking at 15-min intervals.

**Rationale**: Android `JobScheduler` (used by `expo-background-fetch` under the hood) is more resilient to OEM battery management kills than foreground location services alone. The 15-min minimum interval (Android platform limit) is acceptable — it catches "task silently died" scenarios that would otherwise go undetected for hours.

**Alternatives considered**:
- Rely only on the boot receiver: Doesn't help if the process is killed without reboot.
- Use AlarmManager directly: Not available through Expo SDK; would require native module.
- Skip health check, rely on NetInfo + shorter backoff: Doesn't cover the case where location task itself is killed.

**Key finding**: `expo-background-fetch` is NOT currently installed. Requires `npx expo install expo-background-fetch`, then adding the plugin to `app.json` and running `npx expo prebuild` + new EAS build. This is a native dependency change.

## R5: expo-notifications for Failure Alerts

**Decision**: Use `expo-notifications` (v55.0.10, already installed) to fire immediate local notifications after 10 consecutive delivery failures.

**Rationale**: `expo-notifications` is already a dependency and notification permissions are already requested in `startTracking()` (tracking.ts line 63-71). No new native dependency needed. The notification text should be in Portuguese ("Rastreamento com problemas de conexão. Toque para verificar.") matching the target user base in Bahia, Brazil.

**Alternatives considered**:
- Use Android toast/snackbar: Not visible from background.
- Use a persistent notification channel: Overkill — the foreground service notification already exists.
- Skip notification entirely: Leaves driver unaware during prolonged failures.

**Key finding**: `Notifications.scheduleNotificationAsync` with `trigger: null` fires immediately. The `failureNotificationSent` flag (in-memory, no persistence needed) prevents duplicates within a session. Process restart naturally resets the flag.

## R6: Buffer Capacity and Chunked Flush

**Decision**: Increase `MAX_BUFFER_SIZE` from 100 to 500. Implement chunked flush in `flushBuffer()` with `CHUNK_SIZE = 100`.

**Rationale**: 500 points × 5s intervals = ~42 min of data. Each point is ~150 bytes JSON, so 500 points ≈ 75KB — well within AsyncStorage's 6MB limit. The batch endpoint accepts max 100 points per request, so chunked sends are required.

**Alternatives considered**:
- Keep 100: Simpler, but loses data after 8 min of outage.
- Use 1000: ~83 min, but 150KB JSON string, slower parse/serialize. Diminishing returns.
- Use SQLite instead of AsyncStorage: Much more complex, not justified for ~75KB.

**Key finding**: `sendBatchPing` already accepts an array of `LocationPoint[]` with no documented per-request size limit in the client code. The server-side batch endpoint validates max 100 points. Chunks must be sent sequentially (not parallel) to avoid rate-limit triggers.

## R7: Circular Dependency Avoidance for GPS Restart

**Decision**: Use dynamic `import("./tracking")` inside the NetInfo listener (Fix G) and health check task (Fix E) to avoid circular imports.

**Rationale**: `task.ts` is imported by `tracking.ts` (for `BACKGROUND_LOCATION_TASK`). If `task.ts` imports `tracking.ts` at the top level, a circular dependency is created. Dynamic imports resolve at call time, breaking the cycle.

**Alternatives considered**:
- Move `startTracking` to a shared module: Unnecessary restructuring for two call sites.
- Use `Location.startLocationUpdatesAsync` directly: Would duplicate tracking setup logic.

**Key finding**: The existing codebase already avoids this circular dependency — `_layout.tsx` imports both `task.ts` (side-effect) and `tracking.ts` (named imports) separately. Dynamic import is the clean pattern.

## R8: New Diagnostic Event Types

**Decision**: Add three new event types to the `EventType` union in `diag-log.ts`: `"net_recovery"`, `"health_recovery"`, `"failure_notification_sent"`.

**Rationale**: Each new recovery mechanism needs its own diagnostic event for production monitoring. The existing `EventType` union is a simple string union — adding new values is zero-cost.

**Alternatives considered**:
- Reuse existing `"state_change"` event with detail strings: Harder to filter in production queries.
- Use generic `"recovery"` event type: Loses distinction between network recovery, health check recovery, and notification events.
