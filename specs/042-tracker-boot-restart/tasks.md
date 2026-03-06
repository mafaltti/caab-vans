# Tasks: Tracker Boot Restart

**Input**: Design documents from `/specs/042-tracker-boot-restart/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested in the spec. Manual device testing scenarios documented in quickstart.md.

**Organization**: Tasks grouped by user story. US2 (Persistent Notification) is inherently satisfied by US1 — the existing `startTracking()` already creates the foreground notification — so they share a phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Create directory structure for the config plugin

- [x] T001 Create `apps/van-tracker/plugins/` directory for the local Expo config plugin

---

## Phase 2: Foundational — Config Plugin (Blocking)

**Purpose**: Build the Expo config plugin that injects all native Android code at build time. MUST be complete before any user story work can begin.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Implement manifest modifications in `apps/van-tracker/plugins/withBootRestart.ts`: add `RECEIVE_BOOT_COMPLETED` permission via `AndroidConfig.Permissions.withPermissions`, and register `BootRestartReceiver` in the manifest with `android:directBootAware="true"`, `android:exported="true"`, and intent filters for `LOCKED_BOOT_COMPLETED`, `BOOT_COMPLETED`, and `MY_PACKAGE_REPLACED`
- [x] T003 Add `DeviceProtectedStorage` native module generation to `apps/van-tracker/plugins/withBootRestart.ts` via `withDangerousMod`: generate `DeviceProtectedStorage.kt` (Kotlin native module with `setTracking(Boolean)`, `getTracking()`, and `consumeBootTrigger()` methods using `createDeviceProtectedStorageContext().getSharedPreferences`) and `DeviceProtectedStoragePackage.kt` (React Native package registration). `consumeBootTrigger()` reads and clears the `boot_trigger` key (written by the receiver as "boot" or "app_update"), returning null if no trigger pending. Use the app's package name from the Expo config.
- [x] T004 Add `BootRestartReceiver` native code generation to `apps/van-tracker/plugins/withBootRestart.ts` via `withDangerousMod`: generate `BootRestartReceiver.kt` that handles `LOCKED_BOOT_COMPLETED`, `BOOT_COMPLETED`, and `MY_PACKAGE_REPLACED` intents. Receiver must: (1) read `tracking_enabled` from device-protected SharedPreferences, (2) implement boot-loop guard using `last_boot_attempt` timestamp with 60-second threshold, (3) write trigger source ("boot" or "app_update") to `boot_trigger` key in device-protected SharedPreferences, (4) launch `MainActivity` with `FLAG_ACTIVITY_NEW_TASK` if tracking was enabled, (5) handle Direct Boot fallback for Android < 7.0
- [x] T005 Register the `withBootRestart` plugin in `apps/van-tracker/app.json` by adding `"./plugins/withBootRestart"` to the `plugins` array

**Checkpoint**: Config plugin complete — `npx expo prebuild --platform android` should generate the native files without errors

---

## Phase 3: User Story 1+2 — Auto-Resume Tracking After Reboot/Update + Notification (Priority: P1) 🎯 MVP

**Goal**: After a device reboot or app update, tracking resumes automatically (including the foreground notification) without user interaction. US2 (notification) is inherently satisfied because `startTracking()` already creates the foreground service with persistent notification.

**Independent Test**: Power off phone with tracking active → power on → verify location pings resume and notification appears within 90 seconds, without unlocking or opening the app.

### Implementation

- [x] T006 [P] [US1] Create JS bridge to native module in `apps/van-tracker/src/storage/device-protected-state.ts`: export `setTrackingEnabledDeviceProtected(flag: boolean)`, `getTrackingEnabledDeviceProtected()`, and `consumeBootTrigger()` functions that call `NativeModules.DeviceProtectedStorage.setTracking` / `.getTracking` / `.consumeBootTrigger` with Platform.OS guard (returns null on iOS) and try/catch for graceful fallback
- [x] T007 [US1] Modify `apps/van-tracker/src/storage/tracking-state.ts`: update `setTrackingEnabled()` to dual-write — keep existing `AsyncStorage.setItem("@trackingEnabled", ...)` and add `await setTrackingEnabledDeviceProtected(flag)` call after it. Import from `device-protected-state.ts`.
- [x] T008 [US1] Modify `apps/van-tracker/app/_layout.tsx`: detect boot restart by calling `consumeBootTrigger()` from `device-protected-state.ts` — if it returns a non-null trigger source ("boot" or "app_update"), store it in a module-level variable for US3 logging. In the existing auto-resume `useEffect`, the existing `wasTracking && settingsOk` condition already handles the resume (the receiver launches the app, which reads `@trackingEnabled` from AsyncStorage). No additional condition needed — the boot receiver simply ensures the app process starts. Cold-start hydration (FR-010) is handled by the existing `task.ts` code automatically on first background task callback.

**Checkpoint**: US1+US2 complete. Device reboot with tracking active should auto-resume tracking and show foreground notification within 90 seconds.

---

## Phase 4: User Story 3 — Boot Restart Diagnostic Logging (Priority: P2)

**Goal**: Every boot-triggered restart is logged in the diagnostic log with trigger source ("boot" or "app_update") and success/failure status.

**Independent Test**: Reboot device with tracking active → open Diagnostics screen → verify `boot_restart` event with timestamp and trigger source.

### Implementation

- [x] T009 [US3] Modify `apps/van-tracker/app/_layout.tsx`: in the auto-resume `useEffect`, after detecting a boot restart trigger, log a `boot_restart` diagnostic event via `logEvent("boot_restart", triggerSource)` on success, or `logEvent("boot_restart", "error: " + reason)` on failure (permission denied, settings incomplete). Call `flushLog()` after logging. Import `logEvent` and `flushLog` from `@/storage/diag-log`.
- [x] T010 [US3] Modify `apps/van-tracker/app/_layout.tsx`: handle graceful failure when boot restart cannot proceed — if permissions were revoked or settings are incomplete, log the specific reason without crashing or showing error dialogs. Ensure the catch block in the auto-resume `useEffect` logs `boot_restart` with error status.

**Checkpoint**: US3 complete. Boot restart events visible in Diagnostics screen with trigger source and status.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, quality gates, and validation

- [x] T011 [P] Update `apps/van-tracker/README.md`: add "Boot Restart" section documenting the feature, OEM whitelist guidance per manufacturer (Samsung: Settings > Battery > App Power Management > disable; Xiaomi: Settings > Battery > App battery saver > No restrictions; Huawei: Settings > Battery > App launch > Manual), and note that EAS Build is required
- [x] T012 [P] Run lint (`eslint`) and typecheck (`tsc --noEmit`) in `apps/van-tracker/` to verify no errors introduced
- [x] T013 Verify config plugin works by running `npx expo prebuild --platform android --clean` and inspecting generated files: check `android/app/src/main/AndroidManifest.xml` contains the receiver and permission, and `android/app/src/main/java/` contains the three Kotlin files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1+US2 (Phase 3)**: Depends on Phase 2 completion
- **US3 (Phase 4)**: Depends on Phase 3 (logging extends the boot restart detection added in T008)
- **Polish (Phase 5)**: Depends on all user stories complete

### User Story Dependencies

- **US1+US2 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **US3 (P2)**: Depends on US1 (T008 adds boot restart detection that T009/T010 extend with logging)

### Within Each Phase

- T002, T003, T004 are sequential within the same file (`withBootRestart.ts`) — cannot parallelize
- T006 can run in parallel with T005 (different files)
- T007 depends on T006 (imports from device-protected-state.ts)
- T008 depends on T007 (needs dual-write in place for full integration)
- T011 and T012 can run in parallel (different concerns)
- T013 depends on all implementation tasks

### Parallel Opportunities

- T006 (JS bridge) can be developed in parallel with T002–T005 (config plugin), then integrated
- T011 (README) and T012 (lint/typecheck) can run in parallel during Polish phase

---

## Parallel Example: Phase 2

```bash
# T002–T004 are sequential (same file), but T005 can follow immediately after:
Task: T002 "Implement manifest modifications in plugins/withBootRestart.ts"
Task: T003 "Add DeviceProtectedStorage native module generation to plugins/withBootRestart.ts"
Task: T004 "Add BootRestartReceiver native code generation to plugins/withBootRestart.ts"
Task: T005 "Register plugin in app.json"
```

## Parallel Example: Phase 3

```bash
# T006 can start in parallel with T005 (different files):
Task: T006 "Create device-protected-state.ts JS bridge"
# Then sequential:
Task: T007 "Modify tracking-state.ts (dual-write)"
Task: T008 "Modify _layout.tsx (detect boot intent)"
```

---

## Implementation Strategy

### MVP First (US1+US2 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Config Plugin (T002–T005)
3. Complete Phase 3: US1+US2 (T006–T008)
4. **STOP and VALIDATE**: Build with EAS, install on device, test reboot scenario
5. If working: proceed to US3 and Polish

### Incremental Delivery

1. Setup + Foundational → Config plugin generates native files correctly
2. US1+US2 → Tracking resumes after reboot with notification → **MVP!**
3. US3 → Diagnostic logging for boot restart events → Full observability
4. Polish → Documentation, quality gates, prebuild verification

### Key Risk

The config plugin (Phase 2) is the highest-risk phase — it involves generating native Kotlin code at build time. Validate with `npx expo prebuild --platform android` before proceeding to user story implementation.

---

## Notes

- No test tasks included (not requested in spec; testing is manual per quickstart.md)
- US2 (notification) has no separate implementation tasks — `startTracking()` already creates the foreground notification
- All native Kotlin files are generated by the config plugin, not committed to the repo
- The config plugin must be idempotent (safe to run `expo prebuild` multiple times)
- EAS Build is required — config plugins don't work with Expo Go
