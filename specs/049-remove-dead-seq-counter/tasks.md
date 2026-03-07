# Tasks: Remove Dead Sequence Counter

**Input**: Design documents from `/specs/049-remove-dead-seq-counter/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story. Both stories are P1 but US1 (tracker + server removal) must complete before US2 (backward compat verification) can be validated.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Remove dead sequence counter from tracker and server (Priority: P1)

**Goal**: Delete all `seq`-related dead code from the tracker app and server endpoints (~80 lines across 7 files).

**Independent Test**: Tracker app builds without `seq` logic; server accepts pings without `seq` field; no gap detection warnings logged.

### Tracker App Removal

- [x] T001 [P] [US1] Remove `seq` field from `LocationPoint` interface in `apps/van-tracker/src/types.ts` (line 8)
- [x] T002 [P] [US1] Remove all `currentSeq` code from `apps/van-tracker/src/location/task.ts`: declaration (line 47), AsyncStorage hydration (lines 220, 239-241), assignment to point (line 337), increment + persist (lines 353-354), and `resetSequence()` function (lines 410-414)
- [x] T003 [P] [US1] Remove `seq` from request bodies in `apps/van-tracker/src/api/client.ts`: single-ping body (line 49) and batch-ping body (line 127)

### Server Removal

- [x] T004 [P] [US1] Remove `seq` from single-ping endpoint in `src/app/api/tracking/[vanId]/route.ts`: destructuring (line 72), upsert field (line 103), and entire gap detection block (lines 127-145)
- [x] T005 [P] [US1] Remove `seq` upsert field from batch-ping endpoint in `src/app/api/tracking-batch/[vanId]/route.ts` (line 98)

**Checkpoint**: All `seq` code removed. Tracker app and server should build and typecheck cleanly.

---

## Phase 2: User Story 2 - Server remains backward-compatible during rollout (Priority: P1)

**Goal**: Confirm the Zod validator still accepts payloads with `seq` (old clients) and without `seq` (new clients).

**Independent Test**: Manually verify the validator schema in `src/lib/validators/tracking.ts` still has `seq` as optional/nullable.

- [x] T006 [US2] Verify `seq` field is retained as optional in Zod schema in `src/lib/validators/tracking.ts` (line 11) — if accidentally removed during US1, restore it to preserve backward compatibility

**Checkpoint**: Backward compatibility confirmed. Old tracker versions sending `seq` will not be rejected.

---

## Phase 3: Polish & Verification

**Purpose**: Quality gates and final validation.

- [x] T007 Run lint check: `npx eslint .` from repo root and `cd apps/van-tracker && npx eslint .`
- [x] T008 Run typecheck: `npx tsc --noEmit` from repo root and `cd apps/van-tracker && npx tsc --noEmit`
- [x] T009 Run build: `npx next build` from repo root
- [x] T010 Run tests: `npx vitest run` from repo root
- [x] T011 Verify tracker app builds: `cd apps/van-tracker && npx expo export`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately
- **Phase 2 (US2)**: Depends on Phase 1 completion (verification that `seq` was not accidentally removed from validator)
- **Phase 3 (Polish)**: Depends on Phase 1 and Phase 2

### Parallel Opportunities

All tasks in Phase 1 are marked `[P]` — they touch different files and can be executed simultaneously:

```text
# All 5 removal tasks can run in parallel:
T001: apps/van-tracker/src/types.ts
T002: apps/van-tracker/src/location/task.ts
T003: apps/van-tracker/src/api/client.ts
T004: src/app/api/tracking/[vanId]/route.ts
T005: src/app/api/tracking-batch/[vanId]/route.ts
```

### Within Phase 3

Quality gate tasks (T007-T011) should run sequentially — each must pass before proceeding.

---

## Implementation Strategy

### Single-Pass Delivery

This feature is small enough for a single implementation pass:

1. Execute all Phase 1 tasks in parallel (T001-T005)
2. Verify Phase 2 (T006 — quick check)
3. Run all quality gates (T007-T011)
4. Commit and open PR targeting `dev`

---

## Notes

- All Phase 1 tasks are pure deletions — no new code needed
- Line numbers from research.md are verified but may shift if other PRs merge first; use code content to locate
- The `seq` DB column and index are explicitly NOT touched (deferred cleanup)
- Commit message: `chore(tracking): remove dead sequence counter code`
