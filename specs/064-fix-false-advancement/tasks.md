# Tasks: Prevent False Stop Advancement From Out-of-Order Device Geofences

**Input**: Design documents from `/specs/064-fix-false-advancement/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — the spec and execution plan explicitly define test cases for each story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Backfill Removal)

**Purpose**: Remove the gap-1 backfill block — prerequisite for all user stories

- [x] T001 Remove the gap-1 backfill block (lines 275-299, "Conservative gap-1 backfill" comment through end of block) in `src/lib/tracking/process-device-geofence-events.ts`
- [x] T002 Replace the backfill test "backfills gap-1 preceding pending stop at confidence 0.80" (lines 397-435) with "does not backfill predecessor" — same two-stop setup (entry-1340 pending, entry-1350 matched), assert 1 stop update (only matched stop), no backfill update in `src/__tests__/tracking/process-device-geofence-events.test.ts`

**Checkpoint**: Backfill removed, existing tests pass with replacement. Run `npm test -- --run src/__tests__/tracking/process-device-geofence-events.test.ts`

---

## Phase 2: User Story 1 — Block Out-of-Order Stop Advancement (Priority: P1) + User Story 2 — Deferred Event Retry (Priority: P1) 🎯 MVP

**Goal**: A geofence event may only mark a stop as passed when it is the first pending stop (head-of-line). Non-adjacent events stay retryable in `received` status.

**Independent Test**: Simulate an out-of-order geofence event and verify no stop changes; then simulate retry after earlier stop is passed.

**Note**: US1 and US2 share the same code change (the `matchedIndex === 0` guard) — they are implemented together but tested independently.

### Implementation

- [x] T003 [US1] [US2] Add contiguous-prefix guard in `processOneEvent` in `src/lib/tracking/process-device-geofence-events.ts`: move the `matchedIndex = pendingStops.findIndex(...)` call to immediately after the confidence check (after line 253), before the mark-as-passed block (line 256). When `matchedIndex > 0`: skip the mark-as-passed update, skip the ledger update to `matched`, do NOT add to `tentativeMatchIds`, and return early from the current event processing
- [x] T004 [US1] Add structured `console.warn` log when `matchedIndex > 0` (deferred non-adjacent event) in `src/lib/tracking/process-device-geofence-events.ts` with fields: `vanId`, `runId`, `eventId`, `placeId`, `matchedScheduleEntryId`, `firstPendingScheduleEntryId`, `matchedSequence`, `firstPendingSequence`

### Tests

- [x] T005 [P] [US1] Add test "defers non-adjacent device geofence match" in `src/__tests__/tracking/process-device-geofence-events.test.ts` — two pending stops (seq 17 and seq 18), event matches seq 18; assert 0 stop updates, 0 event status transitions to `matched`, result array is empty
- [x] T006 [P] [US2] Add test "retries deferred event after earlier stop is passed" in `src/__tests__/tracking/process-device-geofence-events.test.ts` — configure mock with existing `received` event for seq 18, pending stops has only seq 18 (seq 17 already passed/removed from pending); assert 1 stop update with `status: passed`, event transitions to `matched`, result contains event ID
- [x] T007 [P] [US2] Add test "deferred event remains deferred across multiple retries" in `src/__tests__/tracking/process-device-geofence-events.test.ts` — call `processDeviceGeofenceEvents` three times: first two calls with seq 17 still pending (event stays deferred, 0 stop updates each time), third call with seq 17 removed from pending (event succeeds, 1 stop update)

**Checkpoint**: Core fix complete. Out-of-order events are blocked and retried correctly. Run `npm test -- --run src/__tests__/tracking/process-device-geofence-events.test.ts`

---

## Phase 3: User Story 3 — Defense-in-Depth Acknowledgement (Priority: P2)

**Goal**: `processedEventIds` in the tracking API response only includes events whose matched stops are in the contiguous passed prefix.

**Independent Test**: Query ack results against a route with non-contiguous passed stops; verify excluded from response.

### Implementation

- [x] T008 [US3] Harden `appendGeofenceResponse` in `src/app/api/tracking/[vanId]/route.ts`: after the existing passed-stop verification query (lines 260-266), for each distinct `matched_run_id`, load all stops for that run from `route_run_stops` joined with `schedule_entries.stop_sequence`, call `enforceCanonicalPrefix` (import from `src/lib/tracking/enforce-canonical-prefix.ts`), and filter `processedEventIds` to only include events whose `matched_schedule_entry_id` is in the returned `contiguousPassedIds` set

### Tests

- [x] T009 [P] [US3] Create `src/__tests__/tracking/append-geofence-response.test.ts` with test "non-contiguous matched stop excluded from processedEventIds" — mock route_run_stops with stops A (pending), B (passed), C (pending); assert `processedEventIds` is empty (B is not in contiguous prefix)
- [x] T010 [P] [US3] Add test "contiguous matched stops included in processedEventIds" in `src/__tests__/tracking/append-geofence-response.test.ts` — mock route_run_stops with stops A (passed), B (passed) contiguously; assert `processedEventIds` includes both event IDs
- [x] T011 [P] [US3] Add test "duplicate ping with non-contiguous stop returns empty processedEventIds" in `src/__tests__/tracking/append-geofence-response.test.ts` — mock a duplicate ping scenario with a non-contiguous matched stop; assert `processedEventIds: []`

**Checkpoint**: Ack logic hardened. Run `npm test -- --run src/__tests__/tracking/append-geofence-response.test.ts`

---

## Phase 4: User Story 4 — Per-Stop Geofence Radius Tuning (Priority: P2)

**Goal**: Document the SQL commands to set explicit `device_geofence_radius_m` values for dense downtown stops.

**Independent Test**: After SQL execution, query `schedule_entries` and verify custom radius values; confirm tracker-config endpoint returns them.

### Implementation

- [x] T012 [US4] Document the per-stop radius SQL runbook in the PR description: `UPDATE schedule_entries SET device_geofence_radius_m = <TBD> WHERE ...` for CAAB, Forum Ruy Barbosa, and other dense downtown stops identified by GPS trace audit. Note: target radii are TBD pending GPS trace analysis — this task produces the template SQL, not final values

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and final validation

- [x] T013 Run full tracking test suite: `npm test -- --run src/__tests__/tracking`
- [x] T014 [P] Run type check: `npm run typecheck`
- [x] T015 [P] Run lint: `npm run lint`
- [x] T016 Run build: `npm run build`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **US1 + US2 (Phase 2)**: Depends on Phase 1 (backfill removal must be complete before guard is meaningful)
- **US3 (Phase 3)**: Depends on Phase 1 only — can run in parallel with Phase 2
- **US4 (Phase 4)**: No code dependencies — can run in parallel with any phase
- **Polish (Phase 5)**: Depends on Phases 1-3 completion

### User Story Dependencies

- **US1 + US2 (P1)**: Depends on T001 (backfill removal). Core fix.
- **US3 (P2)**: Independent of US1/US2 at code level (different file). Depends only on T001.
- **US4 (P2)**: Fully independent — database config only, no code changes.

### Within Each User Story

- Implementation before tests (tests validate the implementation)
- T003 before T004 (guard before logging)
- T008 before T009-T011 (implementation before ack tests)

### Parallel Opportunities

- T005, T006, T007 can run in parallel (independent test cases, same file but different test blocks)
- T009, T010, T011 can run in parallel (independent test cases in new file)
- T014, T015 can run in parallel (typecheck and lint are independent)
- Phase 3 (US3) can start as soon as Phase 1 is complete, in parallel with Phase 2

---

## Parallel Example: Phase 2 Tests

```text
# After T003 and T004 are complete, launch all US1/US2 tests together:
Task T005: "defers non-adjacent device geofence match" test
Task T006: "retries deferred event after earlier stop is passed" test
Task T007: "deferred event remains deferred across multiple retries" test
```

## Parallel Example: Phase 3

```text
# Phase 3 can start as soon as Phase 1 completes (parallel with Phase 2):
Task T008: Harden appendGeofenceResponse in route.ts

# After T008, launch all US3 tests together:
Task T009: "non-contiguous matched stop excluded" test
Task T010: "contiguous matched stops included" test
Task T011: "duplicate ping with non-contiguous stop" test
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Remove backfill (T001-T002)
2. Complete Phase 2: Contiguous-prefix guard + tests (T003-T007)
3. **STOP and VALIDATE**: All 9+ tests pass, typecheck passes
4. This alone prevents the false advancement bug

### Incremental Delivery

1. Phase 1 (backfill removal) → Foundation ready
2. Phase 2 (US1+US2 guard) → Core bug fixed, MVP deployable
3. Phase 3 (US3 ack hardening) → Defense-in-depth added
4. Phase 4 (US4 radius config) → Operational tuning documented
5. Phase 5 (polish) → Quality gates verified, ready for PR

---

## Notes

- [P] tasks = different files or independent test blocks, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are co-implemented (same guard logic) but tested independently
- US4 is documentation/SQL only — no TypeScript code changes
- Commit after each phase for clean git history
- Stop at any checkpoint to validate independently
