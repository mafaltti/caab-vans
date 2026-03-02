# Tasks: Fix Next Stop Mismatch

**Input**: Design documents from `/specs/027-fix-next-stop-mismatch/`
**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: No new test tasks — existing `eta.test.ts` suite covers `computeEta` logic (unchanged). Verification is done via simulation script and quality gates.

**Organization**: Tasks grouped by user story. Both stories share the same code change (2 API route files) but target different acceptance criteria.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: User Story 1 - Passenger sees ETA for all active route stops (Priority: P1) MVP

**Goal**: When a van is running and a stop's scheduled time has passed without geofence trigger, the route card and hero card show the correct pending stop with an ETA.

**Independent Test**: Start a route run, run `npm run tracking:simulate` to send GPS pings that skip a stop's geofence, and confirm ETA is visible on the route card and route detail hero card.

### Implementation for User Story 1

- [x] T001 [P] [US1] Add next stop override logic after progress computation in `src/app/api/routes/route.ts` — when `isRunning && progress?.nextStopId`, find matching entry in `sortedEntries` by ID, override `nextStop` and `currentStopIndex`, use resolved values in JSON response
- [x] T002 [P] [US1] Add next stop override logic after progress computation in `src/app/api/routes/[routeId]/route.ts` — same pattern as T001, mirror the override for the route detail endpoint

**Checkpoint**: Route list and route detail APIs now return the tracking-based next stop when progress is active. ETA guard in UI components passes naturally.

---

## Phase 2: User Story 2 - Consistent stop indication across all UI elements (Priority: P2)

**Goal**: The next stop shown on the route card, hero card, schedule timeline, and progress counter ("Parada X de Y") all reference the same stop.

**Independent Test**: Open the route detail page during an active run where a stop was missed. Verify the timeline highlight, hero card stop name, and progress counter all agree.

### Implementation for User Story 2

> US2 requires no additional code changes — it is fully satisfied by T001 and T002. The timeline already uses `progress.nextStopId`, and the hero card/progress counter use `nextStop` (now resolved from progress). This phase exists only for acceptance verification.

**Checkpoint**: All UI elements agree on the same next stop.

---

## Phase 3: Quality Gates & Verification

**Purpose**: Ensure no regressions and all quality gates pass.

- [x] T003 Run existing test suite (`npm run test`) to confirm no regressions in `eta.test.ts` and other tests
- [x] T004 Run lint (`npm run lint`), typecheck (`npm run typecheck`), and build (`npm run build`) quality gates
- [ ] T005 Run `npm run tracking:simulate` and verify ETA appears on all route cards in the browser

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately
- **Phase 2 (US2)**: Automatically satisfied by Phase 1 — acceptance verification only
- **Phase 3 (Quality Gates)**: Depends on Phase 1 completion

### Parallel Opportunities

- T001 and T002 modify different files and can run in parallel

### Within User Story 1

- T001 and T002 are independent (different files) — both marked [P]
- T003-T005 run sequentially after T001+T002

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Implement T001 + T002 in parallel (both API route files)
2. Run T003-T005 (quality gates + verification)
3. **STOP and VALIDATE**: Simulate tracking, confirm ETA visible
4. US2 is automatically satisfied — verify in browser

### Execution

```bash
# Parallel implementation:
T001: Override nextStop in src/app/api/routes/route.ts
T002: Override nextStop in src/app/api/routes/[routeId]/route.ts

# Sequential verification:
T003: npm run test
T004: npm run lint && npm run typecheck && npm run build
T005: npm run tracking:simulate + browser check
```

---

## Notes

- Both T001 and T002 follow the identical change pattern from plan.md
- No new files created, no components changed
- The `nextStop` variable must be changed from `const` to `let` (or use a new `resolvedNextStop` variable)
- The `currentStopIndex` variable must also be mutable for the override
- The override guard `isRunning && progress?.nextStopId` naturally handles all edge cases (offline van, no route_run, all stops passed)
