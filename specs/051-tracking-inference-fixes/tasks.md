# Tasks: Tracking Inference Fixes

**Input**: Design documents from `/specs/051-tracking-inference-fixes/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-changes.md, quickstart.md

**Tests**: Required per constitution quality gates (IV) and spec reference ("Add tests before rollout, not after").

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Database migrations and shared type definitions needed by multiple stories

- [x] T001 [P] Create migration `supabase/migrations/00011_stop_confidence_metadata.sql` — add `pass_source text CHECK (pass_source IN ('geofence_raw','geofence_snapped','backfill','manual'))` and `pass_confidence numeric CHECK (pass_confidence >= 0.0 AND pass_confidence <= 1.0)` nullable columns to `route_run_stops`
- [x] T002 [P] Create migration `supabase/migrations/00012_stop_group_id.sql` — add `stop_group_id text` nullable column to `schedule_entries`
- [x] T003 [P] Create migration `supabase/migrations/00013_persist_progress_pointers.sql` — add `last_passed_stop_id uuid REFERENCES schedule_entries(id) ON DELETE SET NULL`, `next_stop_id uuid REFERENCES schedule_entries(id) ON DELETE SET NULL`, and `progress_updated_at timestamptz` nullable columns to `route_runs`
- [x] T004 Add shared types to `src/types/index.ts` — add `TrackingStatus = 'live' | 'stale' | 'missing'`, `PassSource = 'geofence_raw' | 'geofence_snapped' | 'backfill' | 'manual'`, extend `RouteRunStop` with nullable `pass_source: PassSource` and `pass_confidence: number`, `ScheduleEntry` with nullable `stop_group_id: string`, `RouteRun` with nullable `last_passed_stop_id`, `next_stop_id`, `progress_updated_at`, `RouteProgress.etaSource` union with `'segment'`, and add `trackingStatus: TrackingStatus` and `isTrackingFresh: boolean` to `RouteWithStatus`. Note: tracking threshold constants are defined in `tracking-status.ts` (T005), not here

---

## Phase 2: Foundational

**Purpose**: Core helper function used by multiple stories

**⚠️ CRITICAL**: US1 depends on this

- [x] T005 Create a `deriveTrackingStatus(lastGpsFixAt: string | null, now: DateTime): TrackingStatus` helper in `src/lib/tracking/tracking-status.ts` — define and export `TRACKING_LIVE_THRESHOLD_MINUTES = 10` and `TRACKING_STALE_THRESHOLD_MINUTES = 60` constants here (single source of truth for thresholds). Compute `'live'` when age < 10 min, `'stale'` when 10–60 min, `'missing'` when > 60 min or null. Use Luxon with America/Bahia timezone.

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Route Stays Active Despite Stale GPS (Priority: P1) 🎯 MVP

**Goal**: Decouple `isRunning` from GPS freshness. Add `trackingStatus` and `isTrackingFresh` to route API responses so active routes never disappear due to stale GPS.

**Independent Test**: Simulate stale GPS (>10 min) with active shift — route must show `isRunning: true` with `trackingStatus: 'stale'`.

### Tests for User Story 1

- [x] T006 [P] [US1] Add unit tests for `deriveTrackingStatus` in `src/__tests__/tracking/tracking-status.test.ts` — test live (<10 min), stale (10–60 min), missing (>60 min), null (no fix ever), boundary at exactly 10 min and 60 min
- [x] T007 [P] [US1] Add API response shape tests in `src/__tests__/tracking/routes-api.test.ts` — test that route response includes `trackingStatus`, `isTrackingFresh`, and that `isRunning` is `true` when `runStatus === 'in_progress'` and `withinWindow` regardless of GPS age. Test `isRunning` is `false` when shift not active. Test `isTrackingFresh` equals `trackingStatus === 'live'`

### Implementation for User Story 1

- [x] T008 [US1] Update `src/app/api/routes/route.ts` — import `deriveTrackingStatus`, compute `trackingStatus` from `van.last_gps_fix_at`, add `trackingStatus` and `isTrackingFresh` to each route response object. Change `isRunning` derivation from `withinWindow && locationFresh && runStatus === 'in_progress'` to `withinWindow && runStatus === 'in_progress'` (remove `locationFresh` requirement). Note: `RouteWithStatus` type already updated in T004
- [x] T009 [US1] Apply same changes to `src/app/api/routes/[routeId]/route.ts` — identical `trackingStatus`, `isTrackingFresh`, and `isRunning` derivation changes as T008

**Checkpoint**: US1 complete — routes with active shifts no longer disappear when GPS is stale

---

## Phase 4: User Story 2 — Accurate Stop Progress Without False Backfill (Priority: P1)

**Goal**: Confidence-gate stop backfill and implement hybrid raw/snapped position policy. Record pass source and confidence for each stop passage.

**Independent Test**: Send a single ping within stop #5's geofence when stop #2 is expected — stops #1-#4 must NOT be backfilled. Send 2 pings within 5 minutes — backfill should proceed.

### Tests for User Story 2

- [x] T011 [P] [US2] Add confidence gating tests in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: single ping does NOT trigger multi-stop backfill (>1 stop gap), 2 pings within 5-min window DO trigger backfill, single ping DOES backfill for 1-stop gap, backfilled stops have `pass_source: 'backfill'` with lower confidence, direct geofence match has `pass_source: 'geofence_raw'` or `'geofence_snapped'` with higher confidence
- [x] T012 [P] [US2] Add hybrid raw/snapped tests in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: when snap displacement > 50m use raw GPS for geofence check, when snap displacement <= 50m use snapped GPS, raw+snapped agreement yields medium confidence even with single ping, null snapped coordinates falls back to raw

### Implementation for User Story 2

- [x] T013 [US2] Expand `inferStopProgress` signature in `src/lib/tracking/infer-stop-progress.ts` — add optional `snappedLat?: number | null` and `snappedLng?: number | null` parameters. Add `SNAP_DISPLACEMENT_THRESHOLD_M = 50` constant. At the start of geofence matching, compute snap displacement using `haversineDistanceMeters(lat, lng, snappedLat, snappedLng)` and select effective coordinates (raw when displacement > 50m or snapped missing, snapped otherwise)
- [x] T014 [US2] Implement confidence scoring in `src/lib/tracking/infer-stop-progress.ts` — when a geofence match is found, query `van_location_pings` for pings within the last 5 minutes (`CONFIDENCE_PING_WINDOW_MINUTES = 5`) for the van. Count how many fall within the geofence radius. Compute confidence: 1.0 (2+ pings, snapped), 0.9 (2+ pings, raw), 0.8 (1 ping, snapped), 0.7 (1 ping, raw). Check raw+snapped agreement for medium confidence boost. Return `{matchedStopId, source: PassSource, confidence: number}`
- [x] T015 [US2] Replace unconditional backfill with gated backfill in `src/lib/tracking/infer-stop-progress.ts` — only backfill earlier pending stops if: (a) the confirmed stop has high/medium confidence (>= 0.7), OR (b) the skipped stop's scheduled time is overdue by > 15 minutes, OR (c) the gap is only 1 stop. Write `pass_source` and `pass_confidence` on each stop transition (direct match gets geofence source, backfilled stops get `'backfill'` with confidence scaled by gap size per data-model.md scoring table)
- [x] T016 [US2] Update `src/app/api/tracking/[vanId]/route.ts` — pass `snappedLat` and `snappedLng` (already available from OSRM snap) as additional arguments to `inferStopProgress`
- [x] T017 [US2] Update `src/app/api/tracking-batch/[vanId]/route.ts` — same change as T016, pass snapped coordinates to `inferStopProgress`

**Checkpoint**: US2 complete — false backfill reduced, confidence metadata recorded on every stop passage

---

## Phase 5: User Story 3 — Repeated Stops by Logical Group (Priority: P2)

**Goal**: Support `stop_group_id` for grouping repeated stops instead of relying on exact coordinate equality.

**Independent Test**: Create two schedule entries with slightly different coordinates but same `stopGroupId` — they must be treated as the same physical location during geofence matching.

### Tests for User Story 3

- [x] T018 [P] [US3] Add stop grouping tests in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: entries with same `stop_group_id` are grouped together regardless of coordinate differences, entries with null `stop_group_id` fall back to coordinate-based grouping, closest-in-time selection still works within a `stop_group_id` group

### Implementation for User Story 3

- [x] T019 [US3] Update grouping logic in `src/lib/tracking/infer-stop-progress.ts` — change the group key derivation: use `stop_group_id` when present, fall back to `${stop_lat.toFixed(6)},${stop_lng.toFixed(6)}` when null. The geofence check for a group should use the coordinates of the specific entry being evaluated (not averaged)
- [x] T020 [P] [US3] Update Zod schema in `src/lib/validators/schedule-entry.ts` — add optional `stopGroupId: z.string().max(100).nullable().optional()` to both create and update schemas
- [x] T021 [US3] Update `src/app/api/admin/routes/[routeId]/schedule/route.ts` — accept `stopGroupId` from request body (mapped to `stop_group_id` column), include `stopGroupId` in response for both POST (create) and GET (list) handlers
- [x] T022 [US3] Update `src/app/api/admin/routes/[routeId]/schedule/[entryId]/route.ts` — accept `stopGroupId` in PUT handler, include `stopGroupId` in response

**Checkpoint**: US3 complete — repeated stops reliably grouped by logical identifier

---

## Phase 6: User Story 4 — Persisted Progress State (Priority: P2)

**Goal**: Write `last_passed_stop_id` and `next_stop_id` on the route run during ingestion and switch the routes API to read them as the primary source.

**Independent Test**: Run stop inference, then query `route_runs` directly — `last_passed_stop_id` and `next_stop_id` must be populated and match API response.

### Tests for User Story 4

- [x] T023 [P] [US4] Add progress persistence tests in `src/__tests__/tracking/infer-stop-progress.test.ts` — test: after stop passage, `route_runs` row has correct `last_passed_stop_id` and `next_stop_id`. When no stops passed, both are null. `progress_updated_at` is set on each update. Verify pointers update correctly as multiple stops are passed sequentially

### Implementation for User Story 4

- [x] T024 [US4] Persist progress pointers in `src/lib/tracking/infer-stop-progress.ts` — at the end of the function (after computing `lastPassedStopId` and `nextStopId`), add a Supabase `update` call on `route_runs` setting `last_passed_stop_id`, `next_stop_id`, and `progress_updated_at` to `new Date().toISOString()` for the current `run.id`
- [x] T025 [US4] Update `src/app/api/routes/route.ts` to read persisted progress — when fetching route run data, select `last_passed_stop_id`, `next_stop_id`, `progress_updated_at` from `route_runs`. Use `next_stop_id` as the primary source for `progress.nextStopId` instead of re-deriving from `route_run_stops`. Note: `passedStopIds` array must still be queried from `route_run_stops` (only pointers are persisted, not the full list). Fall back to current reconstruction if pointers are null (backward compatible)
- [x] T026 [US4] Apply same read-side changes to `src/app/api/routes/[routeId]/route.ts` — identical to T025

**Checkpoint**: US4 complete — single source of truth for progress state, API reads persisted pointers

---

## Phase 7: User Story 5 — Segment-Aware ETA Fallback (Priority: P3)

**Goal**: Add a new ETA fallback tier between GPS-based and schedule-delay that uses stored OSRM distances and historical time factors for more accurate ETAs when GPS is unavailable.

**Independent Test**: Simulate stale GPS with known `osrm_distance_m` between last passed and next stop — ETA should use segment-based calculation, not uniform schedule delay.

### Tests for User Story 5

- [x] T027 [P] [US5] Add segment-aware fallback tests in `src/__tests__/tracking/eta.test.ts` — test: when GPS unavailable and `osrmDistanceM` is set, uses segment calculation with `etaSource: 'segment'`. When `osrmDistanceM` is null, falls through to schedule fallback. GPS ETA takes priority when available. Time factor is applied to segment estimate. ETA is computed as `lastPassedStop.passedAt + travelMinutes`

### Implementation for User Story 5

- [x] T028 [US5] Extend `Stop` interface in `src/lib/tracking/eta.ts` — add `osrmDistanceM?: number | null` field
- [x] T029 [US5] Implement segment-aware fallback in `src/lib/tracking/eta.ts` — after the GPS branch fails (`gpsConditionsMet` is false) and before `scheduleDelayFallback`: check if last passed stop exists and next stop has `osrmDistanceM`. If so, compute `travelMinutes = (osrmDistanceM / REFERENCE_SPEED_MPS / 60) * timeFactor` where `REFERENCE_SPEED_MPS = 8.3` (from `time-factors.ts`). ETA = `lastPassedStop.passedAt + travelMinutes`. Return with `etaSource: 'segment'`. If `osrmDistanceM` is missing, fall through to schedule fallback
- [x] T030 [US5] Map `osrm_distance_m` to `osrmDistanceM` in route APIs — update the `stops` array construction in both `src/app/api/routes/route.ts` and `src/app/api/routes/[routeId]/route.ts` to include `osrmDistanceM` from `schedule_entries.osrm_distance_m` when building the stops passed to `computeEta`

**Checkpoint**: US5 complete — ETA uses segment distance when GPS unavailable, improving accuracy

---

## Phase 8: User Story 6 — Admin Tracker Health Visibility (Priority: P3)

**Goal**: Expose tracker health metrics through admin van endpoints so admins can identify connectivity issues.

**Independent Test**: Query admin van endpoint — response must include `trackerHealth` object with `staleSinceMinutes`, `bufferSize`, `failureCount`, `isStale`, `isUnhealthy`.

### Tests for User Story 6

- [x] T031 [P] [US6] Add admin tracker health response tests in `src/__tests__/tracking/routes-api.test.ts` — test: admin van list response includes `trackerHealth` object with expected fields (`staleSinceMinutes`, `bufferSize`, `failureCount`, `batteryLevel`, `networkType`, `isStale`, `isUnhealthy`). Test `isUnhealthy` is `true` when stale (>10 min) or `bufferSize > 20` or `failureCount > 3`. Test `isUnhealthy` is `false` when all metrics are healthy

### Implementation for User Story 6

- [x] T032 [P] [US6] Update `src/app/api/admin/vans/route.ts` — import `getTrackerHealthStatuses` from `src/lib/tracking/tracker-health.ts`. In the GET handler, call it and merge the `trackerHealth` object (with fields: `staleSinceMinutes`, `bufferSize`, `failureCount`, `batteryLevel`, `networkType`, `isStale`, `isUnhealthy`) into each van response object
- [x] T033 [P] [US6] Update `src/app/api/admin/vans/[vanId]/route.ts` — same change as T032 for the single-van endpoint, add `trackerHealth` to the van response

**Checkpoint**: US6 complete — admins can see tracker health at a glance

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and final quality checks

- [x] T034 Update `docs/ETA-CONFIGURATION.md` — document the new segment-aware fallback tier, update the ETA source priority chain (GPS → segment → schedule), document `REFERENCE_SPEED_MPS`, and ensure OSRM timeout configuration matches current `osrm.ts` defaults
- [x] T035 Run all quality gates — `npx eslint src/`, `npx tsc --noEmit`, `npm run build`, `npx vitest run`. Verify all 90+ existing tests pass plus new tests. Fix any regressions
- [x] T036 Run quickstart.md validation — follow the setup and testing instructions in `specs/051-tracking-inference-fixes/quickstart.md` end-to-end to verify documentation accuracy

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001, T002, T003 run in parallel; T004 can run in parallel
- **Foundational (Phase 2)**: T005 depends on T004 (needs TrackingStatus type)
- **US1 (Phase 3)**: Depends on T005 (deriveTrackingStatus helper)
- **US2 (Phase 4)**: Depends on T001 (migration 00011 for pass_source/confidence columns) and T004 (PassSource type)
- **US3 (Phase 5)**: Depends on T002 (migration 00012 for stop_group_id column) and T004 (ScheduleEntry type)
- **US4 (Phase 6)**: Depends on T003 (migration 00013 for progress pointer columns) and T004 (RouteRun type)
- **US5 (Phase 7)**: Depends on T004 (etaSource type extension). No migration dependency
- **US6 (Phase 8)**: No dependencies beyond Phase 1 setup — can start immediately after T004
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Independence

- **US1 + US2**: Both P1, but US2 does NOT depend on US1. Can run in parallel.
- **US3**: Independent of US1/US2. Can run in parallel after foundational.
- **US4**: Independent of US1/US2/US3. Can run in parallel after foundational.
- **US5**: Independent. Can run in parallel after foundational.
- **US6**: Independent. Can run in parallel after foundational.

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation tasks within a story are sequential (each builds on prior)
- Tasks marked [P] within a story can run in parallel

### Parallel Opportunities

- **Phase 1**: T001 + T002 + T003 + T004 all in parallel (different files)
- **Phase 3-8**: All 6 user stories can run in parallel after their foundational dependencies are met
- **Within US2**: T011 + T012 in parallel (different test groups)
- **Within US3**: T020 in parallel with T018 (different files)
- **Within US6**: T031 + T032 in parallel (different files)

---

## Parallel Example: After Phase 2

```text
# All 6 user stories can start simultaneously:
Stream A (US1): T006 + T007 → T008 → T009
Stream B (US2): T011 + T012 → T013 → T014 → T015 → T016 → T017
Stream C (US3): T018 + T020 → T019 → T021 → T022
Stream D (US4): T023 → T024 → T025 → T026
Stream E (US5): T027 → T028 → T029 → T030
Stream F (US6): T031 → T032 + T033
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (migrations + types)
2. Complete Phase 2: Foundational (tracking status helper)
3. Complete Phase 3: US1 (decouple isRunning from GPS)
4. **STOP and VALIDATE**: Test that active routes never disappear due to stale GPS
5. Deploy to DEV — highest user-visible impact fix

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (P1) → Routes stay active despite stale GPS → Deploy (MVP!)
3. US2 (P1) → False backfill reduced → Deploy
4. US3 (P2) → Repeated stops reliable → Deploy
5. US4 (P2) → Single source of truth for progress → Deploy
6. US5 (P3) → Better ETA without GPS → Deploy
7. US6 (P3) → Admin fleet health visibility → Deploy
8. Polish → Docs updated, quality gates green → Final deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests must fail before implementing (TDD within each story)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All 6 stories can be parallelized after Phase 2 completes
