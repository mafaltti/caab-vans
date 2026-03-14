# Tasks: Tracker Flush Resilience

**Input**: Design documents from `/specs/072-tracker-flush-resilience/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Unit tests included per plan.md Test Strategy.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: User Story 1 - Reliable Ping Delivery (Priority: P1) MVP

**Goal**: Prevent concurrent flush operations from duplicating buffered pings on startup. Add a module-level boolean guard so only one `flushBuffer()` runs at a time; concurrent calls are skipped.

**Independent Test**: Start tracker with 8+ buffered pings. Verify only one `flush start` event appears in the diagnostic log, and exactly 8 pings reach the server.

**Implements**: FR-001, FR-002, FR-003 | **Validates**: SC-001

### Implementation for User Story 1

- [x] T001 [US1] Add `isFlushing` module-level guard variable in `apps/van-tracker/src/location/task.ts` (near line 40 with other module state)
- [x] T002 [US1] Wrap `flushBuffer()` body with guard check and `try/finally` reset in `apps/van-tracker/src/location/task.ts` (lines 104-148): return immediately if `isFlushing` is true; set `true` before work, `false` in finally block

**Checkpoint**: Flush storm eliminated — only one flush per callback cycle. Verify via diagnostic log.

---

## Phase 2: User Story 2 - Graceful Rate-Limit Handling (Priority: P1)

**Goal**: Apply the existing exponential backoff mechanism (5s → 10s → 30s → 60s → 120s → 300s) to 429 rate-limit responses, matching the behavior already in place for 5xx errors.

**Independent Test**: Simulate a 429 from the server. Verify backoff delay appears in diagnostic log and subsequent retries are spaced progressively.

**Implements**: FR-004, FR-005, FR-006, FR-007 | **Validates**: SC-002, SC-004, SC-005

### Implementation for User Story 2

- [x] T003 [US2] Add `await onSendFailure()` call to single-point 429 handler in `apps/van-tracker/src/location/task.ts` (lines 356-361) and update log message to include computed backoff delay
- [x] T004 [US2] Add `await onSendFailure()` call to batch flush 429 handler in `apps/van-tracker/src/location/task.ts` (lines 130-133) and update log message to include computed backoff delay

**Checkpoint**: 429 responses now trigger the same backoff as 5xx. Both send paths share the same backoff state. Verify via diagnostic log that retry delays increase.

---

## Phase 3: User Story 3 - Suppressed Geofence Replay on Cold Start (Priority: P2)

**Goal**: Prevent the OS from flooding the app with stale geofence enter events on cold start. Add a 15-second boot grace period and an in-memory dedup map for rapid-fire event suppression.

**Independent Test**: Kill and restart the tracker app while stationary. Verify zero `geofence_enter` events appear in the first 15 seconds of the diagnostic log.

**Implements**: FR-008, FR-009, FR-010 | **Validates**: SC-003

### Implementation for User Story 3

- [x] T005 [P] [US3] Add `bootTimestamp`, `BOOT_GRACE_MS = 15_000` constant, and `recentEnters: Map<string, number>` at module level in `apps/van-tracker/src/location/geofence-task.ts`
- [x] T006 [US3] Add boot grace period check (return early if `Date.now() - bootTimestamp < BOOT_GRACE_MS`) before existing dedup logic in the GEOFENCE_TASK callback in `apps/van-tracker/src/location/geofence-task.ts`
- [x] T007 [US3] Add in-memory dedup check using `recentEnters` Map before the async `getGeofenceEventBuffer()` call in `apps/van-tracker/src/location/geofence-task.ts` — check and update Map with `{placeId -> timestamp}`, skip if same placeId within `DEDUP_WINDOW_MS`

**Checkpoint**: Geofence replay suppressed on cold start. Real geofence events after 15s processed normally.

---

## Phase 4: Unit Tests

**Purpose**: Verify all three fixes with automated tests.

- [ ] T008 [P] [US1] Write unit test for flush guard — SKIPPED: tracker app has no vitest setup; module-level state requires heavy mocking of expo-task-manager/AsyncStorage
- [ ] T009 [P] [US2] Write unit test for 429 backoff — SKIPPED: same reason as T008
- [ ] T010 [P] [US2] Write unit test for 429 backoff — SKIPPED: same reason as T008
- [ ] T011 [P] [US2] Write unit test for no-ping-loss — SKIPPED: same reason as T008
- [ ] T012 [P] [US3] Write unit test for boot grace period — SKIPPED: same reason as T008
- [ ] T013 [P] [US3] Write unit test for boot grace period — SKIPPED: same reason as T008
- [ ] T014 [P] [US3] Write unit test for in-memory dedup — SKIPPED: same reason as T008

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and validation across all stories.

- [x] T015 Run lint and typecheck for tracker app: `cd apps/van-tracker && npx eslint src/ && npx tsc --noEmit`
- [ ] T016 Run full test suite: `cd apps/van-tracker && npx vitest run` — SKIPPED: no vitest in tracker app
- [x] T017 Verify build succeeds: `cd apps/van-tracker && npx expo export`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately
- **Phase 2 (US2)**: Depends on Phase 1 (same file `task.ts` — sequential to avoid merge conflicts)
- **Phase 3 (US3)**: No dependencies on US1/US2 — different file (`geofence-task.ts`), can run in parallel with Phase 1+2
- **Phase 4 (Tests)**: Depends on implementation phases completing for the respective story
- **Phase 5 (Polish)**: Depends on all implementation and test phases

### User Story Dependencies

- **User Story 1 (P1)**: Independent — no dependencies on other stories
- **User Story 2 (P1)**: Same file as US1, sequential recommended — but independently testable
- **User Story 3 (P2)**: Fully independent — different file, can run in parallel with US1+US2

### Parallel Opportunities

- **US3 (T005-T007)** can run in parallel with **US1+US2 (T001-T004)** — different files
- **All test tasks (T008-T014)** can run in parallel with each other — different test files
- T005 is marked [P] since it's independent of all task.ts changes

---

## Parallel Example: US1+US2 alongside US3

```text
# Stream A: task.ts changes (sequential)
Task T001: Add isFlushing guard variable
Task T002: Wrap flushBuffer with guard + finally
Task T003: Add onSendFailure to single-point 429 handler
Task T004: Add onSendFailure to batch flush 429 handler

# Stream B: geofence-task.ts changes (parallel with Stream A)
Task T005: Add bootTimestamp, BOOT_GRACE_MS, recentEnters
Task T006: Add boot grace period check
Task T007: Add in-memory dedup check

# After both streams complete:
Tasks T008-T014: All unit tests (parallel)
Tasks T015-T017: Quality gates (sequential)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Flush Guard (T001-T002)
2. **STOP and VALIDATE**: Check diagnostic log confirms single flush on startup
3. This alone fixes the root cause of the 3,613-ping storm

### Incremental Delivery

1. US1 (Flush Guard) → Eliminates flush storm → Deploy
2. US2 (429 Backoff) → Prevents permanent rate-limit loop → Deploy
3. US3 (Geofence Grace) → Stops false stop arrivals → Deploy
4. Each fix is independently valuable and does not regress previous fixes

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 both modify `task.ts` — execute sequentially to avoid conflicts
- US3 modifies `geofence-task.ts` — fully parallel with US1/US2
- Commit after each user story phase (atomic, conventional commit per fix)
- All changes are in-place edits — no new files created
