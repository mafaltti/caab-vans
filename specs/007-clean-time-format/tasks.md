# Tasks: Clean Time Format (Remove Seconds)

**Input**: Design documents from `/specs/007-clean-time-format/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Blocking Prerequisite)

**Purpose**: Add the shared `formatTimeString` utility that all user story tasks depend on

- [x] T001 Add `formatTimeString(time: string): string` function to `src/lib/time.ts` that takes a raw PostgreSQL time string (e.g., `"12:40:00"`) and returns `HH:MM` format (e.g., `"12:40"`) using `.slice(0, 5)` internally. Callers must preserve existing null-safety pattern (`time?.` optional chaining) when invoking this function

**Checkpoint**: Utility function available — user story implementation can now begin in parallel

---

## Phase 2: User Story 1 — Passenger views schedule times without seconds (Priority: P1) 🎯 MVP

**Goal**: All public API endpoints return schedule times in `HH:MM` format so passengers never see seconds

**Independent Test**: Navigate to any public route page and confirm all displayed times use `HH:MM` format without seconds

### Implementation for User Story 1

- [x] T002 [P] [US1] Apply `formatTimeString` to schedule entry time mapping in `src/app/api/routes/route.ts` — format `e.time` in the `entryMapped` array (line ~60) and in the `nextStop` response field so `routes[].nextStop.time` returns `HH:MM`
- [x] T003 [P] [US1] Apply `formatTimeString` to schedule entry time mapping in `src/app/api/routes/[routeId]/route.ts` — format `e.time` in the `entryMapped` array (line ~60) and in the `schedule` response array (line ~92) so `route.nextStop.time` and `route.schedule[].time` return `HH:MM`

**Checkpoint**: Public-facing schedule times are now `HH:MM`. US1 is fully functional and testable independently.

---

## Phase 3: User Story 2 — Admin sees consistent time format (Priority: P2)

**Goal**: All admin schedule API endpoints use `formatTimeString` instead of inline `.slice(0, 5)` for consistent formatting

**Independent Test**: In admin panel, view/create/update schedule entries and confirm times are displayed in `HH:MM` format

### Implementation for User Story 2

- [x] T004 [P] [US2] Replace `.slice(0, 5)` with `formatTimeString` in GET and POST handlers in `src/app/api/admin/routes/[routeId]/schedule/route.ts` — lines 32 and 92
- [x] T005 [P] [US2] Replace `.slice(0, 5)` with `formatTimeString` in PUT handler in `src/app/api/admin/routes/[routeId]/schedule/[entryId]/route.ts` — line 64

**Checkpoint**: Admin schedule times use the same consistent approach. US2 is independently testable.

---

## Phase 4: Polish & Quality Gates

**Purpose**: Verify the full change passes all quality gates

- [x] T006 Run lint, type-check, and build (`npm run lint && npx tsc --noEmit && npm run build`) to verify no regressions
- [x] T007 Run quickstart.md manual validation: start dev server, verify public route pages show `HH:MM`, verify admin schedule CRUD shows `HH:MM`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **User Story 1 (Phase 2)**: Depends on T001 (foundational utility)
- **User Story 2 (Phase 3)**: Depends on T001 (foundational utility) — can run in parallel with US1
- **Polish (Phase 4)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends only on T001. No dependency on US2.
- **User Story 2 (P2)**: Depends only on T001. No dependency on US1.

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- T004 and T005 can run in parallel (different files)
- US1 (Phase 2) and US2 (Phase 3) can run in parallel after T001 completes

---

## Parallel Example: After T001

```bash
# All four endpoint tasks can run in parallel (all different files):
Task T002: "Format time in src/app/api/routes/route.ts"
Task T003: "Format time in src/app/api/routes/[routeId]/route.ts"
Task T004: "Replace .slice in src/app/api/admin/routes/[routeId]/schedule/route.ts"
Task T005: "Replace .slice in src/app/api/admin/routes/[routeId]/schedule/[entryId]/route.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001: Add `formatTimeString` utility
2. Complete T002 + T003: Fix public endpoints
3. **STOP and VALIDATE**: Public pages show `HH:MM` — passengers see clean times
4. Deploy to DEV if ready

### Full Delivery

1. T001 → T002 + T003 + T004 + T005 (all in parallel) → T006 + T007
2. Total: 7 tasks, 6 files touched (1 new function + 5 endpoint updates)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each phase for clean git history
- No new dependencies or schema changes required
