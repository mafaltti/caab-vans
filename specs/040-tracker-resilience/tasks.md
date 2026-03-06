# Tasks: Tracker Resilience, Reliability & Observability

**Input**: Design documents from `/specs/040-tracker-resilience/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/batch-tracking-api.md, quickstart.md

**Tests**: Not explicitly requested. Test tasks omitted. Manual testing scenarios in quickstart.md.

**Organization**: Tasks grouped by user story (US1-US6) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: Database migration and shared type/schema changes needed by multiple stories

- [x] T001 Create database migration adding new columns (seq, buffer_size, failure_count, battery_level, network_type) to van_location_pings in `supabase/migrations/00007_tracker_resilience.sql`
- [x] T002 Extend LocationPoint interface with new optional fields (seq, bufferSize, failureCount, batteryLevel, networkType) in `apps/van-tracker/src/types.ts`
- [x] T003 Extend Zod tracking schema with new optional fields in `src/lib/validators/tracking.ts`
- [x] T004 Update existing single-ping endpoint to accept and store new optional fields in `src/app/api/tracking/[vanId]/route.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Batch endpoint — required by US1 flush and deployed together with tracker changes

**CRITICAL**: Batch endpoint must exist before US1 batch flush can work (hard requirement, no fallback)

- [x] T005 Create batch tracking endpoint `POST /api/tracking-batch/[vanId]` per contract in `src/app/api/tracking-batch/[vanId]/route.ts` — accept array of points, upsert individually, run OSRM + inferStopProgress only on newest chronological point, return `{ received, duplicates, ts }`
- [x] T006 Add `sendBatchPing(settings, points)` function to HTTP client in `apps/van-tracker/src/api/client.ts` — single POST with array payload, same timeout and error handling as `sendLocationPing`

**Checkpoint**: Foundation ready — migration applied, types extended, batch endpoint live, batch client ready

---

## Phase 3: User Story 1 — No More Silent Data Loss (Priority: P0) MVP

**Goal**: Eliminate silent data loss from 5xx errors, buffer overflow, stalled requests, and sequential flush storms

**Independent Test**: Simulate server 5xx errors and connectivity loss. Verify zero points permanently lost within buffer capacity. Verify batch flush sends single request.

### Implementation for User Story 1

- [x] T007 [P] [US1] Fix 5xx error handling to buffer current point (add `addToBuffer(point)` in 5xx branch) in `apps/van-tracker/src/location/task.ts`
- [x] T008 [P] [US1] Swap send order: send current real-time point first, then flush buffer in `apps/van-tracker/src/location/task.ts`
- [x] T009 [P] [US1] Increase MAX_BUFFER_SIZE from 50 to 100 and add ring buffer eviction (drop oldest when full) in `apps/van-tracker/src/storage/buffer.ts`
- [x] T010 [P] [US1] Reduce REQUEST_TIMEOUT from 15000 to 10000 ms in `apps/van-tracker/src/api/client.ts`
- [x] T011 [US1] Rewrite `flushBuffer()` to use `sendBatchPing()` instead of sequential loop in `apps/van-tracker/src/location/task.ts` — send all buffered points in single batch, remove successfully sent points from buffer

**Checkpoint**: US1 complete — 5xx errors buffered, current point sent first, 100-point buffer, 10s timeout, batch flush. Deploy server + tracker together.

---

## Phase 4: User Story 2 — Graceful Degradation Under Persistent Failures (Priority: P1)

**Goal**: Exponential backoff on failures, 24h TTL pruning, 401 escalation with driver alert

**Independent Test**: Simulate 30+ min outage — verify backoff intervals increase, expired points pruned, 401 alert shown after 3 consecutive failures

### Implementation for User Story 2

- [x] T012 [P] [US2] Add module-level backoff state (`consecutiveFailures`, `backoffUntil`) with AsyncStorage hydration on cold start in `apps/van-tracker/src/location/task.ts`
- [x] T013 [P] [US2] Add TTL filter in buffer flush: discard points with `ts` older than 24 hours before sending in `apps/van-tracker/src/storage/buffer.ts`
- [x] T014 [US2] Implement exponential backoff logic in task callback: check `backoffUntil` before any send, buffer current point during backoff, schedule increasing delays (5s→10s→30s→60s→2min→5min cap), reset on success in `apps/van-tracker/src/location/task.ts`
- [x] T015 [US2] Add 401 consecutive failure counter: after 3 consecutive 401s, set `authPaused` flag, persist error state for UI alert in `apps/van-tracker/src/location/task.ts`
- [x] T016 [US2] Add 401 escalation alert on home screen: show persistent banner when auth is paused, with "Go to Settings" action button in `apps/van-tracker/app/index.tsx`

**Checkpoint**: US2 complete — tracker backs off during outages, prunes stale points, alerts driver on auth failure

---

## Phase 5: User Story 3 — Driver Awareness of Tracking Failures (Priority: P1)

**Goal**: Detect when Android OS kills background task and alert driver to restart

**Independent Test**: Force-kill background task on Android, reopen app, verify warning within 60 seconds

### Implementation for User Story 3

- [x] T017 [P] [US3] Store `@lastTaskInvocationAt` timestamp on each task callback in `apps/van-tracker/src/location/task.ts` and add getter in `apps/van-tracker/src/storage/tracking-state.ts`
- [x] T018 [US3] Add task kill detection on home screen: on app foreground resume, check if `lastTaskInvocationAt` is stale (> 5 min) while tracking is supposedly enabled, show modal warning "Tracking may have stopped" with "Restart Tracking" action in `apps/van-tracker/app/index.tsx`

**Checkpoint**: US3 complete — driver sees warning when task is silently killed, can restart with one tap

---

## Phase 6: User Story 4 — Operations Observability (Priority: P2)

**Goal**: Piggyback health metadata on pings so operations can detect silently failing trackers

**Independent Test**: Run tracker with degraded connectivity, verify pings contain buffer_size, failure_count, battery_level, network_type fields in server database

### Implementation for User Story 4

- [x] T019 [US4] Enrich ping payload with health metadata: read buffer size, consecutive failure count, battery level (from expo-battery if installed, else null), and network type (from NetInfo) before each send in `apps/van-tracker/src/location/task.ts`
- [x] T020 [US4] Add operations query helper: function to flag vans with stale `location_updated_at` (> expected interval) or high `buffer_size`/`failure_count` on latest ping, for use by admin API or dashboard in `src/lib/tracking/tracker-health.ts`

**Checkpoint**: US4 complete — every ping carries health metadata, ops can query tracker health

---

## Phase 7: User Story 5 — Resource Efficiency and Data Integrity (Priority: P2)

**Goal**: Battery-adaptive GPS accuracy and monotonic sequence numbering per route run

**Independent Test**: Simulate low battery (< 20%), verify GPS accuracy downgrades. Verify pings carry incrementing seq numbers that reset on route start.

### Implementation for User Story 5

- [x] T021 [P] [US5] Install `expo-battery` dependency in `apps/van-tracker/package.json`
- [x] T022 [US5] Implement battery-adaptive GPS accuracy: monitor battery level, switch to `Accuracy.Balanced` + `timeInterval: 10000` below 20%, resume `Accuracy.High` + `timeInterval: 5000` above 25% (hysteresis) in `apps/van-tracker/src/location/tracking.ts`
- [x] T023 [P] [US5] Add module-level sequence counter (`currentSeq`) with AsyncStorage hydration, increment on each send, reset to 0 on route start, include `seq` in ping payload in `apps/van-tracker/src/location/task.ts`
- [x] T024 [US5] Add server-side sequence gap detection: on batch and single-ping endpoints, compare incoming `seq` with last stored `seq` for the van, log gaps for operational review in `src/app/api/tracking/[vanId]/route.ts` and `src/app/api/tracking-batch/[vanId]/route.ts`

**Checkpoint**: US5 complete — battery-efficient tracking, sequence gaps detectable server-side

---

## Phase 8: User Story 6 — Foundational Reliability (Priority: P3)

**Goal**: Crash reporting, secure token storage, buffer concurrency safety

**Independent Test**: Trigger crash → verify in Sentry. Inspect storage → verify token not plaintext. Run concurrent buffer ops → verify no corruption.

### Implementation for User Story 6

- [x] T025 [P] [US6] Install `@sentry/react-native` and configure in app entry point with DSN, source maps, and breadcrumbs in `apps/van-tracker/app/_layout.tsx` and `apps/van-tracker/app.json`
- [x] T026 [P] [US6] Install `expo-secure-store` and migrate ingestion token: on app launch, read token from AsyncStorage, write to SecureStore, remove from AsyncStorage; update `getSettings()`/`saveSettings()` to use SecureStore for token in `apps/van-tracker/src/storage/settings.ts`
- [x] T027 [US6] Add in-memory mutex for buffer operations: wrap `addToBuffer()` and `removeFromBuffer()` read-modify-write cycles with a simple async lock to prevent concurrent corruption in `apps/van-tracker/src/storage/buffer.ts`

**Checkpoint**: US6 complete — crashes reported, token secured, buffer race condition eliminated

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [x] T028 Run lint (`eslint`), typecheck (`tsc --noEmit`), and build for both tracker app and server
- [x] T029 Update API contract documentation in `specs/018-expo-tracker-app/contracts/tracking-api.md` to reflect new optional fields and batch endpoint
- [ ] T030 Run quickstart.md validation scenarios end-to-end per `specs/040-tracker-resilience/quickstart.md` — **MANUAL: requires Android device/emulator**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001-T004 complete)
- **US1 (Phase 3)**: Depends on Phase 2 (batch endpoint + client ready)
- **US2 (Phase 4)**: Depends on Phase 1 only (types/schema). Can start in parallel with US1 after Phase 1.
- **US3 (Phase 5)**: Depends on Phase 1 only. Can start in parallel with US1/US2.
- **US4 (Phase 6)**: Depends on Phase 1 (health fields in schema). Can start after Phase 1.
- **US5 (Phase 7)**: Depends on Phase 1 (seq field in schema). New dependency: `expo-battery`.
- **US6 (Phase 8)**: No Phase 1 dependency for Sentry/SecureStore. Buffer mutex depends on US1 buffer changes.
- **Polish (Phase 9)**: Depends on all desired stories complete.

### User Story Independence

- **US1 (P0)**: Requires Phase 2 (batch endpoint). This is the MVP.
- **US2 (P1)**: Independent of US1. Only needs Phase 1 types.
- **US3 (P1)**: Fully independent. Only needs tracking-state.ts.
- **US4 (P2)**: Independent. Needs Phase 1 schema for health columns.
- **US5 (P2)**: Independent. Needs Phase 1 schema for seq column + new dep.
- **US6 (P3)**: Buffer mutex (T027) should run after US1 buffer changes (T009). Sentry/SecureStore are independent.

### Parallel Opportunities

**Within Phase 1**: T001, T002, T003, T004 are on different files — all parallelizable.

**Within US1**: T007, T008, T009, T010 touch different concerns in different files — parallelizable. T011 depends on T008 (send order) and T009 (buffer size).

**Cross-story**: After Phase 1, US2 (T012-T016), US3 (T017-T018), US4 (T019-T020), and US5 (T021-T024) can all start in parallel since they modify different parts of task.ts and different files.

---

## Parallel Example: Phase 1

```text
# All Phase 1 tasks touch different files — run in parallel:
T001: supabase/migrations/00007_tracker_resilience.sql
T002: apps/van-tracker/src/types.ts
T003: src/lib/validators/tracking.ts
T004: src/app/api/tracking/[vanId]/route.ts
```

## Parallel Example: User Story 1

```text
# Quick wins — all touch different lines/concerns:
T007: task.ts (5xx branch fix)
T008: task.ts (send order swap)  — different section from T007
T009: buffer.ts (size + eviction)
T010: client.ts (timeout constant)

# Then sequentially:
T011: task.ts (rewrite flushBuffer to use batch) — depends on T008, T009
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T006)
3. Complete Phase 3: US1 (T007-T011)
4. **STOP and VALIDATE**: Test per quickstart.md Story 1 scenarios
5. Deploy server + tracker together (hard requirement)

### Incremental Delivery

1. Phase 1 + 2 + US1 → **MVP**: No more silent data loss (biggest impact, smallest changes)
2. Add US2 + US3 → **P1**: Graceful degradation + driver awareness
3. Add US4 + US5 → **P2**: Observability + efficiency
4. Add US6 → **P3**: Engineering hygiene
5. Each phase is independently deployable

### Coordinated Deployment Note

US1 (batch endpoint) requires server and tracker to be deployed together. All other stories are tracker-only changes that can be deployed independently.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- T007/T008 both modify task.ts but different sections (5xx branch vs send order) — parallel is safe
- T012/T023 both add module-level state to task.ts — if done in parallel, merge carefully
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
