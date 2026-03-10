# Tasks: Fix Rate-Limit 429 Cascade

**Input**: Design documents from `/specs/061-fix-rate-limit-cascade/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Not requested. No new test tasks (see research.md R5 — existing server tests mock rate limiter; van-tracker has no test suite).

**Organization**: Tasks grouped by user story. US1 can be deployed independently (server-only). US2 and US3 require a tracker app update and touch the same file.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 — Raise Server Rate Limit (Priority: P1) 🎯 MVP

**Goal**: Raise the per-van rate limit from 25 to 40 requests/minute on both tracking endpoints. Stops Van 02 blackouts immediately without an app update.

**Independent Test**: Deploy to DEV. Monitor Van 02 during a moving route — confirm zero 429 responses at peak ping rates (~25/min). Verify 429 still returned above 40/min.

### Implementation for User Story 1

- [x] T001 [P] [US1] Change `maxRequests: 25` to `maxRequests: 40` on line 11 of `src/app/api/tracking/[vanId]/route.ts`
- [x] T002 [P] [US1] Change `maxRequests: 25` to `maxRequests: 40` on line 11 of `src/app/api/tracking-batch/[vanId]/route.ts`
- [x] T003 [US1] Run quality gates: `npm run lint && npx tsc --noEmit && npm run build && npx vitest run`

**Checkpoint**: Server accepts up to 40 pings/min per van. Can be deployed to DEV immediately. Van 02's peak rate (~25/min) no longer triggers 429s.

---

## Phase 2: User Story 2 — Buffer Rate-Limited Pings (Priority: P2)

**Goal**: When a single-ping request receives a 429 response, save the GPS point to the local buffer instead of dropping it. Prevents permanent data loss.

**Independent Test**: Temporarily lower the server rate limit (or send rapid pings). Confirm 429'd points appear in the buffer and are flushed on the next successful batch cycle.

### Implementation for User Story 2

- [x] T004 [US2] In the single-ping 429 handler (~line 355-358) of `apps/van-tracker/src/location/task.ts`, add `await addToBuffer(point)` and change the log message from "Rate limited — skipping" to "Rate limited — point buffered". Keep `logFail()` call. Do NOT add `onSendFailure()`.

**Checkpoint**: 429'd single pings are preserved in the buffer. No data loss on rate limiting.

---

## Phase 3: User Story 3 — Prevent Backoff Spiral on 429 (Priority: P2)

**Goal**: Stop treating 429 as a server error in the batch-flush path. Remove the `onSendFailure()` call so 429 doesn't trigger exponential backoff (5s → 5min).

**Independent Test**: Simulate a 429 during batch flush. Confirm `consecutiveFailures` is not incremented, `backoffUntil` is not set, and the tracker sends normally on the next cycle.

### Implementation for User Story 3

- [x] T005 [US3] In the `flushBuffer` function's 429 handler (~line 130-132) of `apps/van-tracker/src/location/task.ts`, remove the `await onSendFailure()` call. Keep the comment and the implicit behavior of retaining buffer contents (no `removeFromBuffer` is called, so buffer is already preserved).
- [x] T006 [US3] Run tracker quality gates: `cd apps/van-tracker && npm run lint && npm run typecheck`

**Checkpoint**: 429 responses no longer escalate backoff. Buffer flush retries on next cycle without delay.

---

## Phase 4: Polish & Documentation Updates

**Purpose**: Update active documentation to reflect the new 40/min rate limit (per research.md R4 — only operational and contract docs, not historical records).

- [x] T007 [P] Update rate limit from "25 requests/minute" to "40 requests/minute" on line 191 of `docs/OPERATIONS.md`
- [x] T008 [P] Update rate limit references on lines 78 and 182 of `docs/android-app+tracking/live-tracking-spec.md` (change "25 requests/minute" to "40 requests/minute" and update `maxRequests: 25` to `maxRequests: 40`)
- [x] T009 [P] Update rate limit references on lines 167 and 185 of `docs/android-app+tracking/expo-background-geolocation-app.md` (change "25 req/min" and "25/min" to "40")
- [x] T010 [P] Update rate limit references on lines 121 and 181 of `specs/018-expo-tracker-app/contracts/tracking-api.md` (change "25 req/min" to "40 req/min")
- [x] T011 [P] Update rate limit reference on line 102 of `specs/040-tracker-resilience/contracts/batch-tracking-api.md` (change "25 req/min" to "40 req/min")
- [x] T012 Run final quality gates: `npm run lint && npx tsc --noEmit && npm run build && npx vitest run`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately. Server-only, deployable independently.
- **Phase 2 (US2)**: No dependency on US1 (client-side change). Can start in parallel with US1.
- **Phase 3 (US3)**: Depends on Phase 2 completion (same file, adjacent code). Must run after US2.
- **Phase 4 (Polish)**: Depends on Phase 1 completion (docs should reflect the new value). Can run in parallel with Phases 2-3.

### User Story Dependencies

- **US1 (P1)**: Independent. Server-only. Deploy first.
- **US2 (P2)**: Independent of US1. Modifies `apps/van-tracker/src/location/task.ts` single-ping handler.
- **US3 (P2)**: Same file as US2. Should run after US2 to avoid merge conflicts in the same code region.

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- T007, T008, T009, T010, T011 can all run in parallel (different files)
- US1 (server) and US2+US3 (tracker) touch different codebases entirely — can be developed in parallel

---

## Parallel Example: Phase 1

```text
# Launch both server rate limit changes together:
Task T001: "Change maxRequests to 40 in src/app/api/tracking/[vanId]/route.ts"
Task T002: "Change maxRequests to 40 in src/app/api/tracking-batch/[vanId]/route.ts"
```

## Parallel Example: Phase 4

```text
# Launch all documentation updates together:
Task T007: "Update docs/OPERATIONS.md"
Task T008: "Update docs/android-app+tracking/live-tracking-spec.md"
Task T009: "Update docs/android-app+tracking/expo-background-geolocation-app.md"
Task T010: "Update specs/018-expo-tracker-app/contracts/tracking-api.md"
Task T011: "Update specs/040-tracker-resilience/contracts/batch-tracking-api.md"
```

---

## Implementation Strategy

### MVP First (US1 Only — Server Deploy)

1. Complete Phase 1: T001, T002, T003
2. **STOP and VALIDATE**: Verify zero 429s for Van 02 at peak rate
3. Deploy to DEV → verify → promotion PR to `main`
4. This alone fixes the immediate problem for all existing devices

### Incremental Delivery

1. US1 (server) → Deploy immediately → Van 02 fixed today
2. US2 + US3 (tracker) → Next EAS build → Safety net for future 429s
3. Documentation → Ship with the server change (Phase 4 can merge with Phase 1)

### Deployment Phasing

- **Phase 1 + Phase 4**: Single PR targeting `dev`. Server rate limit + docs.
- **Phase 2 + Phase 3**: Separate commit in tracker app. Requires EAS build + device deployment.
- Both are independently valuable and can be validated separately.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- No new tests per research.md R5 (existing tests mock rate limiter; tracker has no test suite)
- Total: 12 tasks across 4 phases
- US2 and US3 both modify `apps/van-tracker/src/location/task.ts` — run sequentially to avoid conflicts
- Commit after each phase or logical group
