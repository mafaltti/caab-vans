# Tasks: Cold-Start Stop Confirmation

**Input**: Design documents from `/specs/059-cold-start-confirm/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included for new pure-logic modules (suggestion algorithm, canonical enforcement, seeding) due to data integrity requirements (SC-004). Tests use Vitest, following existing project patterns.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project setup needed — existing codebase. This phase adds Zod schemas used across multiple stories.

- [x] T001 Add `StartShiftBodySchema` and `ConfirmStartStopBodySchema` Zod schemas in `src/lib/validators/route.ts` per contracts/api.md §3

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extract shared helpers from `infer-stop-progress.ts` that the confirm endpoint and existing consumers need. MUST complete before any user story.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Extract canonical prefix enforcement into `src/lib/tracking/enforce-canonical-prefix.ts` — pure function that accepts sorted stops array and returns `{ contiguousPassedIds: Set<string>, healIds: string[], lastPassedStopId: string | null, nextStopId: string | null }`. Port logic from `infer-stop-progress.ts:431-480`
- [x] T003 [P] Extract stop seeding into `src/lib/tracking/seed-route-run-stops.ts` — async function accepting Supabase client, run_id, route_id; performs count check + bulk insert of pending stops. Port logic from `infer-stop-progress.ts:95-133`
- [x] T004 [P] Create `src/lib/tracking/suggest-start-stop.ts` — two-pass suggestion algorithm: (1) filter schedule entries with coordinates within 2km of GPS position using `haversineDistanceMeters` from `src/lib/tracking/haversine.ts`, (2) filter to `scheduled_time <= now + 30min`, sort by `|now - scheduled_time|`, return top suggestion + up to 4 alternatives. Handle no-GPS fallback (time-only, capped at 5, no highlighted suggestion). Use Luxon with `America/Bahia` timezone
- [x] T005 [P] Write unit tests for canonical enforcement in `src/__tests__/lib/tracking/enforce-canonical-prefix.test.ts` — test contiguous prefix extraction, gap healing identification, pointer derivation, empty input, all-passed, all-pending
- [x] T006 [P] Write unit tests for suggestion algorithm in `src/__tests__/lib/tracking/suggest-start-stop.test.ts` — test proximity filter (2km), time ranking, no-GPS fallback (time-only list), no candidates within range, multiple stops at same location disambiguated by time, stops with null coordinates skipped
- [x] T007 Refactor `src/lib/tracking/infer-stop-progress.ts` to import and use `enforceCanonicalPrefix` from `src/lib/tracking/enforce-canonical-prefix.ts` and `seedRouteRunStops` from `src/lib/tracking/seed-route-run-stops.ts`, replacing inline logic at lines 95-133 and 431-480. Preserve all existing behavior — no functional changes
- [x] T008 Verify existing tests pass after refactor — run `pnpm vitest run` and confirm zero regressions

**Checkpoint**: Shared helpers extracted and tested. `infer-stop-progress.ts` uses new helpers. All existing tests pass.

---

## Phase 3: User Story 1 — One-Tap Confirmation of Current Stop (Priority: P1) MVP

**Goal**: Driver starts shift mid-route, sees suggested stop, confirms with one tap, all earlier stops marked as passed, public route view shows correct next stop.

**Independent Test**: Start a shift 2+ hours into the schedule with GPS near a mid-route stop. Confirm the suggested stop. Verify `route_run_stops` has correct passed/pending states and `route_runs` pointers are correct.

### Implementation for User Story 1

- [x] T009 [US1] Modify `src/app/api/routes/[routeId]/start/route.ts` — parse request body with `StartShiftBodySchema` (lat/lng optional), add cold-start detection logic after shift creation: query route_run for passed stop count, check if current time (Luxon, America/Bahia) is 30+ min past first scheduled stop, query schedule entries with non-null `stop_lat`/`stop_lng`. **FR-013 bypass**: if zero schedule entries have coordinates, skip cold-start entirely (no `coldStart` in response). Otherwise, if cold-start detected, call `suggestStartStop()` with GPS coords (from body or fresh van ping from `van_location_pings` within 5 min) and include `coldStart` object in response per contracts/api.md §1. If no cold-start, return existing response shape unchanged
- [x] T010 [US1] Create `src/app/api/routes/[routeId]/confirm-start-stop/route.ts` — POST handler implementing the state machine from data-model.md: (1) auth via `requireAuth()` + driver role check, (2) parse body with `ConfirmStartStopBodySchema`, (3) validate stopId belongs to route's schedule_entries → 400, (4) validate driver has active shift on this run → 403, (5) call `seedRouteRunStops()` if stops missing, (6) idempotency check → 200 no-op if same stopId already confirmed, (7) cold-start invariant: reject 409 if any passed stops exist, (8) geofence guard: reject 409 if any `pass_source IN ('geofence_raw', 'geofence_snapped')` exist, (9) bulk UPDATE all chronologically earlier stops to `status='passed', pass_source='manual', pass_confidence=0.85, passed_at=now()` with `AND status='pending'` guard, (10) call `enforceCanonicalPrefix()` + persist healIds + persist pointers on `route_runs`, (11) return `{ confirmed, nextStopId, lastPassedStopId, passedCount }`
- [x] T011 [US1] Modify `src/components/driver/route-card.tsx` — add browser geolocation acquisition before calling start endpoint: use `navigator.geolocation.getCurrentPosition()` to get coords, pass as `{ lat, lng }` in POST body. Add state for cold-start data (`useState<ColdStartSuggestion | null>(null)`). In `handleStart()` success path, check if response has `coldStart` field — if yes, store in state and open confirmation dialog. Add confirmation dialog using existing Radix Dialog pattern (matching end-shift dialog at lines 218-245): show suggested stop name + time, "Confirmar" primary button that calls `POST /api/routes/{routeId}/confirm-start-stop` with the suggested stop's ID via `fetchWithAuth()`, update local route state on success and close dialog
- [x] T012 [US1] Write unit tests for confirm-start-stop endpoint in `src/__tests__/app/api/routes/confirm-start-stop.test.ts` — test happy path (bulk mark + pointer update), idempotency (same stopId twice → 200), cold-start invariant violation (run has passed stops → 409), geofence guard (geofence passes exist → 409), invalid stopId (→ 400), no active shift (→ 403), seeding when stops missing. Also add start endpoint cold-start tests: (a) no-GPS fallback returns `suggestedStop: null` with up to 5 time-only alternatives (FR-012), (b) no-coordinates route returns no `coldStart` field (FR-013)

**Checkpoint**: Core cold-start flow works end-to-end. Driver starts shift late, sees suggestion, confirms, stops are marked, public view correct.

---

## Phase 4: User Story 2 — Alternative Stop Selection (Priority: P2)

**Goal**: When the system's guess is wrong, driver can pick from a list of alternatives and confirm that instead.

**Independent Test**: Start a shift mid-route, see the suggestion modal, select a different stop from the alternatives list, confirm it, and verify stops before the selected alternative are marked as passed.

### Implementation for User Story 2

- [x] T013 [US2] Extend confirmation dialog in `src/components/driver/route-card.tsx` — below the primary suggestion, render the `alternatives` array as a selectable list (radio buttons or tappable list items). Track selected stop in local state (default to `suggestedStop`). When driver selects an alternative, update the selected stop. "Confirmar" button sends the currently selected stop's ID to confirm-start-stop endpoint. Style alternatives with stop name + time, visually distinct from the primary suggestion

**Checkpoint**: Driver can choose from alternatives. Confirm endpoint already handles any valid stopId — no backend changes needed.

---

## Phase 5: User Story 3 — Dismiss Confirmation (Priority: P2)

**Goal**: Driver can skip the confirmation prompt entirely with zero side effects.

**Independent Test**: Start a shift mid-route, dismiss the modal, verify no stops are marked and geofence progression works normally.

### Implementation for User Story 3

- [x] T014 [US3] Add "Pular" (skip) dismiss button to confirmation dialog in `src/components/driver/route-card.tsx` — secondary/outline button in `DialogFooter` that calls `setShowColdStartDialog(false)` and clears cold-start state. No API call on dismiss. Ensure `onOpenChange` handler also clears state when dialog is closed via overlay click or escape key

**Checkpoint**: Dismiss works cleanly. No side effects, no API calls on skip.

---

## Phase 6: User Story 4 — No Confirmation When Not Needed (Priority: P3)

**Goal**: Confirmation prompt never appears for on-time starts, resumed shifts, or routes without coordinates.

**Independent Test**: Start a shift on time (within 30 min of first stop) — no modal. Start a second shift on a run with progress — no modal. Start a shift on a route with no stop coordinates — no modal.

### Implementation for User Story 4

- [x] T015 [US4] Verify suppression logic in start endpoint (`src/app/api/routes/[routeId]/start/route.ts`) handles all three suppression cases: (a) on-time start (current time < first stop + 30min) → no `coldStart` in response, (b) resumed shift (run already has passed stops) → no `coldStart`, (c) no schedule entries with coordinates → no `coldStart`. Add targeted test cases to `src/__tests__/lib/tracking/suggest-start-stop.test.ts` for time-threshold boundary (29min → no suggestion, 31min → suggestion) and no-coordinates case

**Checkpoint**: All suppression conditions verified. No false-positive prompts.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all stories.

- [x] T016 Run full quality gates: `pnpm eslint . && pnpm tsc --noEmit && pnpm next build && pnpm vitest run`
- [x] T017 Verify `resolve-route-progress.ts` in-memory prefix logic (lines 148-161) can optionally use extracted `enforceCanonicalPrefix` helper — refactor if the function signature fits cleanly, skip if it would require awkward adapter code (KISS)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (Zod schemas) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 completion
- **US2 (Phase 4)**: Depends on US1 (extends the modal created in T011)
- **US3 (Phase 5)**: Depends on US1 (adds dismiss to the modal created in T011)
- **US4 (Phase 6)**: Depends on US1 (verifies suppression in the endpoint modified in T009)
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — core MVP
- **US2 (P2)**: Depends on US1 — extends the confirmation modal
- **US3 (P2)**: Depends on US1 — adds dismiss to the confirmation modal. Can run in parallel with US2 (different dialog sections)
- **US4 (P3)**: Depends on US1 — verifies endpoint suppression logic. Can run in parallel with US2/US3 (different files: tests vs UI)

### Within Each User Story

- Backend before frontend (endpoint before modal)
- Core implementation before tests (except foundational helpers which have parallel tests)

### Parallel Opportunities

**Phase 2 (max parallelism)**:
```
T002 (canonical helper) ║ T003 (seeding helper) ║ T004 (suggestion algo)
T005 (canonical tests)  ║ T006 (suggestion tests)
→ T007 (refactor infer-stop-progress — depends on T002, T003)
→ T008 (verify existing tests — depends on T007)
```

**Phase 3 (sequential)**:
```
T009 (start endpoint) → T010 (confirm endpoint) → T011 (modal UI) → T012 (confirm tests)
```

**Phases 4-6 (partial parallelism)**:
```
T013 (US2 alternatives) ║ T014 (US3 dismiss) ║ T015 (US4 suppression tests)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Zod schemas
2. Complete Phase 2: Extract helpers, write tests, refactor
3. Complete Phase 3: Start endpoint + confirm endpoint + modal
4. **STOP and VALIDATE**: Test cold-start flow end-to-end
5. Deploy to DEV — core bug fix is live

### Incremental Delivery

1. Setup + Foundational → Helpers extracted and tested
2. US1 → Core flow works → Deploy (MVP — fixes the cold-start bug)
3. US2 + US3 → Alternatives + dismiss → Deploy (full modal UX)
4. US4 → Suppression verified → Deploy (edge case coverage)
5. Polish → Quality gates pass → PR ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- No DB migration needed — all required columns/constraints exist
- Tracker app: zero changes
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
