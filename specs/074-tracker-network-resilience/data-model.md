# Data Model: Tracker Network Resilience

**Feature**: 074-tracker-network-resilience

## Modified Entities

### Backoff State (module-level in task.ts)

Existing fields (unchanged):
- `consecutiveFailures: number` — count of consecutive send failures
- `backoffUntil: number` — timestamp (ms) before which no sends are attempted
- `isFlushing: boolean` — mutex guard preventing concurrent flush operations
- `authPaused: boolean` — true when 3+ consecutive 401 errors received
- `consecutive401s: number` — count of consecutive authentication failures

Persistence: `@consecutiveFailures` and `@backoffUntil` in AsyncStorage. Restored on cold start.

State transitions:
```
idle → failure (send fails) → backoff (delay applied)
backoff → idle (backoff expires + send succeeds)
backoff → idle (network recovery detected, immediate reset)
any → auth_paused (3x 401)
auth_paused → idle (successful send)
```

### Network Listener State (new, module-level in task.ts)

- `netInfoUnsubscribe: (() => void) | null` — cleanup handle for NetInfo subscription
- `lastKnownConnected: boolean | null` — previous connectivity state; `null` = first invocation

Not persisted — reconstructed from scratch on process restart via cold-start hydration.

State transitions:
```
null → true/false (initial subscription fires)
false → true (offline→online: triggers recovery)
true → false (online→offline: no action)
true → true (no-op)
false → false (no-op)
```

### Failure Notification State (new, module-level in task.ts)

- `failureNotificationSent: boolean` — whether the failure notification has been dispatched this episode
- `FAILURE_NOTIFICATION_THRESHOLD: 10` — consecutive failures before notification fires

Not persisted — process restart naturally resets. Intentional: avoids stale notifications after restart.

State transitions:
```
false → true (consecutiveFailures >= 10, notification dispatched)
true → false (onSendSuccess() called, delivery resumes)
```

### Location Buffer (buffer.ts)

Modified fields:
- `MAX_BUFFER_SIZE: 500` (was 100) — holds ~42 min of GPS data at 5s intervals

New constant:
- `CHUNK_SIZE: 100` — max points per batch send request (in flushBuffer logic in task.ts)

### Diagnostic Log EventType (diag-log.ts)

New values added to `EventType` union:
- `"net_recovery"` — network offline→online transition triggered backoff reset
- `"health_recovery"` — background health check detected and restarted tracking
- `"failure_notification_sent"` — local notification dispatched to driver

### Health Check Task State (new file: health-check-task.ts)

- Task name: `"health-check-task"`
- Registration interval: 15 minutes (Android platform minimum)
- `stopOnTerminate: false` — survives app termination
- `startOnBoot: true` — re-registers after device reboot

Decision logic per invocation:
1. Check `getTrackingEnabled()` — if false, return NoData
2. Check `Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)` — if not running, restart and return NewData
3. Check `@lastTaskInvocationAt` — if stale (>10 min), restart and return NewData
4. Otherwise return NoData

## No Server-Side Changes

This feature modifies only the van-tracker mobile app. No database schema changes, no API changes, no server-side modifications required. The existing batch endpoint contract is unchanged.

## AsyncStorage Keys (Reference)

Existing (unchanged):
| Key | Type | Purpose |
|-----|------|---------|
| `@consecutiveFailures` | string(number) | Backoff failure count |
| `@backoffUntil` | string(number) | Backoff expiry timestamp |
| `@authPaused` | string("true") | Auth pause flag |
| `@lastTaskInvocationAt` | string(number) | Last GPS callback timestamp |
| `@locationBuffer` | string(JSON) | Buffered GPS points |

No new AsyncStorage keys added by this feature.
