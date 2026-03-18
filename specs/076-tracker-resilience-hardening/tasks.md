# Tasks: Tracker Resilience Hardening

**Input**: Design documents from `/specs/076-tracker-resilience-hardening/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not included — no test framework currently configured in van-tracker. Spec mentions adding vitest as future work.

**Organization**: Tasks grouped by user story. US4 (Geofence Cache) is delivered by foundational T003 + US1 T004; its phase contains only the verification/hardening task.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Add the three core helpers to `task.ts` and update `startTracking` signature — all user stories depend on these.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Add `runtimeReady` flag and `ensureTrackingRuntimeReady()` export: hydrate persisted state (`@consecutiveFailures`, `@backoffUntil`, `@authPaused`, `@lastLat`, `@lastLng`, `@lastSentTs`) from AsyncStorage, call `setupNetInfoListener()`, set `runtimeReady = true`. Guard with `if (runtimeReady) return` for idempotency (R2). Add to `apps/van-tracker/src/location/task.ts`
- [x] T002 Add `clearTransientRecoveryState()` export: reset in-memory `consecutiveFailures`, `backoffUntil`, `consecutive401s`, `authPaused`, `failureNotificationSent` to defaults and remove persisted keys `@consecutiveFailures`, `@backoffUntil`, `@authPaused`, `@lastError` via `Promise.all`. Must NOT touch `@buffer` (FR-013). Add to `apps/van-tracker/src/location/task.ts`
- [x] T003 Add `resetRuntimeForStop()` async export: call `clearTransientRecoveryState()`, call `teardownNetInfoListener()`, reset `lastSentLat = null`, `lastSentLng = null`, `lastSentTime = 0`, `lastSentTs = 0`, set `runtimeReady = false`. Add to `apps/van-tracker/src/location/task.ts`
- [x] T004 Replace inline cold-start hydration block (current `if (lastSentLat === null) { ... }` at ~line 307) with `await ensureTrackingRuntimeReady()` call + `logEvent("cold_start")`. Keep the `cold_start` log outside the helper so it only fires from the background task path. Update guard to `if (!runtimeReady)` in `apps/van-tracker/src/location/task.ts`
- [x] T005 Update `startTracking` signature to `startTracking(options?: { interactive?: boolean; source?: "manual" | "boot" | "health" | "net_recovery" })`. Default `interactive` to `true`, `source` to `"manual"`. Call `ensureTrackingRuntimeReady()` at the start of the function. Add `registerGeofencesFromCache()` call after `startLocationUpdatesAsync` and before `registerGeofences()` with non-fatal try/catch (FR-009, R4). Update in `apps/van-tracker/src/location/tracking.ts`

**Checkpoint**: Foundation ready — helpers exported, `startTracking` accepts options, geofence cache is in common path.

---

## Phase 2: User Story 1 — Unified Recovery Startup Flow (Priority: P1) MVP

**Goal**: All restart paths (boot, health-check, network recovery) call `startTracking` with the correct options, funneling through the same unified flow.

**Independent Test**: Trigger each restart path and verify tracking resumes with identical startup behavior (location updates → cached geofences → remote config).

- [x] T006 [US1] Update `_layout.tsx` boot resume: pass `{ interactive: false, source: "boot" }` to `startTracking()`. Remove the separate `registerGeofencesFromCache()` call and its try/catch (FR-010 — now handled inside `startTracking`). Remove `registerGeofencesFromCache` from the import. Update boot_restart log to `ok:boot` on success. Update in `apps/van-tracker/app/_layout.tsx`
- [x] T007 [P] [US1] Update both `startTracking()` calls in health-check-task.ts to pass `{ interactive: false, source: "health" }`. Update in `apps/van-tracker/src/location/health-check-task.ts`
- [x] T008 [P] [US1] Update net recovery `startTracking()` call (dynamic import in NetInfo listener IIFE) to pass `{ interactive: false, source: "net_recovery" }`. Update in `apps/van-tracker/src/location/task.ts`

**Checkpoint**: All non-interactive restart paths use unified `startTracking` with correct options. US1 acceptance scenarios verifiable.

---

## Phase 3: User Story 2 — Clean State on Manual Stop/Start (Priority: P1)

**Goal**: `stopTracking` performs a full runtime reset so the next manual start has no inherited failure state.

**Independent Test**: Induce backoff/auth-pause, stop tracking, start again — first GPS point sends immediately.

- [x] T009 [US2] Update `stopTracking()`: replace `teardownNetInfoListener()` call with `await resetRuntimeForStop()`. Import `resetRuntimeForStop` from `./task`. Update in `apps/van-tracker/src/location/tracking.ts`
- [x] T010 [P] [US2] Update `handleStart` and `handleRestart` in home screen: pass `{ interactive: true, source: "manual" }` to `startTracking()`. Update in `apps/van-tracker/app/index.tsx`

**Checkpoint**: Manual stop/start cycle produces clean session. US2 acceptance scenarios verifiable.

---

## Phase 4: User Story 3 — Settings Correction Unpauses Delivery (Priority: P2)

**Goal**: Saving settings clears transient failure/auth state so a corrected token immediately resumes delivery.

**Independent Test**: Start with invalid token, wait for auth-pause, correct token and save — next GPS point delivers.

- [x] T011 [US3] Import `clearTransientRecoveryState` from `@/location/task` and call `await clearTransientRecoveryState()` after successful `saveSettings()` (inside the try block, before `setSuccessMessage`). Update in `apps/van-tracker/app/settings.tsx`

**Checkpoint**: Settings save clears transient state. US3 acceptance scenarios verifiable.

---

## Phase 5: User Story 4 — Geofence Cache Restored on Every Start (Priority: P2)

**Goal**: Geofence stop detection is active immediately after any restart, even offline.

**Note**: Core implementation delivered in Phase 1 (T005 adds `registerGeofencesFromCache` to `startTracking`) and Phase 2 (T006 removes duplicate boot-only call). This phase ensures correct error handling.

- [x] T012 [US4] Verify `registerGeofencesFromCache()` call in `startTracking` has non-fatal try/catch matching the pattern used by `registerGeofences()`. Ensure ordering: after `startLocationUpdatesAsync`, before `registerGeofences()`. Review in `apps/van-tracker/src/location/tracking.ts`

**Checkpoint**: All restart paths register geofences from cache. US4 acceptance scenarios verifiable.

---

## Phase 6: User Story 5 — Non-Interactive Permission Gating (Priority: P2)

**Goal**: Background/headless restart paths check permissions silently and skip recovery with deterministic logs when permissions are missing.

**Independent Test**: Revoke location permissions, trigger health-check restart — no OS prompt, diagnostic log shows `skip:permissions_missing`.

- [x] T013 [US5] Add permission gating branch in `startTracking`: when `interactive` is false, use `Location.getForegroundPermissionsAsync()` and `Location.getBackgroundPermissionsAsync()` instead of `request*`. On denied status, throw `new Error("skip:fg_permission_missing")` / `"skip:bg_permission_missing"`. For notifications (Android 13+), use `Notifications.getPermissionsAsync()` in non-interactive mode — log warning but don't block (FR-011). Keep existing `request*PermissionsAsync` calls for interactive mode (FR-003). Update in `apps/van-tracker/src/location/tracking.ts`

**Checkpoint**: Non-interactive paths never trigger OS prompts. US5 acceptance scenarios verifiable.

---

## Phase 7: User Story 6 — Standardized Diagnostic Details (Priority: P3)

**Goal**: All startup/recovery events use consistent `start:<source>`, `ok:<source>`, `skip:<reason>`, `fail:<reason>` detail strings.

**Independent Test**: Trigger each restart path, review diagnostics screen for consistent patterns.

- [x] T014 [US6] Update `tracking_start` event in `startTracking` to include `start:<source>` as detail string (e.g., `logEvent("tracking_start", "start:" + source)`). Update in `apps/van-tracker/src/location/tracking.ts`
- [x] T015 [P] [US6] Standardize `boot_restart` details in `_layout.tsx`: success → `ok:boot`, skip (not tracking) → `skip:tracking_not_enabled`, skip (settings) → `skip:settings_incomplete`, error → `fail:<message>`. Replace current `bootTrigger` and `error: <reason>` patterns. Update in `apps/van-tracker/app/_layout.tsx`
- [x] T016 [P] [US6] Standardize `health_recovery` details: before restart → `start:health`, after success → `ok:health`. Replace current `location_task_restarted` and `stale_task_restarted` strings. Update in `apps/van-tracker/src/location/health-check-task.ts`
- [x] T017 [P] [US6] Standardize `net_recovery` details: on offline→online → `start:net_recovery`, after successful flush/restart → `ok:net_recovery`. Replace current empty detail and `restarting_location_task`. Update in `apps/van-tracker/src/location/task.ts`

**Checkpoint**: All diagnostic events follow consistent pattern. US6 acceptance scenarios verifiable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and invariant verification.

- [x] T018 Run `npm run check` (lint + typecheck) in `apps/van-tracker` and fix any errors
- [x] T019 Review all reset functions (clearTransientRecoveryState, resetRuntimeForStop, onSendSuccess) to confirm none touch `@buffer` AsyncStorage key (FR-013 invariant)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately. BLOCKS all user stories.
- **US1 (Phase 2)**: Depends on Phase 1 completion.
- **US2 (Phase 3)**: Depends on Phase 1 completion. Independent of US1.
- **US3 (Phase 4)**: Depends on Phase 1 (T002 — clearTransientRecoveryState). Independent of US1/US2.
- **US4 (Phase 5)**: Depends on Phase 1 (T005 — geofence cache in startTracking) + Phase 2 (T006 — removal from _layout). Verification only.
- **US5 (Phase 6)**: Depends on Phase 1 (T005 — startTracking options). Independent of US1-US4.
- **US6 (Phase 7)**: Can start after Phase 1. Independent of US1-US5 but best done last since it touches the same files.
- **Polish (Phase 8)**: Depends on all previous phases.

### User Story Dependencies

- **US1 (P1)**: Phase 1 only — no other story dependency
- **US2 (P1)**: Phase 1 only — no other story dependency
- **US3 (P2)**: Phase 1 only — no other story dependency
- **US4 (P2)**: Phase 1 + Phase 2 (T006 removes duplicate call)
- **US5 (P2)**: Phase 1 only — no other story dependency
- **US6 (P3)**: Phase 1 only — touches same files as US1/US2, best done sequentially

### Parallel Opportunities

- T007 + T008 can run in parallel (different files: health-check-task.ts, task.ts)
- T009 + T010 can run in parallel (different files: tracking.ts, index.tsx)
- T015 + T016 + T017 can run in parallel (different files: _layout.tsx, health-check-task.ts, task.ts)
- US1, US2, US3, US5 can theoretically run in parallel after Phase 1 (different primary files)

---

## Parallel Example: Phase 2 (US1)

```bash
# T007 and T008 touch different files — can run in parallel:
Task: "Update health-check-task.ts: pass { interactive: false, source: 'health' }"
Task: "Update task.ts net recovery: pass { interactive: false, source: 'net_recovery' }"
```

## Parallel Example: Phase 7 (US6)

```bash
# T015, T016, T017 touch different files — can run in parallel:
Task: "Standardize boot_restart details in _layout.tsx"
Task: "Standardize health_recovery details in health-check-task.ts"
Task: "Standardize net_recovery details in task.ts"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Foundational (T001–T005)
2. Complete Phase 2: US1 — Unified Recovery (T006–T008)
3. **STOP and VALIDATE**: All restart paths use same startup flow
4. Run `npm run check` to verify no regressions

### Incremental Delivery

1. Phase 1 (Foundational) → Helpers ready
2. + US1 → Unified startup flow (MVP)
3. + US2 → Clean stop/start sessions
4. + US3 → Settings-save recovery
5. + US4 → Verify geofence cache
6. + US5 → Permission gating
7. + US6 → Diagnostic standardization
8. Polish → Quality gate pass

---

## Notes

- All changes in 6 existing files — no new files created
- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Commit after each phase or logical group
- `npm run check` is the quality gate (no test suite exists yet)
