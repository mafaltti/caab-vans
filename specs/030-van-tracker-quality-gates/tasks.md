# Tasks: Van Tracker Quality Gates

**Input**: Design documents from `/specs/030-van-tracker-quality-gates/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, quickstart.md

**Tests**: Not requested — manual verification only.

**Organization**: Tasks grouped by user story. All tasks modify a single file (`apps/van-tracker/package.json`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Run Lint Check (Priority: P1) + User Story 2 - Run Type Check (Priority: P1) 🎯 MVP

**Goal**: Add `lint` and `typecheck` scripts so developers can run each quality gate independently.

**Independent Test**: Run `npm run lint` and `npm run typecheck` from `apps/van-tracker/` — both should exit 0 on the current clean codebase.

### Implementation

- [x] T001 [US1] [US2] Add `lint` and `typecheck` scripts to `apps/van-tracker/package.json`. The `lint` script runs `eslint` (no arguments, matching root project convention). The `typecheck` script runs `tsc --noEmit` (matching root project convention). Insert scripts after the existing `web` script entry.

**Checkpoint**: `npm run lint` exits 0, `npm run typecheck` exits 0 from `apps/van-tracker/`.

---

## Phase 2: User Story 3 - Run All Quality Gates at Once (Priority: P2)

**Goal**: Add a `check` script that runs lint + typecheck in sequence with fast-fail behavior.

**Independent Test**: Run `npm run check` from `apps/van-tracker/` — should exit 0 on clean codebase.

### Implementation

- [x] T002 [US3] Add `check` script to `apps/van-tracker/package.json`. The script runs `npm run lint && npm run typecheck` (fast-fail: stops on first failure, lint runs first as it is faster).

**Checkpoint**: `npm run check` exits 0. Both lint and typecheck ran in sequence.

---

## Phase 3: Verification

**Purpose**: Validate all scripts work correctly per acceptance scenarios.

- [x] T003 Run `npm run lint` from `apps/van-tracker/` and verify exit code 0 (FR-001, FR-004, FR-005)
- [x] T004 Run `npm run typecheck` from `apps/van-tracker/` and verify exit code 0 (FR-002, FR-004)
- [x] T005 Run `npm run check` from `apps/van-tracker/` and verify exit code 0 and both gates execute in sequence (FR-003, FR-004)
- [x] T006 Verify script names match root project conventions: `lint`, `typecheck` (FR-007, SC-004)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1 + US2)**: No dependencies — can start immediately
- **Phase 2 (US3)**: Depends on Phase 1 (uses `lint` and `typecheck` scripts)
- **Phase 3 (Verification)**: Depends on Phase 2

### Parallel Opportunities

- T001 is a single task modifying one file — no parallelism needed
- T003 and T004 can run in parallel (independent verification commands)

---

## Implementation Strategy

### MVP First (Phase 1 Only)

1. Complete T001 → `lint` and `typecheck` available
2. **STOP and VALIDATE**: Both scripts exit 0
3. This alone satisfies Constitution §IV for van-tracker

### Full Delivery

1. Complete T001 → lint + typecheck scripts
2. Complete T002 → combined `check` script
3. Complete T003–T006 → all verified
4. Open PR targeting `dev`

---

## Notes

- Single file change: `apps/van-tracker/package.json`
- No new dependencies required (R5)
- All commands verified during research phase (exits 0 on current codebase)
- Script naming matches root project exactly (R1)
