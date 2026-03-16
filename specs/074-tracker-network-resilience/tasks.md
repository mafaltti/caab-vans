# Tasks: Tracker Network Resilience

**Input**: Design documents from `/specs/074-tracker-network-resilience/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Not explicitly requested — test tasks omitted. Manual device testing covered in quickstart.md.

**Organization**: Tasks grouped by user story. US1+US2 share a phase (both P1, tightly coupled in plan Phase 1). US4 before US3 (Fix F before Fix E per plan order).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- All paths relative to `apps/van-tracker/`

---

## Phase 1: Setup (Shared Pre-requisite)

**Purpose**: Extend diagnostic event types needed by all subsequent phases

- [x] T001 Add three new event types to `EventType` union in `src/storage/diag-log.ts` (line 24–38): `"net_recovery"`, `"health_recovery"`, `"failure_notification_sent"`

**Checkpoint**: `npm run check` passes — new event types are available for all fixes

---

## Phase 2: US1 + US2 — Core Network Resilience (Priority: P1) 🎯 MVP

**Goal**: Eliminate the self-reinforcing failure loop — cap backoff at 60s, add NetInfo listener to reset backoff on reconnect, flush buffer on server errors

**Independent Test**: Start tracking → enable airplane mode for 2 min → disable airplane mode → buffer should flush within 10 seconds, backoff resets, `buffer_size` drops to 0

### Implementation

- [x] T002 [US2] Cap backoff at 60s — change `BACKOFF_DELAYS` from `[5000, 10000, 30000, 60000, 120000, 300000]` to `[5000, 10000, 20000, 30000, 45000, 60000]` in `src/location/task.ts` (line 54)
- [x] T003 [US1] Implement NetInfo listener — add `netInfoUnsubscribe: (() => void) | null` and `lastKnownConnected: boolean | null` module-level state (after line 47), then add `setupNetInfoListener()` function that subscribes via `NetInfo.addEventListener()`, detects offline→online transitions (`lastKnownConnected === false` → `connected === true`), resets `consecutiveFailures=0` and `backoffUntil=0`, persists state, logs `"net_recovery"`, attempts `flushBuffer()` guarded by `authPaused` + `isFlushing` checks. Async work in fire-and-forget IIFE (listener expects sync callback). In `src/location/task.ts`
- [x] T004 [US1] Add and export `teardownNetInfoListener()` — unsubscribes listener, resets `netInfoUnsubscribe=null` and `lastKnownConnected=null`. In `src/location/task.ts`
- [x] T005 [US1] Call `setupNetInfoListener()` in cold-start hydration block after `logEvent("cold_start")` (line 254) in `src/location/task.ts`
- [x] T006 [US1] Import `teardownNetInfoListener` from `"./task"` and call it in `stopTracking()` before `setTrackingEnabled(false)` (before line 150) in `src/location/tracking.ts`
- [x] T007 [US2] Add guarded `flushBuffer()` call after 429 error branch (after line 383) and after 5xx error branch (after line 403) — wrap in `if (!isFlushing) { try { await flushBuffer(settings, deviceId); } catch { /* non-fatal */ } }`. Do NOT add in `NetworkError` catch. In `src/location/task.ts`

**Checkpoint**: `npm run check` passes. Airplane mode toggle test: buffer flushes within seconds of reconnect, backoff never exceeds 60s, buffer drains on 429/5xx failures

---

## Phase 3: US4 — Driver Notification on Prolonged Failure (Priority: P2)

**Goal**: Alert the driver via local notification when delivery has failed 10+ consecutive times, giving them the chance to take corrective action

**Independent Test**: Block network access → wait for 10+ failures (~1–2 min with 60s cap) → notification "Rastreamento com problemas de conexão" appears → restore network → no duplicate notifications

### Implementation

- [x] T008 [US4] Add `import * as Notifications from "expo-notifications"` (already imported in tracking.ts, but needed in task.ts), module-level state `FAILURE_NOTIFICATION_THRESHOLD = 10` and `failureNotificationSent = false`, and async helper `sendFailureNotification()` that calls `Notifications.scheduleNotificationAsync` with title `"CAAB Tracker"`, body `"Rastreamento com problemas de conexão. Toque para verificar."`, priority HIGH, trigger null (immediate), then logs `"failure_notification_sent"` and sets flag. In `src/location/task.ts`
- [x] T009 [US4] Trigger notification — inside backoff check block (lines 319–326), after `await addToBuffer(point)`, add: if `consecutiveFailures >= FAILURE_NOTIFICATION_THRESHOLD && !failureNotificationSent`, call `sendFailureNotification()`. In `src/location/task.ts`
- [x] T010 [US4] Reset notification flag — add `failureNotificationSent = false` in `onSendSuccess()` (after line 86). In `src/location/task.ts`

**Checkpoint**: `npm run check` passes. Notification fires after 10 failures, no duplicates, resets on success

---

## Phase 4: US3 — Background Health Check Restarts Tracking (Priority: P2)

**Goal**: A periodic background task (every ~15 min) detects if the location service was killed by the OS and automatically restarts it

**Independent Test**: Start tracking → force-stop app via Android Settings → wait up to 15 min → tracking resumes automatically → `health_recovery` event in diagnostics

**⚠️ Note**: This phase adds `expo-background-fetch` (native dependency) — requires `npx expo prebuild` + new EAS build

### Implementation

- [x] T011 [US3] Install `expo-background-fetch` — run `npx expo install expo-background-fetch` in `apps/van-tracker/`
- [x] T012 [P] [US3] Add `expo-background-fetch` plugin to plugins array in `app.json` (after line 55)
- [x] T013 [US3] Create `src/location/health-check-task.ts` — define `HEALTH_CHECK_TASK = "health-check-task"` with `TaskManager.defineTask`: (1) check `getTrackingEnabled()` → return NoData if false, (2) check `Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)` → if not running, log `"health_recovery"` with detail `"location_task_restarted"`, dynamic `import("./tracking")` and call `startTracking()`, return NewData, (3) check `@lastTaskInvocationAt` from AsyncStorage → if stale (>10 min), log `"health_recovery"` with detail `"stale_task_restarted"`, stop and restart location updates, return NewData. Export `registerHealthCheck()` (registers with 15-min interval, `stopOnTerminate: false`, `startOnBoot: true`) and `unregisterHealthCheck()`
- [x] T014 [P] [US3] Add side-effect import `import "@/location/health-check-task"` at line 3 (after existing `import "@/location/geofence-task"`) in `app/_layout.tsx`
- [x] T015 [US3] Import `registerHealthCheck` and `unregisterHealthCheck` from `"./health-check-task"` in `src/location/tracking.ts`. Call `registerHealthCheck()` in `startTracking()` after battery listener setup (non-fatal try/catch). Call `unregisterHealthCheck()` in `stopTracking()` before `setTrackingEnabled(false)` (non-fatal try/catch)

**Checkpoint**: `npm run check` passes. After new EAS build: force-stop → tracking resumes within 15 min. Disabled tracking → no restart attempt

---

## Phase 5: US5 — Larger Buffer Prevents Data Loss (Priority: P3)

**Goal**: Increase buffer from 100 to 500 points (~42 min of data) and implement chunked flush to respect server's 100-point per-request limit

**Independent Test**: Keep device offline 40+ min with active tracking → restore connectivity → all buffered points delivered in sequential chunks → no data loss

### Implementation

- [x] T016 [P] [US5] Change `MAX_BUFFER_SIZE` from `100` to `500` in `src/storage/buffer.ts` (line 5)
- [x] T017 [US5] Replace single-shot flush with chunked logic in `flushBuffer()` in `src/location/task.ts` (lines 131–158) — add `CHUNK_SIZE = 100` constant, iterate `validPoints` in chunks of 100, send sequentially via `sendBatchPing()`, track `totalSent` counter, on 429/5xx/NetworkError break loop and keep remaining in buffer, on 401 break (stop sending with bad token), on success increment `totalSent` and call `onSendSuccess()`, after loop call `removeFromBuffer(totalSent)` once

**Checkpoint**: `npm run check` passes. 40-min offline test: zero data points lost, chunks delivered sequentially

---

## Phase 6: US6 — GPS Restart on Network Recovery (Priority: P3)

**Goal**: When the NetInfo listener (from US1) detects network recovery, also verify the location task is still running and restart it if the OS killed it — plugging the gap between reconnection and the next 15-min health check

**Independent Test**: On aggressive battery-management device: cause outage → OS kills location service → restore connectivity → location service restarts immediately (not waiting 15 min)

### Implementation

- [x] T018 [US6] Add `import * as Location from "expo-location"` at top of `src/location/task.ts`. Extend `setupNetInfoListener()` reconnection handler (from T003) — after the `flushBuffer()` call, add: `const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)`, if not running log `"net_recovery"` with detail `"restarting_location_task"`, dynamic `const { startTracking } = await import("./tracking")` and call `await startTracking()`. Wrap in try/catch (non-fatal). In `src/location/task.ts`

**Checkpoint**: `npm run check` passes. GPS restart on reconnect verified on test device

---

## Phase 7: Polish & Validation

**Purpose**: Quality gates and final validation

- [x] T019 Run `npm run check` (lint + typecheck) in `apps/van-tracker/` — fix any errors
- [x] T020 Verify all changes against quickstart.md manual test procedures in `specs/074-tracker-network-resilience/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1+US2)**: Depends on Phase 1 (needs `"net_recovery"` event type)
- **Phase 3 (US4)**: Depends on Phase 1 (needs `"failure_notification_sent"` event type). Can run in parallel with Phase 2
- **Phase 4 (US3)**: Depends on Phase 1 (needs `"health_recovery"` event type). Can run in parallel with Phase 2 and 3
- **Phase 5 (US5)**: Depends on Phase 2 (modifies `flushBuffer()` which Phase 2 also modifies)
- **Phase 6 (US6)**: Depends on Phase 2 (extends `setupNetInfoListener()` from US1)
- **Phase 7 (Polish)**: Depends on all previous phases

### User Story Dependencies

```
Phase 1 (Setup) ──┬──► Phase 2 (US1+US2 P1) ──┬──► Phase 5 (US5 P3)
                   │                             └──► Phase 6 (US6 P3)
                   ├──► Phase 3 (US4 P2) ──────────► Phase 7 (Polish)
                   └──► Phase 4 (US3 P2) ──────────►
```

- **US1 + US2 (P1)**: MVP — can ship after Phase 2 alone
- **US4 (P2)**: Independent of US1/US2 at code level, but logically ships together
- **US3 (P2)**: Independent, but requires new native build (EAS)
- **US5 (P3)**: Depends on US1+US2 (modifies same `flushBuffer()`)
- **US6 (P3)**: Depends on US1 (extends `setupNetInfoListener()`)

### Parallel Opportunities

- **Phase 2 + Phase 3 + Phase 4**: Can start in parallel after Phase 1 (different code areas, except Phase 3+4 both touch task.ts — serialize if single developer)
- **T012 + T014**: [P] within Phase 4 (app.json vs _layout.tsx)
- **T016**: [P] within Phase 5 (buffer.ts vs task.ts)
- **Phase 5 + Phase 6**: Must be sequential (both modify task.ts functions from Phase 2)

---

## Parallel Example: Phase 2 (US1 + US2)

```bash
# T002 can run first (1-line change, no deps):
Task: "[US2] Cap backoff at 60s in src/location/task.ts"

# Then T003–T005 sequentially (same file, depends on each other):
Task: "[US1] Implement NetInfo listener in src/location/task.ts"
Task: "[US1] Export teardownNetInfoListener in src/location/task.ts"
Task: "[US1] Call setupNetInfoListener in cold-start block in src/location/task.ts"

# T006 can run in parallel with T007 (different files):
Task: "[US1] Import teardownNetInfoListener in src/location/tracking.ts"
Task: "[US2] Add flushBuffer on 429/5xx in src/location/task.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (1 task)
2. Complete Phase 2: US1 + US2 core resilience (6 tasks)
3. **STOP and VALIDATE**: Airplane mode toggle test on device
4. Ship to dev — this alone fixes the Van 04 production incident

### Incremental Delivery

1. Phase 1 + Phase 2 → Core resilience (MVP) → Ship to dev
2. + Phase 3 (US4) → Driver notification → Ship to dev
3. + Phase 4 (US3) → Health check → **Requires new EAS build** → Ship to dev
4. + Phase 5 + Phase 6 (US5+US6) → Hardening → Ship to dev (only if monitoring shows need)

### Shipping Boundaries

- **After Phase 2**: Shippable. No new native deps. Fixes the primary production issue.
- **After Phase 3**: Shippable. Still no new native deps. Adds driver awareness.
- **After Phase 4**: Requires new EAS build (`expo-background-fetch`). Bundle with Phase 3 if possible.
- **After Phase 5+6**: Shippable. Hardening — only if production monitoring warrants it.

---

## Notes

- All file paths are relative to `apps/van-tracker/`
- US1+US2 combined in Phase 2 because they're interleaved in plan Phase 1 (Fix C → A → B order matters)
- US4 before US3 in task order because Fix F (notification) has no new deps while Fix E (health check) requires native build
- Phase 5+6 are optional hardening — deploy Phase 2+3+4 first and monitor `buffer_size` in production
- `import * as Notifications` is already available in tracking.ts but needs to be added to task.ts for US4
- Dynamic imports (`import("./tracking")`) used in US3 and US6 to avoid circular dependency (task.ts ↔ tracking.ts)
