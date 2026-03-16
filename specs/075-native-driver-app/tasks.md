# Tasks: Native Driver App

**Input**: Design documents from `specs/075-native-driver-app/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Server-side Vitest tests included for auth/endpoint changes. No Expo unit tests (manual Android acceptance per spec).

**Organization**: Tasks grouped by user story. Server foundational work ships as a testable unit before Expo screens.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install dependencies and create shared type definitions

- [x] T001 Install `@supabase/supabase-js` in apps/van-tracker/package.json and run npm install
- [x] T002 [P] Create driver-specific TypeScript types (DriverRoute, RouteDetail, ShiftState, DriverSession, DeviceProvisioning, API response shapes, reason codes) in apps/van-tracker/src/types/driver.ts — derive from contracts/native-api-client.md and data-model.md

---

## Phase 2: Foundational — Server Auth + Bound-Van Enforcement

**Purpose**: Extend server auth to support native callers. MUST complete before any Expo driver screen can call APIs.

**⚠️ CRITICAL**: No user story work can begin until this phase AND the Expo infrastructure below are complete.

### Server Auth

- [x] T003 Modify `requireAuth()` to accept optional `NextRequest` parameter and support `Authorization: Bearer <token>` — if bearer header present, validate via `supabase.auth.getUser(token)` using anon-key client; fall back to existing cookie-based flow if absent. Update `requireRole()` to pass through the request parameter. File: src/lib/api/auth.ts. See contracts/server-auth.md for exact behavior.
- [x] T004 Add `requireBoundVan(request: NextRequest): Promise<string | null>` — reads `x-bound-van-id` + `x-ingestion-token` headers, validates token against `vans.ingestion_token` via service client, returns vanId or null for web callers. File: src/lib/api/auth.ts. See contracts/server-auth.md for error responses.

### Server Endpoint Updates (all parallelizable — different files, same pattern)

- [x] T005 [P] Update GET /api/driver/routes — pass `request` to `requireAuth(request)`, call `requireBoundVan(request)`, if vanId returned filter routes to `route.van_id === boundVanId`. File: src/app/api/driver/routes/route.ts
- [x] T006 [P] Update GET /api/driver/routes/[routeId] — pass `request` to `requireAuth(request)`, call `requireBoundVan(request)`, reject with 403 if route's van_id doesn't match boundVanId. File: src/app/api/driver/routes/[routeId]/route.ts
- [x] T007 [P] Update POST /api/routes/[routeId]/start — pass `request` to `requireAuth(request)`, call `requireBoundVan(request)`, reject with 403 if route's van doesn't match. File: src/app/api/routes/[routeId]/start/route.ts
- [x] T008 [P] Update POST /api/routes/[routeId]/confirm-start-stop — pass `request` to `requireAuth(request)`, call `requireBoundVan(request)`, reject with 403 if van mismatch. File: src/app/api/routes/[routeId]/confirm-start-stop/route.ts
- [x] T009 [P] Update POST /api/routes/[routeId]/skip-stop — pass `request` to `requireAuth(request)`, call `requireBoundVan(request)`, reject with 403 if van mismatch. File: src/app/api/routes/[routeId]/skip-stop/route.ts
- [x] T010 [P] Update POST /api/routes/[routeId]/detour — pass `request` to `requireAuth(request)`, call `requireBoundVan(request)`, reject with 403 if van mismatch. File: src/app/api/routes/[routeId]/detour/route.ts
- [x] T011 [P] Update POST /api/routes/[routeId]/end — pass `request` to `requireAuth(request)`, call `requireBoundVan(request)`, reject with 403 if van mismatch. File: src/app/api/routes/[routeId]/end/route.ts

### Server Tests

- [x] T012 Add Vitest tests: (1) bearer auth succeeds for driver endpoint, (2) cookie auth still works, (3) bound-van filtering on route list, (4) bound-van rejection on mutations, (5) web callers without headers unaffected, (6) invalid bearer returns 401, (7) invalid ingestion token returns 401. File: src/lib/api/__tests__/auth.test.ts

---

## Phase 2 (cont): Foundational — Expo Infrastructure

**Purpose**: Storage modules, auth client, API helper, tracking decoupling, and bootstrap gate

### Storage & Auth (all parallelizable — new files)

- [x] T013 [P] Create Supabase auth client with AsyncStorage session adapter — exports `supabase` client instance, `signIn(email, password)` with role/active validation, `signOut()`, `getSession()`, `onAuthStateChange()`. Uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from app config. File: apps/van-tracker/src/lib/supabase-client.ts
- [x] T014 [P] Create `fetchWithDriverAuth(path, options)` helper — reads apiBaseUrl from DeviceProvisioning, access token from Supabase client, vanId + ingestionToken from DeviceProvisioning; sets Authorization, x-bound-van-id, x-ingestion-token headers; retries once on 401 after token refresh. File: apps/van-tracker/src/lib/driver-api.ts
- [x] T015 [P] Rename `Settings` interface to `DeviceProvisioning` in apps/van-tracker/src/storage/settings.ts — update exported type name and all references in existing files (settings.tsx, _layout.tsx, tracking.ts, task.ts, config.ts). Keep `getSettings()`, `saveSettings()`, `isSettingsComplete()` function names for backward compat.
- [x] T016 [P] Create DriverSession storage module — `getDriverSession()`, `saveDriverSession(session)`, `clearDriverSession()`, `hasDriverSession()`. Store userId/email/role in AsyncStorage, tokens managed by Supabase SDK. File: apps/van-tracker/src/storage/driver-session.ts
- [x] T017 [P] Create ShiftState storage module — `getShiftState()`, `setShiftActive(routeId, shiftId)`, `clearShiftState()`, `isShiftActive()`. Dual-write to AsyncStorage + device-protected storage via existing bridge. File: apps/van-tracker/src/storage/shift-state.ts

### Tracking Decoupling

- [x] T018 Extract `requestLocationPermissions()` from `startTracking()` — new exported function that requests foreground + background location + notification permissions, returns boolean. Add `skipPermissions?: boolean` param to `startTracking()`. Boot recovery and health check pass `skipPermissions: true`. File: apps/van-tracker/src/location/tracking.ts

### Bootstrap Gate

- [x] T019 Implement bootstrap gate in root layout — check state on mount: (1) if `!isSettingsComplete()` → redirect to `/device-setup`, (2) if no driver session → redirect to `/login`, (3) if signed in → render `(driver)` group. Use expo-router `Redirect` component. Preserve existing Sentry init and boot trigger logic. File: apps/van-tracker/app/_layout.tsx

**Checkpoint**: Server auth + bound-van enforcement testable. Expo infrastructure ready for screen development.

---

## Phase 3: User Story 1 — Driver Signs In and Views Routes (P1) 🎯 MVP

**Goal**: Driver signs in with email/password on a provisioned device and sees routes for the bound van.

**Independent Test**: Sign in on provisioned device → verify only bound-van routes appear. Non-driver/inactive credentials rejected. Auto-open if single in-progress route.

### Implementation

- [x] T020 [US1] Create login screen — email + password fields, sign-in button, error display. On submit: call Supabase `signInWithPassword()`, validate role === "driver" and is_active, save DriverSession, navigate to `/(driver)`. Show error for invalid credentials, non-driver role, or inactive account. File: apps/van-tracker/app/login.tsx
- [x] T021 [P] [US1] Create driver group layout — wraps all authenticated driver screens, provides shared header with driver email display. File: apps/van-tracker/app/(driver)/_layout.tsx
- [x] T022 [P] [US1] Create RouteCard component — displays route name, van name, stop count, time range (HH:mm – HH:mm), status badge (waiting/in_progress/completed). Accepts `DriverRoute` prop and `onStartShift`/`onEndShift`/`onViewRoute` callbacks. File: apps/van-tracker/src/components/route-card.tsx
- [x] T023 [US1] Create route list screen — fetch `GET /api/driver/routes` via `fetchWithDriverAuth` on mount. Display RouteCard list. Handle empty state ("Nenhuma rota atribuída"). Handle loading/error states. File: apps/van-tracker/app/(driver)/index.tsx
- [x] T024 [US1] Add auto-open logic — in route list screen, if exactly one route has `runStatus === "in_progress"`, auto-navigate to `/(driver)/routes/[routeId]`. File: apps/van-tracker/app/(driver)/index.tsx

**Checkpoint**: US1 functional — driver can sign in, see routes, session persists across app restarts.

---

## Phase 4: User Story 2 — Driver Starts a Shift (P1)

**Goal**: Driver starts a shift with permission checks, GPS fix, cold-start handling, and tracking activation.

**Independent Test**: Start shift on pending route → verify permissions requested, GPS collected, cold-start dialog shown when applicable, tracking starts. If tracking fails, recovery screen shown.

**Dependencies**: Requires US1 (route list to select from)

### Implementation

- [x] T025 [P] [US2] Create cold-start dialog component — displays suggested start stop with name/time/distance. Radio selection if alternatives. Confirm button calls `POST /api/routes/[routeId]/confirm-start-stop` with selected stopId. File: apps/van-tracker/src/components/cold-start-dialog.tsx
- [x] T026 [US2] Implement shift start orchestration in route list screen — on "Start Shift" tap: (1) call `requestLocationPermissions()`, abort if denied, (2) get one-shot GPS via `Location.getCurrentPositionAsync()` with 5s timeout, (3) call `POST /api/routes/[routeId]/start` with optional lat/lng, (4) if response includes `coldStart`, show cold-start dialog, (5) on success: call `setShiftActive(routeId, shiftId)`, call `startTracking({ skipPermissions: true })`, (6) navigate to active route screen. File: apps/van-tracker/app/(driver)/index.tsx
- [x] T027 [US2] Implement tracking-failed recovery state — if shift start succeeds (T026 step 5) but `startTracking()` throws, show blocking screen with "Retry tracking" and "End shift" buttons. "Retry" re-attempts `startTracking()`. "End shift" calls `POST /api/routes/[routeId]/end` and clears shift state. Per FR-017: do NOT auto-rollback. File: apps/van-tracker/app/(driver)/index.tsx

**Checkpoint**: US2 functional — driver can start shift, tracking begins, cold-start handled, tracking failure recoverable.

---

## Phase 5: User Story 3 — Driver Monitors Active Route (P1)

**Goal**: Active route screen with next-stop hero, timeline, tracker health, 5s polling, and detour banner.

**Independent Test**: View active route → verify next-stop name/time/ETA displayed, timeline shows correct stop states, health panel shows battery/network/freshness, screen refreshes every 5s.

**Dependencies**: Requires US2 (active shift to view)

### Implementation (components parallelizable — separate files)

- [x] T028 [P] [US3] Create NextStopHero component — displays stop name (large), arrival time (HH:mm), ETA ("~X min"), delay badge ("+Xmin" red / "−Xmin" green), route-completed state. File: apps/van-tracker/src/components/next-stop-hero.tsx
- [x] T029 [P] [US3] Create TrackerHealth component — displays ping freshness ("agora" or "X min atrás"), battery level (percentage + icon), network type (WiFi/LTE + icon), status badge (green OK / amber stale / red low battery). File: apps/van-tracker/src/components/tracker-health.tsx
- [x] T030 [P] [US3] Create ScheduleTimeline component — vertical timeline with past (check icon, gray), current (pulse dot, blue), future (empty circle) stops. Collapsible past stops section. Show skipped stops with skip icon (orange). ETA on current stop. File: apps/van-tracker/src/components/schedule-timeline.tsx
- [x] T031 [US3] Create active route screen — fetch `GET /api/driver/routes/[routeId]` via `fetchWithDriverAuth` on mount + 5s `setInterval` polling. Compose: NextStopHero, TrackerHealth, ScheduleTimeline. Show detour banner ("Em desvio") when `progress.isDetourActive`. Auto-redirect to route list if `!route.isRunning`. Clean up interval on unmount. File: apps/van-tracker/app/(driver)/routes/[routeId].tsx

**Checkpoint**: US3 functional — driver sees live route data with all display components, auto-refreshing.

---

## Phase 6: User Story 4 — Driver Handles Exceptions (P2)

**Goal**: Skip stop (with reason), start/end detour, and navigation handoff during active shift.

**Independent Test**: During active shift → skip next stop with reason → verify timeline advances. Start/end detour → verify banner appears/disappears. Tap navigate → verify external app opens.

**Dependencies**: Requires US3 (active route screen)

### Implementation

- [x] T032 [US4] Create exception drawer component — bottom sheet/modal with three modes: (1) Main menu: "Navegar até a parada", "Pular próxima parada", "Entrar/Sair do desvio"; (2) Skip mode: radio-select reason codes (road_closure, no_passengers, facility_closed, vehicle_issue, other), optional note textarea (required for "other", max 500 chars), confirm button; (3) Detour mode: radio-select reason codes (road_closure, accident, construction, flooding, police_checkpoint, other), optional note, confirm button. File: apps/van-tracker/src/components/exception-drawer.tsx
- [x] T033 [US4] Implement navigation handoff — in exception drawer main menu, "Navegar" opens external navigation app with next stop coordinates via `Linking.openURL()` to Google Maps directions URL. Disable if no coordinates available. File: apps/van-tracker/src/components/exception-drawer.tsx
- [x] T034 [US4] Integrate exception drawer into active route screen — add "Ações" button in header, pass nextStop data + callbacks for `onSkipStop` (POST to /api/routes/[routeId]/skip-stop) and `onDetourToggle` (POST to /api/routes/[routeId]/detour). On mutation success, trigger immediate re-fetch. File: apps/van-tracker/app/(driver)/routes/[routeId].tsx

**Checkpoint**: US4 functional — all three exception actions work from active route screen.

---

## Phase 7: User Story 5 — Driver Ends a Shift (P2)

**Goal**: End shift cleanly (server first, then stop tracking) with recovery for tracking-stop failure.

**Independent Test**: End active shift → verify server marks route completed, tracking stops, driver returns to route list. If tracking stop fails, recovery screen shown.

**Dependencies**: Requires US2 (active shift exists)

### Implementation

- [x] T035 [US5] Implement end shift orchestration — add "Encerrar Turno" button with confirmation dialog in active route screen. On confirm: (1) call `POST /api/routes/[routeId]/end`, (2) call `stopTracking()`, (3) call `clearShiftState()`, (4) navigate to route list. File: apps/van-tracker/app/(driver)/routes/[routeId].tsx
- [x] T036 [US5] Implement tracking-stop-failed recovery — if end shift API succeeds but `stopTracking()` throws, show recovery state with "Retry stop tracking" button (FR-016). Keep retrying until tracking stops. File: apps/van-tracker/app/(driver)/routes/[routeId].tsx
- [x] T037 [US5] Block logout while shift is active (FR-025) — in driver group layout, check `isShiftActive()` before allowing sign-out. If active, show message "Encerre o turno antes de sair". File: apps/van-tracker/app/(driver)/_layout.tsx

**Checkpoint**: US5 functional — shift end works cleanly, recovery handles tracking-stop failures, logout blocked during active shift.

---

## Phase 8: User Story 6 — Device Provisioning by Support (P2)

**Goal**: Support staff can configure device provisioning separately from driver flow, accessible via hidden gesture.

**Independent Test**: Launch unprovisioned device → see device-setup screen → enter provisioning details → transition to login. Access support area via hidden gesture on provisioned device.

**Dependencies**: None (standalone)

### Implementation

- [x] T038 [US6] Create device-setup screen — refactor from existing settings.tsx: form with API Base URL, Van ID (UUID validation), Ingestion Token fields. Save button calls `saveSettings()`. On success, navigate to `/login`. File: apps/van-tracker/app/device-setup.tsx
- [x] T039 [US6] Implement hidden gesture access to support area — add long-press handler on app version text in driver group layout. On long-press, navigate to `/support`. Not visible in main navigation. File: apps/van-tracker/app/(driver)/_layout.tsx

**Checkpoint**: US6 functional — device provisioning works, support area accessible via hidden gesture.

---

## Phase 9: User Story 7 — App Resilience After Reboot (P3)

**Goal**: Tracking resumes after reboot when shift is active. Server reconciliation restores or clears state.

**Independent Test**: Reboot during active shift → tracking resumes, active route screen restored. Reboot with no shift → no tracking. Kill app → foreground reconciliation clears stale state.

**Dependencies**: Requires US2 (shift state to test) and US5 (end shift for cleanup)

### Implementation

- [x] T040 [US7] Expand DeviceProtectedStorage.kt — add `setShiftActive(active: Boolean, routeId: String?)` and `getShiftActive(): Boolean` and `getActiveRouteId(): String?` methods to the native module. File: apps/van-tracker/android/app/src/main/java/com/caab/vantracker/DeviceProtectedStorage.kt
- [x] T041 [US7] Update device-protected-state.ts — add `setShiftActiveDeviceProtected(active, routeId)`, `getShiftActiveDeviceProtected()`, `getActiveRouteIdDeviceProtected()` functions calling the native bridge. File: apps/van-tracker/src/storage/device-protected-state.ts
- [x] T042 [US7] Implement shift-gated boot recovery — in root layout boot effect, change condition from `wasTracking && settingsComplete` to `wasTracking && settingsComplete && shiftActive` (read from device-protected storage). File: apps/van-tracker/app/_layout.tsx
- [x] T043 [US7] Create useShiftReconciliation hook — on app foreground (AppState listener) and initial mount: fetch `GET /api/driver/routes` via `fetchWithDriverAuth`. If no active shift on server for bound van but local `isShiftActive()` is true, call `stopTracking()` + `clearShiftState()`. If server has active shift but local state is idle, set shift active and navigate to active route. File: apps/van-tracker/src/hooks/use-shift-reconciliation.ts
- [x] T044 [US7] Integrate reconciliation into bootstrap — call `useShiftReconciliation()` from driver group layout. Ensure it runs on mount and on every foreground transition. File: apps/van-tracker/app/(driver)/_layout.tsx
- [x] T045 [US7] Implement auto-end previous shift on new sign-in (FR-024) — in login screen, before establishing new session: check `isShiftActive()`, if true call `POST /api/routes/[activeRouteId]/end` via `fetchWithDriverAuth` + `stopTracking()` + `clearShiftState()`. Handle errors gracefully (force clear if server call fails). File: apps/van-tracker/app/login.tsx

**Checkpoint**: US7 functional — reboot resilience works, foreground reconciliation clears stale state, multi-driver handoff auto-ends previous shift.

---

## Phase 10: User Story 8 — Diagnostics and Support Access (P3)

**Goal**: Support area with device provisioning, diagnostics, and manual tracking override.

**Independent Test**: Access support area → see diagnostics (tracking status, battery, network). Toggle manual tracking override.

**Dependencies**: None (standalone, but US6 T039 creates the entry point)

### Implementation

- [x] T046 [US8] Create support screen — hub with links to device provisioning (device-setup) and diagnostics. Show current device info (van ID, API URL, tracking status). File: apps/van-tracker/app/support.tsx
- [x] T047 [US8] Move diagnostics under support area — update diagnostics screen navigation to be reachable from support screen. Keep existing diagnostic log viewer and share functionality. File: apps/van-tracker/app/diagnostics.tsx
- [x] T048 [US8] Add manual tracking toggle to diagnostics — support-only override for starting/stopping tracking independently of shift state. Remove the tracking toggle from the old home screen (FR-021). Add warning label "Controle de suporte — uso emergencial". File: apps/van-tracker/app/diagnostics.tsx

**Checkpoint**: US8 functional — support area accessible, diagnostics work, manual tracking override available.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, validation, and regression checks

- [x] T049 Repurpose or remove old home screen — the original index.tsx (tracking toggle UI) is replaced by the driver flow. Remove standalone tracking toggle (moved to diagnostics). Redirect `/` to bootstrap gate. File: apps/van-tracker/app/index.tsx
- [x] T050 [P] Verify existing web driver flows are unaffected (FR-022/SC-005) — manually test web login → driver dashboard → start shift → active route → exceptions → end shift. Confirm cookie-based auth still works. No code changes expected.
- [x] T051 [P] Run lint, typecheck, and build for server — `eslint`, `tsc --noEmit`, `next build` must all pass with zero errors. Fix any issues introduced by auth changes.
- [x] T052 [P] Run lint and typecheck for Expo app — ensure all new files pass ESLint and TypeScript checks. Fix any issues.
- [x] T053 Run quickstart.md validation — walk through the full quickstart flow on a provisioned device to verify end-to-end functionality.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — 🎯 MVP milestone
- **US2 (Phase 4)**: Depends on US1 (needs route list)
- **US3 (Phase 5)**: Depends on US2 (needs active shift)
- **US4 (Phase 6)**: Depends on US3 (needs active route screen)
- **US5 (Phase 7)**: Depends on US2 (needs active shift to end)
- **US6 (Phase 8)**: Depends on Foundational only — can run in parallel with US1
- **US7 (Phase 9)**: Depends on US2 + US5 (needs shift lifecycle)
- **US8 (Phase 10)**: Depends on US6 T039 (support entry point) — mostly standalone
- **Polish (Phase 11)**: Depends on all desired user stories being complete

### User Story Dependencies (Graph)

```
Foundational
  ├── US1 (Sign In + Routes) ──── US2 (Start Shift) ──── US3 (Monitor Route) ──── US4 (Exceptions)
  │                                     │
  │                                     └── US5 (End Shift)
  │                                     │
  │                                     └── US7 (Resilience) [also needs US5]
  ├── US6 (Device Provisioning) ──── US8 (Diagnostics)
  └── [Polish]
```

### Parallel Opportunities

**Server endpoint updates** (T005–T011): All 7 files can be modified in parallel.

**Expo storage/lib modules** (T013–T017): All 5 new files can be created in parallel.

**US3 display components** (T028–T030): NextStopHero, TrackerHealth, ScheduleTimeline are independent files.

**US1 components** (T021–T022): Driver layout and RouteCard can be created in parallel.

**US6 + US1**: Can run in parallel after foundational (independent stories).

---

## Parallel Example: Phase 2 Server Endpoints

```
# After T003 + T004 (auth helpers) are complete, launch all endpoint updates:
T005: Update GET /api/driver/routes
T006: Update GET /api/driver/routes/[routeId]
T007: Update POST start
T008: Update POST confirm-start-stop
T009: Update POST skip-stop
T010: Update POST detour
T011: Update POST end
```

## Parallel Example: Phase 5 Components

```
# All three display components can be built simultaneously:
T028: NextStopHero component
T029: TrackerHealth component
T030: ScheduleTimeline component
# Then T031 integrates them into the active route screen
```

---

## Implementation Strategy

### MVP First (US1 Only — Phase 1–3)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003–T019)
3. Complete Phase 3: US1 — Sign In + View Routes (T020–T024)
4. **STOP and VALIDATE**: Driver can sign in, see bound-van routes, session persists
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Server auth testable, Expo infrastructure ready
2. US1 (Sign In + Routes) → **MVP** — first usable native driver experience
3. US2 (Start Shift) + US6 (Provisioning) → Shift lifecycle + clean provisioning
4. US3 (Monitor Route) → Core operational value
5. US4 (Exceptions) + US5 (End Shift) → Full shift lifecycle
6. US7 (Resilience) + US8 (Diagnostics) → Production-readiness
7. Polish → Quality gates, regression checks

### Critical Path

```
T001 → T003 → T004 → T005..T011 → T012 (server complete)
T001 → T013..T017 → T018 → T019 → T020 → T023 → T026 → T031 → T032 (longest Expo path)
```

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- All UI text in Portuguese (matching existing web driver screens)
- Server tests use Vitest; Expo validation is manual Android testing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Server changes (T003–T012) can be a standalone PR targeting dev
