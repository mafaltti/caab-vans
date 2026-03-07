# Tasks: OSRM Configurable Timeouts

**Input**: Design documents from `/specs/050-osrm-configurable-timeouts/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — unit test for timeout parsing validates FR-005 (invalid value fallback).

**Organization**: Both user stories (operator configurability + better ETAs) are satisfied by the same code change. US2 is automatically achieved when US1 raises the default timeouts. Tasks are organized as a single implementation flow.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project initialization needed — existing codebase, existing file.

_(No setup tasks — this feature modifies an existing module.)_

---

## Phase 2: Foundational

**Purpose**: No foundational/blocking prerequisites — the change is self-contained in one module.

_(No foundational tasks.)_

---

## Phase 3: User Story 1 - Operator configures OSRM timeouts (Priority: P1) MVP

**Goal**: Replace hardcoded OSRM timeouts with env-configurable constants. Raise defaults to 200ms (match) and 300ms (route). Validate invalid values with fallback to defaults.

**Independent Test**: Set `OSRM_ROUTE_TIMEOUT_MS` and `OSRM_MATCH_TIMEOUT_MS` to custom values, verify OSRM client uses them. Unset them, verify defaults (300ms/200ms) are used.

### Implementation for User Story 1

- [x] T001 [US1] Replace hardcoded route timeout (100ms) with env-configurable constant `OSRM_ROUTE_TIMEOUT_MS` (default 300) in `src/lib/tracking/osrm.ts` line 19. Parse via `parseInt(process.env.OSRM_ROUTE_TIMEOUT_MS ?? "300", 10)` with positive-integer validation; fall back to 300 if invalid (NaN, zero, negative).
- [x] T002 [US1] Replace hardcoded match timeout (50ms) with env-configurable constant `OSRM_MATCH_TIMEOUT_MS` (default 200) in `src/lib/tracking/osrm.ts` line 69. Same parsing and validation pattern as T001.
- [x] T003 [US1] Add unit test file `src/__tests__/tracking/osrm-timeouts.test.ts` exercising `parsePositiveInt` directly with representative inputs: (a) valid integer string is parsed correctly, (b) undefined uses fallback, (c) non-numeric string falls back to default, (d) zero falls back to default, (e) negative number falls back to default, (f) trailing non-numeric characters, (g) empty string.
- [x] T004 [US1] Add `OSRM_ROUTE_TIMEOUT_MS` and `OSRM_MATCH_TIMEOUT_MS` to `.env.local.example` in the existing OSRM section (after `OSRM_BASE_URL`), commented out with defaults shown and brief description.

**Checkpoint**: US1 complete. Operator can configure timeouts via env vars. Defaults are raised. Invalid values handled gracefully. All acceptance scenarios from spec verified by unit tests.

---

## Phase 4: User Story 2 - Better ETAs via fewer timeouts (Priority: P1)

**Goal**: End users benefit from more accurate ETAs because the raised default timeouts reduce OSRM fallback frequency.

**Independent Test**: With default config, OSRM success rate improves (more `etaSource: "gps_osrm"` vs `"gps"` responses).

_(No additional implementation tasks — US2 is automatically satisfied by Phase 3. The raised defaults (300ms route, 200ms match) reduce timeout frequency, increasing OSRM hit rate and ETA accuracy.)_

**Checkpoint**: US2 complete via US1 implementation. No separate code needed.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T005 Run quality gates: `npx eslint src/lib/tracking/osrm.ts`, `npx tsc --noEmit`, `npx vitest run src/__tests__/tracking/osrm-timeouts.test.ts`, `npx next build`
- [x] T006 Verify quickstart.md scenarios work: test with custom env values, test rollback to old values (100ms/50ms)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 3 (US1)**: No dependencies — can start immediately
- **Phase 5 (Polish)**: Depends on Phase 3 completion

### Within Phase 3 (User Story 1)

- T001 and T002 can run in parallel (different lines in same file, but same parse pattern — best done sequentially to avoid merge conflicts)
- T003 depends on T001+T002 (tests validate the parsing logic)
- T004 is independent of T001-T003 (different file)

### Parallel Opportunities

```text
T001 → T002 → T003    (sequential: same file, then test)
T004                   (parallel: different file, no dependencies)
```

---

## Implementation Strategy

### MVP (All-in-One)

This feature is small enough to implement in a single pass:

1. T001 + T002: Update `osrm.ts` with configurable timeouts (~5 lines changed)
2. T003: Add unit test (~30-40 lines)
3. T004: Update `.env.local.example` (~3 lines)
4. T005: Run quality gates
5. T006: Manual verification

**Expected total**: ~40-50 lines changed across 3 files.

---

## Notes

- T001 and T002 modify the same file — implement together to avoid partial states
- No database migration needed
- No caller changes needed — `osrmRoute` and `snapToRoad` signatures unchanged
- Batch scripts (`scripts/precompute-stop-distances.ts`, `scripts/compute-time-factors.ts`) are explicitly out of scope
- Commit after T001+T002 together, T003 separately, T004 separately (3 atomic commits)
