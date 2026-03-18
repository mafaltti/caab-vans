# Tasks: Hybrid Driver WebView in Tracker App

**Input**: Design documents from `/specs/075-hybrid-driver-webview/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested. No test tasks generated.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Install new dependencies for the native tracker app

- [x] T001 Install `react-native-webview` and `expo-keep-awake` via `npx expo install` in `apps/van-tracker/`
- [x] T002 Register the `driver` screen in the Expo Router stack in `apps/van-tracker/app/_layout.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Web auth restructure that MUST complete before the WebView can load `/driver/login` correctly

**CRITICAL**: US1 (WebView screen) depends on the driver login page existing. US2 (web auth) must be complete first, or at minimum the route group restructure + login page.

- [x] T003 Move `src/app/driver/layout.tsx` to `src/app/driver/(protected)/layout.tsx` (move file, delete original)
- [x] T004 Move `src/app/driver/page.tsx` to `src/app/driver/(protected)/page.tsx` (move file, delete original)
- [x] T005 Move `src/app/driver/routes/[routeId]/page.tsx` to `src/app/driver/(protected)/routes/[routeId]/page.tsx` (move directory, delete original)
- [x] T006 Create the driver-specific fetch helper in `src/lib/api/fetch-with-driver-auth.ts` — clone `fetchWithAuth` but redirect 401 to `/driver/login` instead of `/admin/login`
- [x] T007 [P] Update `src/app/driver/(protected)/page.tsx` to import `fetchWithDriverAuth` from `@/lib/api/fetch-with-driver-auth` instead of `fetchWithAuth`
- [x] T008 [P] Update `src/app/driver/(protected)/routes/[routeId]/page.tsx` to import `fetchWithDriverAuth` from `@/lib/api/fetch-with-driver-auth` instead of `fetchWithAuth` (4 call sites)
- [x] T009 [P] Update `src/components/driver/route-card.tsx` to import `fetchWithDriverAuth` from `@/lib/api/fetch-with-driver-auth` instead of `fetchWithAuth` (3 call sites)

**Checkpoint**: Route group restructure complete. `next build` and `tsc --noEmit` must pass. URLs `/driver` and `/driver/routes/[id]` still work unchanged in the browser.

---

## Phase 3: User Story 2 — Dedicated Driver Login Page (Priority: P1)

**Goal**: Drivers authenticate through `/driver/login` with driver-branded copy. All driver auth redirects point to `/driver/login`. Admin auth behavior unchanged.

**Independent Test**: Visit `/driver` in browser → redirects to `/driver/login`. Log in with driver credentials → lands on `/driver`. Log in with admin credentials → lands on `/admin`. Driver 401 → `/driver/login`. Admin 401 → `/admin/login`.

### Implementation for User Story 2

- [x] T010 [US2] Create the driver login page at `src/app/driver/login/page.tsx` — reuse the login form behavior from `src/app/admin/login/page.tsx` with driver-specific heading/copy; POST to `/api/admin/auth/login`; on success redirect drivers to `/driver` and non-drivers to `/admin`
- [x] T011 [US2] Update `src/middleware.ts` — add `/driver/login` to the `isLoginPage` exception check; change the unauthenticated `/driver/*` redirect target from `/admin/login` to `/driver/login`
- [x] T012 [US2] Update `src/app/driver/(protected)/layout.tsx` — change the unauthenticated/non-driver redirect from `/admin/login` to `/driver/login`
- [x] T013 [US2] Add `redirectTo` prop to `src/components/admin/logout-button.tsx` — default to `/admin/login`; use prop value instead of hardcoded redirect URL
- [x] T014 [US2] Pass `redirectTo="/driver/login"` to the logout button in `src/app/driver/(protected)/layout.tsx`

**Checkpoint**: Full driver auth flow works in browser. `next build`, `tsc --noEmit`, and `eslint` pass. Admin auth behavior unchanged.

---

## Phase 4: User Story 1 — Driver WebView Screen in Tracker App (Priority: P1)

**Goal**: Driver taps "Open Driver" on the tracker home screen, WebView loads `/driver` (or `/driver/login` if no session), full shift cycle works inside the WebView.

**Independent Test**: Install updated tracker app → "Open Driver" visible when fully provisioned → tap it → WebView loads `/driver/login` → login → complete a shift cycle entirely in the WebView.

**Depends on**: Phase 2 (route group restructure) + Phase 3 (driver login page exists)

### Implementation for User Story 1

- [x] T015 [US1] Create the Driver WebView screen at `apps/van-tracker/app/driver.tsx` — full-screen WebView loading `${apiBaseUrl}/driver` with: `thirdPartyCookiesEnabled`, `domStorageEnabled`, `javaScriptEnabled`, cookie-based session persistence; loading indicator via `startInLoadingState` + `renderLoading`; error state with retry via `renderError`; track `canGoBack` via `onNavigationStateChange`
- [x] T016 [US1] Add the "Open Driver" CTA button to the home screen in `apps/van-tracker/app/index.tsx` — show the button when `isSettingsComplete()` returns true (alongside existing tracking controls); navigate to the `driver` screen via `router.push("/driver")` on press; style consistently with existing buttons

**Checkpoint**: WebView screen loads and driver can log in and use the web flow inside the app. Native tracking controls unchanged.

---

## Phase 5: User Story 4 — External Navigation Opens Natively (Priority: P2)

**Goal**: Google Maps links, `geo:` URIs, and other external URLs open in the native maps app or system browser instead of inside the WebView. Same-origin pages stay in the WebView.

**Independent Test**: Start a shift in the WebView → open exception drawer → tap "Navigate to stop" → native Maps app opens.

**Depends on**: Phase 4 (WebView screen exists)

### Implementation for User Story 4

- [x] T017 [US4] Add `onShouldStartLoadWithRequest` handler to the WebView in `apps/van-tracker/app/driver.tsx` — compare request URL origin against `apiBaseUrl`; allow same-origin and `about:`/`data:` URLs; call `Linking.openURL()` and return `false` for external HTTP URLs and non-HTTP schemes (`geo:`, `waze:`, `comgooglemaps:`)
- [x] T018 [US4] Remove `target="_blank"` and `rel="noopener noreferrer"` from the Google Maps navigation link in `src/components/driver/active-route/exception-drawer.tsx` — keep the same `href` URL; let normal top-level navigation occur so the WebView URL interceptor can handle it

**Checkpoint**: Maps links open natively from the WebView. Same-origin driver pages stay inside the WebView. Browser `/driver` flow still works (link navigates in same tab).

---

## Phase 6: User Story 5 — Native Back Navigation Through WebView History (Priority: P2)

**Goal**: Android back button navigates backward through WebView history before exiting the Driver screen.

**Independent Test**: Navigate login → route list → route detail in WebView → press back → goes to route list → press back → goes to login → press back → exits to tracker home.

**Depends on**: Phase 4 (WebView screen exists)

### Implementation for User Story 5

- [x] T019 [US5] Add `BackHandler` listener to the Driver screen in `apps/van-tracker/app/driver.tsx` — on hardware back press, if `canGoBack` is true call `webViewRef.current.goBack()` and return `true`; if `canGoBack` is false return `false` to let Expo Router handle the back navigation (exit Driver screen)
- [x] T020 [US5] Add injected history shim via `injectedJavaScript` prop on the WebView in `apps/van-tracker/app/driver.tsx` — override `history.pushState` and `history.replaceState` to post navigation state changes to native via `window.ReactNativeWebView.postMessage`; listen for `popstate` events; update `canGoBack` in the `onMessage` handler to track SPA navigations on Android

**Checkpoint**: Back button correctly navigates through 3+ levels of WebView history before exiting.

---

## Phase 7: User Story 3 — App-Wide Keep-Awake (Priority: P2)

**Goal**: Device screen stays on while the app is in the foreground on any screen. Deactivates when backgrounded.

**Independent Test**: Open app → leave idle → screen stays on. Background app → screen sleeps. Return to app → screen stays on again.

**No dependencies on other user stories** (can be implemented in parallel with Phases 4-6)

### Implementation for User Story 3

- [x] T021 [P] [US3] Create the keep-awake hook at `apps/van-tracker/src/hooks/useKeepAwakeWhileForeground.ts` — use `activateKeepAwakeAsync` / `deactivateKeepAwake` from `expo-keep-awake` with a named tag `"tracker-foreground"`; listen to `AppState` changes: activate on `"active"`, deactivate on background/inactive; clean up on unmount
- [x] T022 [US3] Integrate the keep-awake hook in the root layout at `apps/van-tracker/app/_layout.tsx` — call `useKeepAwakeWhileForeground(true)` unconditionally (app-wide, always active while foregrounded)

**Checkpoint**: Screen stays on during foreground use. Sleeps when backgrounded. Existing tracking behavior unchanged.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and final validation

- [x] T023 Run `eslint` across the web app (`src/`) and fix any lint errors
- [x] T024 Run `tsc --noEmit` across the web app and fix any type errors
- [x] T025 Run `next build` and fix any build errors
- [x] T026 Run quickstart.md verification checklist — validate all 15 items pass on device and in browser

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — route group restructure + fetch helper
- **Phase 3 (US2 — Driver Login)**: Depends on Phase 2 — login page needs route group in place
- **Phase 4 (US1 — WebView Screen)**: Depends on Phase 2 + Phase 3 — WebView needs `/driver/login` to exist
- **Phase 5 (US4 — External Nav)**: Depends on Phase 4 — needs WebView screen
- **Phase 6 (US5 — Back Nav)**: Depends on Phase 4 — needs WebView screen
- **Phase 7 (US3 — Keep-Awake)**: Depends on Phase 1 only — can run in parallel with Phases 2-6
- **Phase 8 (Polish)**: Depends on all other phases

### User Story Dependencies

- **US2 (Driver Login)**: Independent — web-only, testable in browser
- **US1 (WebView Screen)**: Depends on US2 (login page must exist for WebView to load)
- **US3 (Keep-Awake)**: Independent — native-only, no dependency on web changes
- **US4 (External Nav)**: Depends on US1 (needs WebView screen to add URL interception)
- **US5 (Back Nav)**: Depends on US1 (needs WebView screen to add back handling)

### Parallel Opportunities

- **T007 + T008 + T009**: Fetch helper swap in 3 different files (after T006)
- **Phase 7 (US3)** can run entirely in parallel with Phases 2-6
- **Phase 5 (US4) + Phase 6 (US5)** can run in parallel after Phase 4 (both modify `driver.tsx` but different concerns — combine if single developer)

---

## Parallel Example: Foundational Phase

```text
# After T006 (fetch helper created), launch in parallel:
T007: Update driver page.tsx to use fetchWithDriverAuth
T008: Update route detail page.tsx to use fetchWithDriverAuth
T009: Update route-card.tsx to use fetchWithDriverAuth
```

## Parallel Example: After Phase 4

```text
# After WebView screen exists, launch in parallel:
Phase 5 (T017-T018): External navigation handling
Phase 6 (T019-T020): Back button handling
# Phase 7 (T021-T022) can also run in parallel (independent)
```

---

## Implementation Strategy

### MVP First (US2 + US1)

1. Complete Phase 1: Setup (install deps)
2. Complete Phase 2: Foundational (route group + fetch helper)
3. Complete Phase 3: US2 (driver login page + auth redirects)
4. Complete Phase 4: US1 (WebView screen + home CTA)
5. **STOP and VALIDATE**: Driver can log in and complete a shift cycle in the WebView
6. Deploy to DEV for validation

### Incremental Delivery

1. Setup + Foundational + US2 + US1 → MVP deployed to DEV
2. Add US4 (external nav) → Maps links work natively
3. Add US5 (back nav) → Back button works correctly
4. Add US3 (keep-awake) → Screen stays on (can be added at any point)
5. Polish → All quality gates pass → PR ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US4 and US5 both modify `apps/van-tracker/app/driver.tsx` — if a single developer implements both, combine into a single pass
- No new database migrations or API endpoints
- `next build` must pass after each web phase (Phases 2, 3, 8)
- Native app requires a dev client rebuild after Phase 1 (native module added)
- Commit after each phase or logical group
