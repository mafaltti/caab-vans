# Tasks: Fix Duplicate Pings

**Input**: Design documents from `/specs/039-fix-duplicate-pings/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included for server-side changes (vitest infrastructure exists). No tests for van-tracker (no test infra).

**Organization**: Tasks grouped by user story. US1 and US2 are both P1 but independent (client vs server). US3-US5 are P2 and can follow in any order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: No new project setup needed. All changes are edits to existing files. This phase is empty.

---

## Phase 2: Foundational (Database Migration)

**Purpose**: The unique constraint migration MUST run before server-side code changes (US2). Client-side changes (US1) have no foundational dependency.

- [x] T001 Create migration `supabase/migrations/00006_dedup_pings.sql` — Step 1: DELETE duplicate rows keeping earliest id per `(van_id, device_ts)`. Step 2: CREATE UNIQUE INDEX `idx_van_location_pings_van_device_ts` ON `van_location_pings (van_id, device_ts)`. See data-model.md for exact SQL.

**Checkpoint**: Migration ready. US1 (client) can start immediately. US2 (server) can start after T001.

---

## Phase 3: User Story 1 — Parked Van Stops Flooding the System (Priority: P1)

**Goal**: Client-side guards in the tracker app to stop duplicate and stationary pings at the source.

**Independent Test**: Simulate stationary GPS for 10 minutes. Database should show ~10 pings (1/min), not ~200.

**FR coverage**: FR-001, FR-002, FR-003, FR-006

### Implementation for User Story 1

- [x] T002 [P] [US1] Add `lastSentTs` module-level variable (init `0`) and `STATIONARY_MAX_INTERVAL = 60_000` constant in `apps/van-tracker/src/location/task.ts` (after existing constants at line 21)
- [x] T003 [US1] Add duplicate timestamp guard in `apps/van-tracker/src/location/task.ts` — after accuracy filter (line 101), before throttle block: `if (point.ts > 0 && point.ts === lastSentTs) return;`
- [x] T004 [US1] Add stale fix guard in `apps/van-tracker/src/location/task.ts` — after duplicate ts guard: `if (Date.now() - point.ts > 60_000) return;`
- [x] T005 [US1] Add stationary suppression in `apps/van-tracker/src/location/task.ts` — inside existing throttle block (after distance calculation, line 112): `if (distance === 0 && elapsed < STATIONARY_MAX_INTERVAL) return;`
- [x] T006 [US1] Track GPS timestamp on success in `apps/van-tracker/src/location/task.ts` — after `lastSentTime = now` (line 141): add `lastSentTs = point.ts;`
- [x] T007 [US1] Update location callback config in `apps/van-tracker/src/location/tracking.ts` — change `timeInterval: 3000` to `5000` and `distanceInterval: 5` to `10` (lines 37-38)

**Checkpoint**: Tracker app now suppresses duplicate, stale, and stationary pings. A parked van sends at most 1 ping/min.

---

## Phase 4: User Story 2 — Server Rejects Duplicate Pings at Database Level (Priority: P1)

**Goal**: Server-side safety net: unique constraint, upsert, strict isNewest, staleness guard.

**Independent Test**: Send two identical POST requests to `/api/tracking/{vanId}` with same `device_ts`. Second returns `duplicate: true`, only one row in DB, no OSRM/stop inference triggered.

**FR coverage**: FR-007, FR-008, FR-009, FR-010, FR-011

**Depends on**: T001 (migration must be applied first)

### Tests for User Story 2

- [x] T008 [P] [US2] Create test file `src/__tests__/tracking/tracking-dedup.test.ts` with tests: (a) upsert returns duplicate indicator for matching `(van_id, device_ts)`, (b) isNewest uses strict `>` not `>=`, (c) staleness guard rejects pings older than 24h, (d) downstream processing only triggers when `isNewest` is strictly true. Use existing mock patterns (mock Supabase client, vi.fn for fetch).

### Implementation for User Story 2

- [x] T009 [US2] Add staleness guard in `src/app/api/tracking/[vanId]/route.ts` — after `deviceTs` computation (line 70), before insert: reject with `apiError("VALIDATION_ERROR", "Ping too old", 400)` if `clampedTs < now - 24 * 60 * 60 * 1000`
- [x] T010 [US2] Replace `.insert()` with `.upsert()` in `src/app/api/tracking/[vanId]/route.ts` (lines 72-83) — use `{ onConflict: "van_id,device_ts", ignoreDuplicates: true }`, add `.select("id").single()`, handle `PGRST116` error code by returning `{ received: true, duplicate: true, ts: Date.now() }`
- [x] T011 [US2] Fix isNewest comparison in `src/app/api/tracking/[vanId]/route.ts` (line 102) — change `>=` to `>`: `DateTime.fromISO(deviceTs) > DateTime.fromISO(latest.device_ts)`
- [x] T012 [US2] Move `inferStopProgress` call inside `if (isNewest)` block in `src/app/api/tracking/[vanId]/route.ts` (currently at lines 152-156, unconditional) — move it after the van update (line 145) but still inside the `if (isNewest)` block

**Checkpoint**: Server rejects duplicates at DB level, skips downstream processing for non-newest pings. Tests pass.

---

## Phase 5: User Story 3 — Tracker Resumes Cleanly After Process Restart (Priority: P2)

**Goal**: Hydrate throttle state from AsyncStorage on cold start so first callback after restart is not unthrottled.

**Independent Test**: Clear module state, verify tracker reads `@lastLat`, `@lastLng`, `@lastSentAt` from storage before evaluating first callback.

**FR coverage**: FR-004

### Implementation for User Story 3

- [x] T013 [US3] Add cold-start hydration in `apps/van-tracker/src/location/task.ts` — at the start of the task callback (after null/error guards, before accuracy filter ~line 98): if `lastSentLat === null`, read `@lastLat`, `@lastLng`, `@lastSentAt` from AsyncStorage via existing `getLastSentAt()` and `AsyncStorage.getItem()`, populate `lastSentLat`, `lastSentLng`, `lastSentTime`

**Checkpoint**: After process restart, throttle state is restored from disk. No burst of unthrottled pings.

---

## Phase 6: User Story 4 — Offline Buffer Does Not Accumulate Duplicates (Priority: P2)

**Goal**: Consecutive dedup in the offline buffer prevents burst of identical pings on reconnect.

**Independent Test**: Simulate offline, receive 20 identical GPS callbacks. Buffer should contain 1 entry, not 20.

**FR coverage**: FR-005

### Implementation for User Story 4

- [x] T014 [US4] Add consecutive dedup check in `addToBuffer()` in `apps/van-tracker/src/storage/buffer.ts` (line 20, before `buffer.push(point)`) — if `buffer.length > 0`, compare last entry's `lat`, `lng`, `ts` against new point; if all match, return early without adding

**Checkpoint**: Offline buffer only stores distinct consecutive points.

---

## Phase 7: User Story 5 — Location Freshness Remains Accurate for Parked Vans (Priority: P2)

**Goal**: Validate that the 1-ping/min stationary rate keeps `location_updated_at` within the 10-minute freshness threshold.

**Independent Test**: Park van with tracker running for 15 minutes. Public UI never shows "Localização desatualizada".

**FR coverage**: (validation of SC-006, no new code)

### Implementation for User Story 5

- [x] T015 [US5] Validate freshness safety margin — confirm `STATIONARY_MAX_INTERVAL` (60s) is well under `STALENESS_THRESHOLD_MINUTES` (10min) in `src/lib/time.ts:13`. Also verify the server writes `location_updated_at` on every accepted (non-duplicate) ping in `src/app/api/tracking/[vanId]/route.ts` (inside `if (isNewest)` block). No code change needed if both hold. Document validation in PR description.

**Checkpoint**: Freshness validated. No risk of false "Localização desatualizada" for parked vans.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T016 Run `npm run lint` and `npm run typecheck` on both root project and `apps/van-tracker`
- [x] T017 Run `npm run build` on root project
- [x] T018 Run `npm test` on root project (vitest — includes new tracking-dedup tests)
- [x] T019 Run `apps/van-tracker` lint and typecheck: `cd apps/van-tracker && npm run lint && npm run typecheck`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (Migration T001)**: No dependencies — can start immediately
- **Phase 3 (US1 — Client guards)**: No dependencies — can start immediately, in parallel with T001
- **Phase 4 (US2 — Server safety net)**: Depends on T001 (migration must exist before upsert code)
- **Phase 5 (US3 — Cold-start hydration)**: Depends on US1 (T002-T006 establish the guard logic that hydration feeds into)
- **Phase 6 (US4 — Buffer dedup)**: No dependencies on other stories — can start after Phase 2
- **Phase 7 (US5 — Freshness validation)**: Depends on US1 (T005 sets the stationary interval)
- **Phase 8 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1, Client)**: Independent — can start immediately
- **US2 (P1, Server)**: Depends on T001 (migration)
- **US3 (P2)**: Depends on US1 (guards must exist to hydrate into)
- **US4 (P2)**: Independent — can start any time
- **US5 (P2)**: Depends on US1 (stationary interval must be set)

### Parallel Opportunities

Within US1: T002, T003, T004 can run in parallel (different insertion points in task.ts, but same file — recommend sequential for safety). T007 is a separate file.

US1 and T001 can run in full parallel (different codebases: tracker app vs migration SQL).

US4 (T014) is fully independent and can run in parallel with everything.

---

## Parallel Example

```bash
# Wave 1 (start immediately, parallel):
T001: Migration 00006_dedup_pings.sql        # supabase/migrations/
T002-T007: US1 client guards                  # apps/van-tracker/

# Wave 2 (after T001 + US1):
T008-T012: US2 server safety net              # src/app/api/tracking/
T013: US3 cold-start hydration                # apps/van-tracker/ (depends on US1)
T014: US4 buffer dedup                        # apps/van-tracker/ (independent)

# Wave 3 (after all stories):
T015: US5 freshness validation
T016-T019: Quality gates
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. T001: Migration (foundational)
2. T002-T007: US1 client guards (stops 99% of the flood)
3. T008-T012: US2 server safety net (catches the rest)
4. **STOP and VALIDATE**: Test with stationary van + duplicate curl requests
5. Deploy to dev

### Incremental Delivery

1. US1 + US2 → Deploy (MVP — flood stopped)
2. US3 (cold-start) → Deploy (cold restart bursts eliminated)
3. US4 (buffer dedup) → Deploy (offline reconnect bursts eliminated)
4. US5 (validation) → Document in PR
5. Quality gates → PR ready

---

## Notes

- T002-T006 all modify the same file (`task.ts`) — execute sequentially to avoid merge conflicts
- T008 (tests) should be written before T009-T012 (TDD for server changes)
- T001 (migration) should be tested on a dev database before merging
- The migration cleanup DELETE may take time on large tables — run during low-traffic window
