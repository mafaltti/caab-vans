# Tasks: Expo Van Tracker App

**Input**: Design documents from `/specs/018-expo-tracker-app/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/tracking-api.md

**Tests**: No automated tests requested — background location requires manual device testing (see quickstart.md).

**Organization**: Tasks grouped by user story. US2+US3+US6 are combined into one phase (background tracking inherently includes permissions and screen-locked operation).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Includes exact file paths in descriptions

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Create standalone Expo + TypeScript project at `apps/van-tracker/`

- [x] T001 Create Expo project at `apps/van-tracker/` using `npx create-expo-app@latest apps/van-tracker --template blank-typescript`. After creation, verify `.gitignore` includes `node_modules/`, `.expo/`, `android/`, `ios/`, and `*.apk`
- [x] T002 Install all required dependencies: run `npx expo install expo-location expo-task-manager expo-crypto expo-dev-client @react-native-async-storage/async-storage @react-native-community/netinfo` inside `apps/van-tracker/`
- [x] T003 [P] Configure `apps/van-tracker/app.json` — set app name to "CAAB Tracker", add `expo-location` plugin with `isAndroidBackgroundLocationEnabled: true` and `isAndroidForegroundServiceEnabled: true`, add Android permissions (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`)
- [x] T004 [P] Create `apps/van-tracker/eas.json` with `development` profile (`developmentClient: true`, `distribution: internal`, `android.buildType: apk`) and `preview` profile for APK builds
- [x] T005 [P] Verify `apps/van-tracker/tsconfig.json` has strict mode enabled and path alias `@/*` mapping to `./src/*`
- [x] T005b [P] Configure ESLint + Prettier in `apps/van-tracker/` — install `eslint`, `prettier`, `eslint-config-expo` (or equivalent Expo preset), create `.eslintrc.js` and `.prettierrc` config files with TypeScript support. Verify `npx eslint . --ext .ts,.tsx` runs without config errors

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core modules that all user stories depend on — storage, API client, types, navigation shell

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 [P] Create shared TypeScript types in `apps/van-tracker/src/types.ts` — define `LocationPoint` (`lat`, `lng`, `accuracy`, `speed`, `heading`, `ts`), `Settings` (`apiBaseUrl`, `vanId`, `ingestionToken`), and `TrackingStatus` (`isTracking`, `lastSentAt`, `lastLat`, `lastLng`, `lastError`) interfaces per data-model.md
- [x] T007 [P] Implement settings storage module in `apps/van-tracker/src/storage/settings.ts` — `getSettings()`, `saveSettings(settings)` using AsyncStorage key `@settings`, with UUID validation for `vanId` and `isSettingsComplete()` helper
- [x] T008 [P] Implement device ID module in `apps/van-tracker/src/storage/device-id.ts` — `getOrCreateDeviceId()` that reads from AsyncStorage key `@deviceId` or generates a new UUID via `expo-crypto` `randomUUID()` on first call
- [x] T009 [P] Implement tracking state module in `apps/van-tracker/src/storage/tracking-state.ts` — `getTrackingEnabled()`, `setTrackingEnabled(flag)`, `getLastSentAt()`, `setLastSentAt(ts)` using AsyncStorage keys `@trackingEnabled` and `@lastSentAt`
- [x] T010 [P] Implement API client in `apps/van-tracker/src/api/client.ts` — `sendLocationPing(settings, deviceId, point)` function that POSTs to `{apiBaseUrl}/api/tracking/{vanId}` with `x-ingestion-token` header and JSON body per contracts/tracking-api.md. Return typed result (success with server ts, or error with code/message). Handle network errors by throwing a distinguishable error type.
- [x] T011 Create Expo Router layout in `apps/van-tracker/app/_layout.tsx` — Stack navigator with two screens: `index` (title: "CAAB Tracker") and `settings` (title: "Settings"). Minimal styling.

**Checkpoint**: Foundation ready — all storage, API, and navigation infrastructure in place

---

## Phase 3: User Story 1 — Configure Tracker App (Priority: P1) MVP

**Goal**: Driver can enter API Base URL, Van ID, and Ingestion Token in a Settings screen. Values persist across app restarts. Invalid UUID is rejected. Tracking is blocked until settings are complete.

**Independent Test**: Open app → navigate to Settings → enter values → close and reopen → values persist. Enter invalid UUID → validation error shown.

### Implementation for User Story 1

- [x] T012 [US1] Implement Settings screen in `apps/van-tracker/app/settings.tsx` — three TextInput fields (API Base URL, Van ID, Ingestion Token) with a Save button. On save: validate Van ID is UUID format (regex check), show validation error if invalid, call `saveSettings()` from storage module. Load existing settings on mount via `getSettings()`. Show success feedback on save.
- [x] T013 [US1] Implement Home screen skeleton in `apps/van-tracker/app/index.tsx` — check `isSettingsComplete()` on mount. If settings incomplete, show message "Configure settings to start tracking" with a button navigating to Settings. If settings complete, show placeholder "Ready to track" (tracking controls added in Phase 4).

**Checkpoint**: US1 complete — Settings screen functional, values persist, Home screen gates on settings

---

## Phase 4: User Stories 2+3+6 — Live Tracking with Background Support (Priority: P1)

**Goal**: Driver taps Start Tracking, app requests permissions (foreground → background → notification), starts foreground service, sends GPS coordinates to the backend, and keeps working with screen locked. Home screen shows tracking status (on/off, last sent time, last lat/lng, last error). Stop Tracking ends the service.

**Independent Test**: Configure settings → Start Tracking → grant permissions → verify status updates with coordinates → lock screen → wait 1 min → unlock → verify coordinates continued updating → Stop Tracking → verify service stops.

### Implementation for User Stories 2+3+6

- [x] T014 [US2] Define background location task in `apps/van-tracker/src/location/task.ts` — call `TaskManager.defineTask()` at module top-level scope (CRITICAL: must be global, not inside any component). Task name constant `BACKGROUND_LOCATION_TASK`. The callback receives location data, builds a `LocationPoint`, calls `sendLocationPing()`, updates tracking state (`lastSentAt`, last coords). On send failure, log the error. Export the task name constant.
- [x] T015 [US2] Implement tracking service in `apps/van-tracker/src/location/tracking.ts` — export `startTracking()`: request foreground permissions, then background permissions, then notification permission (Android 13+); if any denied, throw descriptive error. Call `Location.startLocationUpdatesAsync` with `accuracy: High`, `timeInterval: 3000`, `distanceInterval: 5`, `foregroundService` config (title: "CAAB Tracker", body: "Sharing location", color: "#2563eb", `killServiceOnDestroy: false`). Set `trackingEnabled(true)`. Export `stopTracking()`: call `Location.stopLocationUpdatesAsync`, set `trackingEnabled(false)`. Export `isTracking()`: check `TaskManager.isTaskRegisteredAsync`.
- [x] T016 [US2] Complete Home screen in `apps/van-tracker/app/index.tsx` — add side-effect import of `../src/location/task` at the top (registers the background task). Add Start/Stop tracking button (calls `startTracking()`/`stopTracking()`). Display tracking status: on/off indicator, last sent timestamp (formatted), last lat/lng coordinates, last error message. Use `useEffect` interval (every 2s) to read latest tracking state from AsyncStorage and update display. Handle permission denial by showing an explanatory message. Add the task import to `apps/van-tracker/app/_layout.tsx` as well to ensure early registration.

**Checkpoint**: US2+US3+US6 complete — tracking works foreground and background, permissions handled, status displayed

---

## Phase 5: User Story 4 — Smart Throttle and Accuracy Filtering (Priority: P2)

**Goal**: The task handler drops points with accuracy > 50m and only sends when distance >= 5m OR 3s elapsed (whichever comes later), reducing battery drain and server load.

**Independent Test**: Monitor network requests while tracking — verify no requests faster than 3s apart; hold device stationary and verify sends throttle down; verify inaccurate points are silently dropped.

### Implementation for User Story 4

- [x] T017 [P] [US4] Implement haversine distance function in `apps/van-tracker/src/lib/haversine.ts` — pure function `haversineDistance(lat1, lng1, lat2, lng2): number` returning distance in meters between two WGS84 coordinate pairs. Include the standard haversine formula with Earth radius 6371000m.
- [x] T018 [US4] Add throttle and accuracy filtering to task handler in `apps/van-tracker/src/location/task.ts` — maintain module-level variables `lastSentLat`, `lastSentLng`, `lastSentTime`. In the task callback: (1) drop point if `accuracy > 50`; (2) compute distance from last sent point using haversine; (3) compute time since last send; (4) skip if distance < 5m AND time < 3000ms. Only proceed with send/buffer if both checks pass.

**Checkpoint**: US4 complete — throttle reduces send rate, inaccurate points dropped

---

## Phase 6: User Story 5 — Offline Buffering and Reconnection (Priority: P2)

**Goal**: When network is unavailable, buffer up to 50 unsent points locally. Flush oldest-first when connectivity returns. Drop oldest if buffer full.

**Independent Test**: Disable network → start tracking → verify points accumulate in buffer (check AsyncStorage). Re-enable network → verify buffered points are sent oldest-first to server.

### Implementation for User Story 5

- [x] T019 [P] [US5] Implement offline buffer module in `apps/van-tracker/src/storage/buffer.ts` — `getBuffer(): LocationPoint[]`, `addToBuffer(point)` (appends; if length > 50, shifts oldest), `removeFromBuffer(count)` (removes first N items), `clearBuffer()`. All operations read/write AsyncStorage key `@locationBuffer` as JSON array.
- [x] T020 [US5] Integrate offline buffering into task handler in `apps/van-tracker/src/location/task.ts` — modify the send flow: (1) before sending new point, check buffer; if non-empty, flush buffer oldest-first (send each, remove on success, stop flush on first failure); (2) attempt to send current point; (3) on network error, call `addToBuffer(point)` instead of dropping. Use `@react-native-community/netinfo` `fetch()` to pre-check connectivity before attempting sends (optimization to avoid unnecessary fetch timeouts).

**Checkpoint**: US5 complete — points are never silently lost, buffer persists across restarts, flush works on reconnection

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Auto-resume, error handling refinements, documentation

- [x] T021 Implement auto-resume tracking on app launch in `apps/van-tracker/app/_layout.tsx` — in a `useEffect`, check `getTrackingEnabled()` and `isSettingsComplete()`. If both true, call `startTracking()` (wrapped in try/catch to handle permission issues gracefully). This satisfies FR-023.
- [x] T022 Enhance server error response handling in `apps/van-tracker/src/location/task.ts` and `apps/van-tracker/src/api/client.ts` — differentiate 401/404 (display error, continue sending), 429 (skip point, do not buffer), 400 (log error, do not buffer), network error (buffer point). Persist last error message to AsyncStorage so Home screen can display it.
- [x] T023 Write `apps/van-tracker/README.md` with sections: Prerequisites, Install, EAS Setup, Build (cloud + local), Run on Device, Testing Background Tracking (locked-screen procedure), Troubleshooting (battery optimization, permissions, OEM killers), Dependencies table. Reference quickstart.md content.
- [x] T024 Run TypeScript type check (`npx tsc --noEmit` in `apps/van-tracker/`) and fix any type errors across all files
- [x] T025 Run ESLint (`npx eslint . --ext .ts,.tsx` in `apps/van-tracker/`) and Prettier (`npx prettier --check .`), fix all lint and formatting issues across all files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 (needs storage modules + navigation)
- **US2+US3+US6 (Phase 4)**: Depends on Phase 2 (needs API client, storage, types) + Phase 3 (Home screen skeleton exists)
- **US4 (Phase 5)**: Depends on Phase 4 (modifies task handler created in Phase 4)
- **US5 (Phase 6)**: Depends on Phase 4 (modifies task handler); can run in parallel with Phase 5 on separate branches, but both modify `task.ts` so sequential is safer
- **Polish (Phase 7)**: Depends on Phases 5 and 6

### User Story Dependencies

- **US1 (Configure)**: Independent after Phase 2
- **US2+US3+US6 (Tracking + Background + Permissions)**: Depends on US1 (settings must exist)
- **US4 (Throttle)**: Depends on US2 (modifies task handler)
- **US5 (Buffering)**: Depends on US2 (modifies task handler); independent of US4

### Within Each Phase

- Storage modules (T007-T009) can all run in parallel
- T010 (API client) can run in parallel with storage modules
- T014 (task definition) must precede T016 (Home screen imports it)
- T017 (haversine) can run in parallel with anything in Phase 5
- T019 (buffer module) can run in parallel with anything in Phase 6

### Parallel Opportunities

```
Phase 2: T006 ║ T007 ║ T008 ║ T009 ║ T010  (all parallel — different files)
              └──────────────────────────── T011 (needs types from T006)

Phase 4: T014 → T015 → T016  (sequential — each depends on previous)

Phase 5: T017 ║ (parallel with Phase 4 if desired)
              └── T018 (depends on T017 + T014)

Phase 6: T019 ║ (parallel with Phase 5)
              └── T020 (depends on T019 + T014)
```

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all storage + API modules together (all different files, no deps):
Task: "Create TypeScript types in src/types.ts"
Task: "Implement settings storage in src/storage/settings.ts"
Task: "Implement device ID storage in src/storage/device-id.ts"
Task: "Implement tracking state storage in src/storage/tracking-state.ts"
Task: "Implement API client in src/api/client.ts"

# Then (depends on types):
Task: "Create Expo Router layout in app/_layout.tsx"
```

---

## Implementation Strategy

### MVP First (US1 + US2 Tracking)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 (Settings)
4. Complete Phase 4: US2+US3+US6 (Core tracking)
5. **STOP and VALIDATE**: Build APK, install on device, test full tracking flow including screen-locked operation
6. Deploy/share APK if basic tracking works

### Incremental Delivery

1. Setup + Foundational → Project ready
2. Add US1 → Settings screen works, values persist (MVP foundation)
3. Add US2+US3+US6 → Full tracking with background and permissions (functional MVP!)
4. Add US4 → Throttle + accuracy filtering (battery + data quality improvement)
5. Add US5 → Offline buffering (reliability improvement)
6. Polish → Auto-resume, error handling, README

### EAS Build Checkpoints

Build a new APK at these points to test on-device:
- After Phase 4: First functional tracking test
- After Phase 6: Full feature test with buffering
- After Phase 7: Final validation before PR

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2, US3, US6 are combined into Phase 4 because background tracking, permissions, and screen-locked operation are implemented together (same files)
- No automated tests — background GPS tracking requires physical device testing
- Each phase builds on the previous; the task handler in `src/location/task.ts` is incrementally enhanced across Phases 4, 5, and 6
- Commit after each task or logical group
- Build APK at checkpoints to validate on-device behavior
