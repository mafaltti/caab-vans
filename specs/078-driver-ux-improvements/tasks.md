# Tasks: Driver UX Improvements

**Input**: Design documents from `/specs/078-driver-ux-improvements/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/pin-auth-api.md

**Tests**: Not requested in feature specification. No test tasks included.

**Organization**: Tasks grouped by user story in priority order. US3 → US1 → US4 → US2 → US5 → US6 → US7 → US8 → US9 → US10.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: US3 — Header Home Link (Priority: P1)

**Goal**: Make the "CAAB Vans" header title a navigation link to the driver home page.

**Independent Test**: Tap the header title from any driver page; verify it navigates to `/driver`.

- [x] T001 [US3] Wrap the `<h1>CAAB Vans</h1>` in a `<Link href="/driver">` in `src/app/driver/(protected)/layout.tsx`. Import `Link` from `next/link`. Preserve existing className on the h1.

**Checkpoint**: Header title navigates to driver home from any protected driver page.

---

## Phase 2: US1 — Seamless Shift Navigation (Priority: P1)

**Goal**: Auto-navigate to active route after shift start. Cold-start dialog cannot be dismissed without confirming a stop.

**Independent Test**: Start a shift (normal and cold-start); verify the app navigates to the active route page automatically.

- [x] T002 [US1] Make cold-start dialog non-dismissible in `src/components/driver/route-card.tsx`: Remove the "Pular" outline button from the cold-start dialog footer. Set the Dialog's `onOpenChange` to a no-op function `() => {}` to prevent ESC/backdrop close. The driver must select a stop and confirm — no escape hatch.

- [x] T003 [US1] Add auto-navigation after shift start in `src/components/driver/route-card.tsx`: Import and call `useRouter()` from `next/navigation`. In the normal start flow (after `applyStartData(data)` succeeds, around line 136), call `router.push(\`/driver/routes/${route.id}\`)`. In the cold-start flow (after `handleConfirmColdStart` succeeds, around line 163), call `router.push(\`/driver/routes/${route.id}\`)` after closing the dialog.

**Checkpoint**: Starting a shift (normal or cold-start) auto-navigates to the active route page. Cold-start dialog cannot be dismissed without selecting a stop.

---

## Phase 3: US4 — Route List Auto-Refresh (Priority: P1)

**Goal**: Route list refreshes automatically every 30 seconds. Optimistic updates after shift start/end.

**Independent Test**: Open route list; wait 30s; verify data refreshes without manual action.

- [x] T004 [US4] Create TanStack Query hook for driver routes in `src/lib/queries/use-driver-routes.ts`. Define `useDriverRoutes()` hook with: `queryKey: ["driver-routes"]`, `queryFn` calling `fetchWithDriverAuth("/api/driver/routes")` (with AbortSignal), `refetchInterval: 30_000`. Return type should match `{ routes: DriverRoute[], userId: string }`. Follow the pattern in `src/lib/queries/use-routes.ts`.

- [x] T005 [US4] Migrate `src/app/driver/(protected)/page.tsx` to use `useDriverRoutes()` hook. Remove manual state (`routes`, `userId`, `loading`, `didFetch` ref) and the `useEffect` fetch. Convert the component from server to `"use client"`. Derive `routes`, `userId`, and loading state from the query result. Update `handleRouteUpdate` to use `queryClient.setQueryData(["driver-routes"], ...)` for optimistic updates after shift start/end (update the specific route in the cached data). Keep the existing RouteCard rendering logic.

**Checkpoint**: Route list auto-refreshes every 30s. Shift start/end immediately reflects in the list without waiting for next poll.

---

## Phase 4: US2 — Auto-Redirect to Active Shift (Priority: P1)

**Goal**: Redirect driver to active route page on login, page load, or navigation to route list if a shift is active.

**Independent Test**: Log in with an active shift; verify redirect to active route without manual navigation.

**Depends on**: Phase 3 (US4) — needs query-based data from `useDriverRoutes()`.

- [x] T006 [US2] Add auto-redirect logic to `src/app/driver/(protected)/page.tsx`. Add a `useEffect` watching the query data: when `data` is available, check `data.routes.find(r => r.activeShift?.driverId === data.userId)`. If found, call `router.replace(\`/driver/routes/${activeRoute.id}\`)`. Use `router.replace` (not `push`) to avoid cluttering browser history. Guard with a ref to prevent redirect loops during navigation transitions.

**Checkpoint**: Drivers with active shifts are redirected to their active route on login, browser refresh, or navigating back to route list.

---

## Phase 5: US5 — Route Progress Indicator (Priority: P2)

**Goal**: Show "{completed} de {total} paradas" with a visual progress bar on the active route page.

**Independent Test**: View an active route with some stops passed; verify progress count and bar are correct.

- [x] T007 [US5] Add progress indicator to `src/app/driver/(protected)/routes/[routeId]/page.tsx`. Insert between the header row and the detour banner. Compute `passedCount = (route.progress.passedStopIds?.length ?? 0) + (route.progress.skippedStopIds?.length ?? 0)` and `totalStops = route.schedule.length`. Render a text line `"{passedCount} de {totalStops} paradas"` and below it a thin progress bar: outer `<div>` with `className="h-1.5 w-full rounded-full bg-zinc-200"`, inner `<div>` with `className="h-1.5 rounded-full bg-green-500"` and `style={{ width: \`${(passedCount / totalStops) * 100}%\` }}`. Show only when route is running (`route.progress.runStatus === "in_progress"`).

**Checkpoint**: Active route page shows progress count and bar. Updates on each poll when stops advance.

---

## Phase 6: US6 — Shift Duration Timer (Priority: P2)

**Goal**: Show elapsed shift time on the active route page, updating every second.

**Independent Test**: Start a shift; verify timer appears with correct elapsed time and increments.

- [x] T008 [P] [US6] Create `src/components/driver/active-route/shift-timer.tsx`. Props: `shiftStartedAt: string` (ISO timestamp). Use `useState<string>` for the formatted time and `useEffect` with `setInterval(1000)` to recompute elapsed time from `shiftStartedAt` on each tick. Compute: `const elapsed = Math.floor((Date.now() - new Date(shiftStartedAt).getTime()) / 1000)`, then `hours = Math.floor(elapsed / 3600)`, `minutes = Math.floor((elapsed % 3600) / 60)`. Format: if hours > 0 → `"{hours}h {minutes}min em turno"`, else → `"{minutes} min em turno"`. Handle minutes = 0 as `"0 min em turno"`. Cleanup interval on unmount. Style: `text-xs text-zinc-500`.

- [x] T009 [US6] Integrate `ShiftTimer` into `src/app/driver/(protected)/routes/[routeId]/page.tsx`. Import and render `<ShiftTimer shiftStartedAt={route.progress.shiftStartedAt} />` in the header row, next to the route name. Only render when `route.progress.shiftStartedAt` is truthy.

**Checkpoint**: Active route page shows live shift timer that increments correctly and survives navigation.

---

## Phase 7: US7 — Connection Awareness (Priority: P2)

**Goal**: Show amber warning banner when data is stale (>20s) or device is offline.

**Independent Test**: Disable network while viewing active route; verify banner appears. Re-enable; verify banner dismisses.

- [x] T010 [P] [US7] Create `src/components/driver/active-route/connection-banner.tsx`. Props: `dataUpdatedAt: number` (from TanStack Query). Use `useState<boolean>` for banner visibility and `useEffect` with `setInterval(5000)` to check `(Date.now() - dataUpdatedAt) / 1000 > 20`. Also add `useEffect` to listen to `window.addEventListener("online"/"offline")` events — show banner immediately on `"offline"`, dismiss on `"online"` only if data is also fresh. Render: amber fixed banner at top with text `"Sem conexão — dados podem estar desatualizados"`. Style: `bg-amber-50 border-amber-200 text-amber-800 text-sm p-2 text-center`. Auto-dismiss when `dataUpdatedAt` refreshes within threshold. Cleanup listeners and interval on unmount.

- [x] T011 [US7] Integrate `ConnectionBanner` into `src/app/driver/(protected)/routes/[routeId]/page.tsx`. Extract `dataUpdatedAt` from the `useQuery` return value (destructure alongside `data`, `isLoading`, `error`). Render `<ConnectionBanner dataUpdatedAt={dataUpdatedAt} />` below the header and above the detour banner. Only render when the route is running.

**Checkpoint**: Amber banner appears within 20s of data going stale or immediately on offline event. Dismisses on recovery.

---

## Phase 8: US8 — Stop Advancement Feedback (Priority: P2)

**Goal**: Vibrate and visually highlight when the next stop advances.

**Independent Test**: Trigger a stop advancement (via geofence or manual); verify vibration and pulse animation on NextStopHero.

- [x] T012 [P] [US8] Add `highlighted` prop to `src/components/driver/active-route/next-stop-hero.tsx`. Accept optional `highlighted?: boolean` prop. When `highlighted` is true, apply a CSS animation class (e.g., `animate-pulse` for 2 seconds or a custom scale animation via Tailwind). Apply the animation to the outer container of the hero. The animation should be brief and self-resolving.

- [x] T013 [US8] Add stop advancement detection to `src/app/driver/(protected)/routes/[routeId]/page.tsx`. Add a `useRef<string | null>` to track `previousNextStopId`. Add a `useState<boolean>` for `showStopAdvanced` (default false). In a `useEffect` watching `route.progress.nextStopId`: compare with `previousNextStopId.current`. If different AND `previousNextStopId.current` was not null (skip initial load): call `navigator.vibrate?.(200)`, set `showStopAdvanced = true`, and use `setTimeout(3000)` to set it back to false. Always update `previousNextStopId.current = route.progress.nextStopId`. Pass `highlighted={showStopAdvanced}` to `<NextStopHero>`.

**Checkpoint**: When next stop changes via poll data, device vibrates briefly and NextStopHero pulses for 3 seconds.

---

## Phase 9: US9 — Shift-End Summary (Priority: P2)

**Goal**: Show shift duration, stops passed, and stops skipped in the end-shift confirmation dialog.

**Independent Test**: Tap "End Shift"; verify dialog shows summary with correct duration, passed count, and skipped count.

- [x] T014 [US9] Add shift-end summary to the end-shift dialog in `src/app/driver/(protected)/routes/[routeId]/page.tsx`. In the end-shift confirmation dialog (where "Encerrar Turno" is confirmed), add summary content between the dialog description and the action buttons. Compute: duration from `route.progress.shiftStartedAt` to `Date.now()` (format as `"{X}h {Y}min"` or `"{X} min"`), passed count as `route.schedule.filter(s => s.status === "passed" && s.passedAt && new Date(s.passedAt) >= new Date(route.progress.shiftStartedAt)).length`, skipped count as `route.schedule.filter(s => s.status === "skipped").length`. Render as a simple list: `"Duração: {duration}"`, `"Paradas realizadas: {passed}"`, `"Paradas puladas: {skipped}"`. Style: `text-sm text-zinc-600` with a `border-t pt-3 mt-3` separator.

- [x] T015 [US9] Add shift-end summary to the end-shift dialog in `src/components/driver/route-card.tsx`. Apply the same summary pattern as T014. Since `route-card.tsx` has access to the route object with `activeShift.startedAt` but NOT the full schedule with stop statuses, compute a simpler summary using only the shift duration (from `route.activeShift.startedAt`). For stop counts, the route card only has `totalStops` — show duration only, or fetch from query cache if available via `useQueryClient().getQueryData(["driver-route", route.id])`.

**Checkpoint**: Both end-shift dialogs show a summary before confirmation. Active route page dialog shows full summary (duration + stops). Route card dialog shows at minimum the shift duration.

---

## Phase 10: US10 — PIN Login (Priority: P3)

**Goal**: Drivers can authenticate with a 6-digit PIN. Admins can set/generate PINs.

**Independent Test**: Set PIN via admin API; login with PIN pad; verify authentication and redirect.

### Backend

- [x] T016 [US10] Install `bcryptjs` and `@types/bcryptjs` as dependencies. Run `npm install bcryptjs @types/bcryptjs`.

- [x] T017 [US10] Create database migration `supabase/migrations/00024_driver_pins.sql` (verify next available migration number first). SQL: `CREATE TABLE driver_pins (user_id UUID PRIMARY KEY REFERENCES auth.users(id), pin_hash TEXT NOT NULL, pin_digest CHAR(64) NOT NULL UNIQUE, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()); ALTER TABLE driver_pins ENABLE ROW LEVEL SECURITY;` — No RLS policies (service-role only access).

- [x] T018 [P] [US10] Create PIN set/reset endpoint at `src/app/api/admin/drivers/[userId]/pin/route.ts`. POST handler: `requireRole("admin")`. Validate body with Zod: `pin: z.string().regex(/^\d{6}$/)`. Verify target user exists and has `role === "driver"` via `supabase.auth.admin.getUserById()`. Compute `pin_hash` (bcrypt hash, 10 rounds) and `pin_digest` (SHA-256 hex). Upsert into `driver_pins` (ON CONFLICT user_id DO UPDATE). Catch unique violation on `pin_digest` → return 409 CONFLICT `"Este PIN já está em uso"`. Return 200 `{ message: "PIN definido com sucesso" }`. Follow error patterns from `src/lib/api/errors.ts`.

- [x] T019 [P] [US10] Create PIN generate endpoint at `src/app/api/admin/drivers/[userId]/generate-pin/route.ts`. POST handler: `requireRole("admin")`. Generate random 6-digit PIN via `crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')`. Delegate to the same hash+upsert logic as T018. Retry up to 3 times on unique constraint violation. Return 200 `{ pin: "XXXXXX", message: "PIN gerado com sucesso" }` — PIN shown once only. Verify target user is a driver.

- [x] T020 [US10] Create PIN login endpoint at `src/app/api/driver/auth/pin-login/route.ts`. POST handler (no auth required). Validate body with Zod: `pin: z.string().regex(/^\d{6}$/)`. Apply rate limiting using `createRateLimiter({ windowMs: 60_000, maxRequests: 5 })` keyed by client IP (`request.headers.get("x-forwarded-for")` or fallback). Compute SHA-256 of input PIN → query `driver_pins` by `pin_digest` using service client. If no match → 401 `"PIN inválido"`. Verify bcrypt hash as confirmation. Fetch user via `auth.admin.getUserById(user_id)` → check `role === "driver"` and `is_active !== false`. Create session via `auth.admin.generateLink({ type: "magiclink", email })` → extract `hashed_token` → call `sessionClient.auth.verifyOtp({ token_hash, type: "magiclink" })` to establish session cookie. Return 200 with user info. All errors return generic `"PIN inválido"`.

### Frontend

- [x] T021 [US10] Redesign `src/app/driver/login/page.tsx` with PIN pad as primary login. Add state: `loginMode: "pin" | "email"` (default `"pin"`), `pinDigits: string` (accumulator), `pinError: string | null`, `pinLoading: boolean`. PIN pad view: title "CAAB Vans Motorista", 6 dot indicators (filled/empty based on `pinDigits.length`), 3x4 numpad grid (1-9, clear, 0, backspace) with large touch targets (min `h-14 w-14`). On reaching 6 digits: auto-submit POST to `/api/driver/auth/pin-login`. On success: `window.location.href = "/driver"`. On error: show error, clear digits. Below pad: `"Entrar com e-mail"` link toggles to email mode. Email mode: show existing email/password form. Below form: `"Voltar ao PIN"` link toggles back. Preserve existing email login logic.

- [x] T022 [US10] Add PIN management UI to the admin driver management screen. Find the existing admin page that lists/manages drivers (search for the page that uses `GET /api/admin/drivers` or `GET /api/admin/users`). Add per-driver PIN actions: a `"Gerar PIN"` button that calls `POST /api/admin/drivers/{userId}/generate-pin` and shows the returned PIN once in a modal/alert. A `"Definir PIN"` button that opens a dialog with a 6-digit input field and calls `POST /api/admin/drivers/{userId}/pin`. Show `"PIN definido"` or `"Sem PIN"` indicator per driver (based on a new optional field from the drivers API or a separate check). Handle 409 conflict errors with appropriate user-facing message.

**Checkpoint**: Full PIN login flow works end-to-end. Admin can generate/set PINs. Driver can login with PIN pad. Rate limiting blocks after 5 failed attempts.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [x] T023 Run all quality gates: `npx eslint .`, `npx tsc --noEmit`, `npm run build`, `npx vitest`. Fix any errors.
- [x] T024 Manual smoke test of complete flow per `specs/078-driver-ux-improvements/quickstart.md` testing checklist.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US3)**: No dependencies — can start immediately
- **Phase 2 (US1)**: No dependencies — can start immediately, can run in parallel with Phase 1
- **Phase 3 (US4)**: No dependencies — can start immediately, can run in parallel with Phases 1-2
- **Phase 4 (US2)**: Depends on Phase 3 (US4) — needs `useDriverRoutes()` query hook
- **Phases 5-9 (US5-US9)**: No dependencies on Phases 1-4 — can start independently and run in parallel with each other
- **Phase 10 (US10)**: No dependencies on Phases 1-9 — can start independently. Internal ordering: T016 → T017 → T018/T019 (parallel) → T020 → T021 → T022
- **Phase 11 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US3 (P1)**: Independent — no dependencies on other stories
- **US1 (P1)**: Independent — no dependencies on other stories
- **US4 (P1)**: Independent — no dependencies on other stories
- **US2 (P1)**: Depends on US4 (needs query-based route data for active shift check)
- **US5 (P2)**: Independent — no dependencies on other stories
- **US6 (P2)**: Independent — no dependencies on other stories
- **US7 (P2)**: Independent — no dependencies on other stories
- **US8 (P2)**: Independent — no dependencies on other stories
- **US9 (P2)**: Independent — no dependencies (shift duration computed inline, not shared from US6)
- **US10 (P3)**: Independent — no dependencies on other stories

### Parallel Opportunities

**Maximum parallelism (Phase 1-3 + 5-10)**:
- US3 (T001) + US1 (T002, T003) + US4 (T004, T005) can all start simultaneously
- Once US4 is done → US2 (T006) can start
- US5 through US9 (T007-T015) can all run in parallel with each other and with Phases 1-4
- US10 (T016-T022) can run in parallel with everything else

**Within US10**:
- T018 and T019 can run in parallel (different API route files)
- T021 and T022 can run in parallel (different page files) after T020

---

## Parallel Example: P2 User Stories

```text
# All five P2 stories can run simultaneously (different files):
Task T007: [US5] Progress indicator in routes/[routeId]/page.tsx
Task T008: [US6] ShiftTimer component in active-route/shift-timer.tsx
Task T010: [US7] ConnectionBanner component in active-route/connection-banner.tsx
Task T012: [US8] NextStopHero highlighted prop in active-route/next-stop-hero.tsx

# Note: T007, T009, T011, T013, T014 all modify routes/[routeId]/page.tsx
# so they must be sequential within that file. Order: T007 → T009 → T011 → T013 → T014
```

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete US3 (T001) — Header home link
2. Complete US1 (T002-T003) — Auto-navigate after shift start
3. Complete US4 (T004-T005) — Route list auto-refresh
4. Complete US2 (T006) — Auto-redirect to active shift
5. **STOP and VALIDATE**: Test all P1 stories independently
6. **PR 1 → dev**: Navigation flow fixes

### Incremental Delivery

1. **PR 1**: P1 stories (US1-US4) → Navigation flow fixes (frontend only)
2. **PR 2**: P2 stories (US5-US9) → Active route enrichments (frontend only)
3. **PR 3**: US10 backend (T016-T020) → PIN auth migration + API
4. **PR 4**: US10 frontend (T021-T022) → PIN pad + admin UI

### Single Developer Strategy

Follow phases sequentially: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11.
Within the active route page (US5-US9), combine all changes to `routes/[routeId]/page.tsx` in one pass to avoid repeated edits.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The active route page (`routes/[routeId]/page.tsx`) is touched by US5, US6, US7, US8, US9 — coordinate edits
- US10 internal ordering: install deps → migration → API endpoints → frontend
