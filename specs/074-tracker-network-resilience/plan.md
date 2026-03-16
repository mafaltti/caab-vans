# Implementation Plan: Tracker Network Resilience

**Branch**: `074-tracker-network-resilience` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/074-tracker-network-resilience/spec.md`

## Summary

Fix a self-reinforcing failure loop in the van tracker app where spotty cellular connectivity causes backoff escalation, prevents buffer flush, and makes vans appear "stuck" on the map despite active GPS collection (Van 04 production incident). The fix adds: (1) a NetInfo event listener to detect network recovery and immediately reset backoff/flush buffer, (2) buffer flush attempts after server error responses, (3) a 60s backoff cap, (4) a periodic background health check to restart killed location tasks, (5) local driver notifications on prolonged failure, (6) larger buffer with chunked flush, and (7) GPS service restart on reconnect.

## Technical Context

**Language/Version**: TypeScript ~5.9, React Native 0.83, Expo SDK 55
**Primary Dependencies**: expo-location ~55.1, expo-task-manager ~55.0, @react-native-community/netinfo 11.5, expo-notifications ~55.0, expo-background-fetch (new, Phase 2)
**Storage**: AsyncStorage (local device) for buffer, backoff state, diagnostics
**Testing**: Manual device testing (airplane mode toggle, force stop); Vitest for unit tests if added
**Target Platform**: Android (API 21+), EAS-built APK
**Project Type**: Mobile app (Expo/React Native tracker)
**Performance Goals**: Buffer flush within 10s of network recovery; max 60s between retry attempts
**Constraints**: Offline-capable, must survive process kills, 15-min minimum for background fetch (Android JobScheduler), ~75KB max buffer size (500 points)
**Scale/Scope**: ~5 active vans, single tracker app, 7 files modified + 1 new file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Simplicity (KISS/DRY/YAGNI)** | PASS | Each fix is minimal and targeted. No new abstractions — only module-level state and straightforward control flow. Health check task (Fix E) is the most complex addition but justified by a concrete production failure mode. |
| **II. Explicit Trade-offs** | PASS | Trade-offs documented in research.md (extra HTTP requests on failure, notification annoyance threshold, 15-min health check interval). |
| **III. Branch & Merge** | PASS | Feature branch `074-tracker-network-resilience` targets `dev`. Conventional commits. |
| **IV. Quality Gates** | PASS | `npm run check` (lint + typecheck) will be run. Manual device testing plan included. |
| **V. Stack Constraints** | PASS | Uses existing Expo SDK packages. Only new dependency is `expo-background-fetch` (Phase 2), which is an official Expo package. No server-side changes. |

### Post-Phase 1 Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Simplicity** | PASS | No new abstractions. Chunked flush (Fix D) is the only structural change to `flushBuffer()`, justified by 5x buffer increase. Dynamic imports for circular dependency avoidance is standard pattern. |
| **V. Stack Constraints** | PASS | `expo-background-fetch` is an official Expo SDK package, consistent with stack. No non-Expo native modules. |

## Project Structure

### Documentation (this feature)

```text
specs/074-tracker-network-resilience/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research decisions R1–R8
├── data-model.md        # Phase 1: state model changes
├── quickstart.md        # Phase 1: dev setup and testing guide
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
apps/van-tracker/
├── app/
│   └── _layout.tsx                          # +1 import (health-check-task)
├── app.json                                 # +expo-background-fetch plugin
├── package.json                             # +expo-background-fetch dependency
└── src/
    ├── api/
    │   └── client.ts                        # (unchanged — sendBatchPing already supports arrays)
    ├── location/
    │   ├── task.ts                           # Core changes: NetInfo listener, flush-on-fail, backoff cap, notification, GPS restart, chunked flush
    │   ├── tracking.ts                       # +teardownNetInfoListener, +registerHealthCheck/unregisterHealthCheck
    │   └── health-check-task.ts             # NEW — background fetch health check task
    └── storage/
        ├── buffer.ts                         # MAX_BUFFER_SIZE: 100 → 500
        └── diag-log.ts                       # +3 EventType values
```

**Structure Decision**: All changes are within the existing `apps/van-tracker/` project. One new file (`health-check-task.ts`) follows the existing pattern of `task.ts` and `geofence-task.ts` in the same directory. No structural changes to the project layout.

## Implementation Phases

### Phase 1: Core Network Resilience (Fixes C → A → B)

**Shippable independently. No new native dependencies.**

1. **Fix C — Cap backoff at 60s** (task.ts line 54)
   - Change `BACKOFF_DELAYS` array: `[5000, 10000, 20000, 30000, 45000, 60000]`
   - 1 line change, no dependencies

2. **Fix A — NetInfo listener** (task.ts + tracking.ts + diag-log.ts)
   - Add `"net_recovery"` to `EventType` union in diag-log.ts
   - Add module-level state: `netInfoUnsubscribe`, `lastKnownConnected`
   - Add `setupNetInfoListener()`: subscribes to `NetInfo.addEventListener`, detects offline→online, resets backoff, flushes buffer (guarded by `authPaused` + `isFlushing`)
   - Add `teardownNetInfoListener()` export
   - Call `setupNetInfoListener()` after `logEvent("cold_start")` (line 254)
   - In tracking.ts: import `teardownNetInfoListener`, call in `stopTracking()` before `setTrackingEnabled(false)`

3. **Fix B — Flush on 429/5xx** (task.ts)
   - After 429 branch (line 383): add guarded `flushBuffer()` call
   - After 5xx branch (line 403): add guarded `flushBuffer()` call
   - NOT in NetworkError catch — no network means batch will also fail

### Phase 2: Autonomous Recovery (Fixes F → E)

**Requires new EAS build (expo-background-fetch is a native dependency).**

4. **Fix F — Local notification on prolonged failure** (task.ts + diag-log.ts)
   - Add `"failure_notification_sent"` to `EventType` union
   - Add module-level state: `FAILURE_NOTIFICATION_THRESHOLD = 10`, `failureNotificationSent = false`
   - Add `sendFailureNotification()` helper using `Notifications.scheduleNotificationAsync`
   - Trigger in backoff check block (line 319-326) when `consecutiveFailures >= threshold`
   - Reset `failureNotificationSent = false` in `onSendSuccess()`
   - `expo-notifications` already installed (v55.0.10)

5. **Fix E — Background health check** (new file + tracking.ts + _layout.tsx + diag-log.ts)
   - Add `"health_recovery"` to `EventType` union
   - Install `expo-background-fetch`
   - Create `health-check-task.ts`: `TaskManager.defineTask` checks tracking enabled, location task running, last invocation freshness
   - Export `registerHealthCheck()` and `unregisterHealthCheck()`
   - In tracking.ts: call `registerHealthCheck()` in `startTracking()`, `unregisterHealthCheck()` in `stopTracking()`
   - In _layout.tsx: add `import "@/location/health-check-task"` (line 3, existing pattern)
   - Add `expo-background-fetch` plugin to app.json

### Phase 3: Hardening (Fixes D → G)

**Only if monitoring shows remaining issues after Phase 1+2.**

6. **Fix D — Buffer 100 → 500 + chunked flush** (buffer.ts + task.ts)
   - Change `MAX_BUFFER_SIZE = 500` in buffer.ts
   - Replace single-shot flush in `flushBuffer()` with chunked logic: send in chunks of 100, sequential sends, track `totalSent`, partial failure handling

7. **Fix G — GPS restart on reconnect** (task.ts)
   - Extend `setupNetInfoListener()` reconnection handler (from Fix A)
   - After flush: check `Location.hasStartedLocationUpdatesAsync()`, restart via dynamic `import("./tracking")` if not running
   - Add `import * as Location from "expo-location"` to task.ts

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| NetInfo listener fires during active send | Concurrent flush corruption | `isFlushing` mutex guard already exists (line 113) |
| Health check + NetInfo both restart tracking | Double restart | `Location.hasStartedLocationUpdatesAsync` check prevents redundant restarts |
| expo-background-fetch requires new EAS build | Deployment delay for Phase 2 | Phase 1 ships independently without native deps |
| Notification spam on sustained poor connectivity | Driver annoyance | One-shot flag per failure episode; threshold of 10 failures (~1 min) |
| Chunked flush partial failure | Inconsistent buffer state | Track `totalSent`, single `removeFromBuffer(totalSent)` at end |
| Dynamic import circular dependency | Runtime crash | Tested pattern; already avoided in existing codebase |
