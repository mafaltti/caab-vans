# Tasks: Mobile Responsiveness & Secure Logout

**Input**: Design documents from `/specs/002-responsive-logout-fix/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: No automated test tasks — testing is manual browser verification per quickstart.md.

**Organization**: Tasks grouped by user story. Each story is independently testable after its phase completes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure that multiple user stories depend on. MUST complete before any user story work begins.

- [x] T001 [P] Add `Cache-Control: no-store` header to the admin middleware response in `src/middleware.ts`. In the existing `middleware()` function, add `response.headers.set("Cache-Control", "no-store")` before both `return` statements (the redirect response for unauthenticated users and the normal response for authenticated users). This ensures all `/admin/*` responses instruct browsers not to cache. Ref: plan.md D2, research.md R2. Satisfies FR-005, FR-006, FR-007.

- [x] T002 [P] Create `fetchWithAuth` utility in `src/lib/api/fetch-with-auth.ts`. Export an async function `fetchWithAuth(url: string, init?: RequestInit): Promise<Response>` that wraps native `fetch()`. After awaiting the response, check if `res.status === 401`; if so, redirect via `window.location.href = "/admin/login"` and return `new Promise(() => {})` to halt callers. Otherwise return the response. Ref: plan.md D3, research.md R3. Satisfies FR-008.

**Checkpoint**: Foundation ready — `Cache-Control` header prevents browser caching on all admin routes; `fetchWithAuth` is available for admin pages to detect expired sessions.

---

## Phase 2: User Story 1 — Secure Logout (Priority: P1) 🎯 MVP

**Goal**: Clicking "Sair" fully invalidates the server-side session, clears cookies, and redirects to login. Failed logouts show an error instead of silently redirecting.

**Independent Test**: Log in as admin → navigate to several admin pages → click "Sair" → verify redirect to login → press browser back button → verify login page shown (not cached admin page). Disconnect network → click "Sair" → verify error message appears and user remains on page.

### Implementation for User Story 1

- [x] T003 [US1] Create the server-side logout API route in `src/app/api/admin/auth/logout/route.ts`. Export an async `POST` handler that: (1) calls `createSessionClient()` from `@/lib/supabase/server`, (2) calls `await supabase.auth.signOut()`, (3) returns `NextResponse.json({ ok: true })` on success, (4) catches errors and returns `apiError("INTERNAL_ERROR", "Failed to sign out", 500)` using the existing error helper from `@/lib/api/errors`. Do NOT use `requireAuth()` — the endpoint should be best-effort even for expired sessions. Follow the contract in `contracts/logout-endpoint.md`.

- [x] T004 [US1] Update `AdminLogoutButton` in `src/components/admin/logout-button.tsx` to: (1) add `loading` and `error` state via `useState`, (2) in `handleLogout`, wrap the logic in try/catch, (3) replace the direct `supabase.auth.signOut()` call with `fetch("/api/admin/auth/logout", { method: "POST" })`, (4) check `res.ok` — if false, set error state and return without redirecting, (5) on success, do `window.location.href = "/admin/login"`, (6) on catch (network error), set error state and return, (7) while loading, disable the button and show "Saindo..." text instead of "Sair", (8) if error, show a red `<p>` with "Falha ao sair" below the button (keep it simple — no toast library needed). Remove the `createBrowserSupabaseClient` import since it's no longer used. Ref: plan.md D6, research.md R6. Satisfies FR-001, FR-002, FR-003, FR-004.

**Checkpoint**: US1 complete. Admin logout now fully invalidates the session server-side. Browser back-button shows login page (due to T001 cache-control). Failed logouts show an error.

---

## Phase 3: User Story 4 — Protected Pages Prevent Stale Access (Priority: P2)

**Goal**: Admin pages detect expired/invalidated sessions on data fetch and redirect to login. Combined with T001 (cache-control), this ensures no stale authenticated content is ever displayed.

**Independent Test**: Log in → open admin vans page → manually delete Supabase cookies in DevTools → trigger a page action that fetches data → verify redirect to login page.

### Implementation for User Story 4

- [x] T005 [P] [US4] Replace `fetch` with `fetchWithAuth` in `src/app/admin/vans/page.tsx`. Import `fetchWithAuth` from `@/lib/api/fetch-with-auth` and replace the existing `fetch("/api/admin/vans")` call (in the `useEffect` data-loading block) with `fetchWithAuth("/api/admin/vans")`. No other changes needed — the response handling (`.json()`, `.then()`) remains the same.

- [x] T006 [P] [US4] Replace `fetch` with `fetchWithAuth` in `src/app/admin/routes/page.tsx`. Import `fetchWithAuth` from `@/lib/api/fetch-with-auth` and replace the `fetch("/api/admin/routes")` call with `fetchWithAuth("/api/admin/routes")`.

- [x] T007 [P] [US4] Replace `fetch` with `fetchWithAuth` in `src/app/admin/announcements/page.tsx`. Import `fetchWithAuth` from `@/lib/api/fetch-with-auth` and replace the `fetch("/api/admin/announcements")` call with `fetchWithAuth("/api/admin/announcements")`.

- [x] T008 [P] [US4] Replace `fetch` with `fetchWithAuth` in `src/app/admin/users/page.tsx`. Import `fetchWithAuth` from `@/lib/api/fetch-with-auth` and replace the `fetch("/api/admin/users")` call with `fetchWithAuth("/api/admin/users")`.

**Checkpoint**: US4 complete. All admin list pages now detect 401 responses and redirect to login. Combined with cache-control (T001), stale authenticated content is never displayed after logout or session expiry.

---

## Phase 4: User Story 2 — Admin Tables Readable on Mobile (Priority: P2)

**Goal**: Admin list tables display primary information and action buttons without horizontal scrolling on 375px-wide screens. Secondary columns are progressively revealed at wider breakpoints.

**Independent Test**: Open each admin list page in browser DevTools at 375px width → verify no horizontal scrollbar → verify primary column and action buttons are visible → widen to 640px → verify additional columns appear → widen to 768px → verify all columns visible.

### Implementation for User Story 2

Column visibility plan (from research.md R4):
- **Vans**: Always show Nome + Ações. Show Token + Última atualização at `sm:`. Show Webhook URL at `md:`.
- **Routes**: Always show Nome + Ações. Show Van at `sm:`.
- **Announcements**: Always show Título + Ações. Show Expira at `sm:`. Show Status at `md:`.
- **Users**: Always show E-mail + Ações. Show Status at `sm:`. Show Papel at `md:`.

- [x] T009 [P] [US2] Add responsive column hiding to the vans list table in `src/app/admin/vans/page.tsx`. For the Token column: add `className="hidden sm:table-cell"` to its `<TableHead>` and corresponding `<TableCell>`. For the Webhook URL column: add `className="hidden md:table-cell"` to its `<TableHead>` and `<TableCell>`. For the Última atualização column: add `className="hidden sm:table-cell"` to its `<TableHead>` and `<TableCell>`. The Nome and Ações columns remain unchanged (always visible).

- [x] T010 [P] [US2] Add responsive column hiding to the routes list table in `src/app/admin/routes/page.tsx`. For the Van column: add `className="hidden sm:table-cell"` to its `<TableHead>` and corresponding `<TableCell>`. Nome and Ações remain unchanged.

- [x] T011 [P] [US2] Add responsive column hiding to the announcements list table in `src/app/admin/announcements/page.tsx`. For the Status column: add `className="hidden md:table-cell"` to its `<TableHead>` and corresponding `<TableCell>`. For the Expira column: add `className="hidden sm:table-cell"` to its `<TableHead>` and `<TableCell>`. Título and Ações remain unchanged.

- [x] T012 [P] [US2] Add responsive column hiding to the users list table in `src/app/admin/users/page.tsx`. For the Papel column: add `className="hidden md:table-cell"` to its `<TableHead>` and corresponding `<TableCell>`. For the Status column: add `className="hidden sm:table-cell"` to its `<TableHead>` and `<TableCell>`. E-mail and Ações remain unchanged.

**Checkpoint**: US2 complete. All four admin list pages show only essential columns on mobile (375px) with no horizontal scroll. Additional columns appear as screen width increases.

---

## Phase 5: User Story 3 — Schedule Editor Usable on Mobile (Priority: P3)

**Goal**: Schedule editor form elements fit within 320px-wide screens without horizontal overflow.

**Independent Test**: Open the schedule editor (via admin routes → edit a route → schedule tab) at 320px viewport width → verify no horizontal scrollbar → verify time input, stop name, and action buttons are accessible and tappable.

### Implementation for User Story 3

- [x] T013 [US3] Make the schedule editor responsive in `src/components/admin/schedule-editor.tsx`. Apply two changes: (1) Change all time input `className="w-20"` to `className="w-16 sm:w-20"` (appears in both the existing-entry display and the add-new-entry form sections). (2) Add `flex-wrap` to the flex containers that hold each schedule entry row — change `className="flex items-center gap-2 ..."` to `className="flex flex-wrap items-center gap-2 ..."` so action buttons can wrap to a second line on very narrow screens. Ref: plan.md D5, research.md R5. Satisfies FR-011, FR-012.

**Checkpoint**: US3 complete. Schedule editor inputs and buttons fit within 320px without overflow.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Quality validation across all user stories.

- [x] T014 Run quality gates: `npx eslint . --ext .ts,.tsx`, `npx tsc --noEmit`, `npm run build`. Fix any lint or type errors introduced by the changes.

- [x] T015 Manual browser testing per `specs/002-responsive-logout-fix/quickstart.md`: (1) Logout flow — login, navigate, click Sair, verify redirect, verify back button shows login page. (2) Error handling — disconnect network, click Sair, verify error message. (3) Responsive tables — 375px viewport on all 4 admin pages, verify no horizontal scroll. (4) Schedule editor — 320px viewport, verify no overflow. (5) Progressive columns — widen from 375px to 640px to 768px, verify columns appear. (6) Touch targets — on 375px viewport, verify all admin table action buttons (edit, delete, copy) and schedule editor inputs meet 44x44px minimum (use DevTools element inspector).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately. T001 and T002 run in parallel.
- **Phase 2 (US1)**: Depends on T001 (cache-control) for back-button prevention. T003 before T004 (API route before button update).
- **Phase 3 (US4)**: Depends on T002 (fetchWithAuth must exist). T005–T008 run in parallel.
- **Phase 4 (US2)**: Depends on Phase 3 completion (same files modified). T009–T012 run in parallel.
- **Phase 5 (US3)**: No dependency on other user stories — can run after Phase 1.
- **Phase 6 (Polish)**: Depends on all phases complete.

### User Story Dependencies

- **US1 (P1)**: Depends on T001 only. Can start after T001 completes. **MVP scope.**
- **US4 (P2)**: Depends on T002 only. Can start after T002 completes. Independent of US1.
- **US2 (P2)**: Depends on US4 completion (shares files with T005–T008). Can run after Phase 3.
- **US3 (P3)**: Independent — only depends on Phase 1. Can run in parallel with US1/US4/US2.

### Parallel Opportunities

```
Phase 1:  T001 ──┐    T002 ──┐
                  │           │
Phase 2:  T003 ──→ T004      │        Phase 5: T013 (independent)
                  │           │
Phase 3:          │    T005 ┬ T006 ┬ T007 ┬ T008
                  │         └──────┴──────┴──┐
Phase 4:          │    T009 ┬ T010 ┬ T011 ┬ T012
                  │         └──────┴──────┴──┐
Phase 6:  T014 ──→ T015                      │
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 + T002 (foundational) — parallel
2. Complete T003 → T004 (US1 logout flow) — sequential
3. **STOP and VALIDATE**: Test logout + back button behavior
4. This alone fixes the critical security vulnerability

### Incremental Delivery

1. T001 + T002 → Foundation ready
2. T003 + T004 → US1 (Secure Logout) — **MVP, deploy-ready**
3. T005–T008 → US4 (401 detection) — security hardening complete
4. T009–T012 → US2 (Responsive tables) — mobile admin usable
5. T013 → US3 (Schedule editor) — mobile polish complete
6. T014 + T015 → Quality validation

### Parallel Team Strategy

With 2 developers after Phase 1:
- **Dev A**: US1 (T003–T004) → US4 (T005–T008) → US2 (T009–T012)
- **Dev B**: US3 (T013) → assist with T014/T015

---

## Notes

- [P] tasks = different files, no dependencies on each other
- [Story] label maps task to its user story for traceability
- US4 and US2 share the same 4 admin page files — US4 must complete before US2 starts
- US3 is fully independent and can run at any point after Phase 1
- Commit after each task or logical group
- No new npm dependencies required
- No database migrations required
- `fetchWithAuth` is applied to initial data-loading GET fetches only (T005–T008). Mutation calls (POST/PUT/DELETE in create/edit dialogs) still use raw `fetch`. This is acceptable because: (a) a failed mutation will be caught on the next data reload which uses `fetchWithAuth`, and (b) the middleware + cache-control blocks navigation to stale pages. A future improvement could extend `fetchWithAuth` to mutation calls.
