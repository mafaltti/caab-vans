# Tasks: Tracking Simplification

**Input**: Design documents from `/specs/065-tracking-simplification/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included where plan.md explicitly calls for new or updated test files.

**Organization**: Tasks grouped by user story. US1 and US3 can run in parallel after Foundational. US2 MUST wait for US1 + US3. US4–US7 are independent.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Shared Helper Extraction)

**Purpose**: Extract the canonical-prefix + pointer-persist helper that US1, US3, and US4 all depend on. MUST complete before any user story work begins.

- [x] T001 Create `persistCanonicalProgress(supabase, runId)` in `src/lib/tracking/persist-canonical-progress.ts` — fetch `route_run_stops` joined with `schedule_entries.stop_sequence`, sort by stop_sequence, call `enforceCanonicalPrefix()`, heal non-contiguous rows to pending, persist `last_passed_stop_id`, `next_stop_id`, `progress_updated_at` on `route_runs`. Return `CanonicalPrefixResult`. See research.md R1 for unified design decisions (`.order()` + JS sort, always persist, log errors).
- [x] T002 Write unit tests for `persistCanonicalProgress` in `src/__tests__/tracking/persist-canonical-progress.test.ts` — cover: all-pending returns first stop as next, contiguous passed prefix computes correct pointers, non-contiguous passed rows are healed to pending, empty run (no stops) is safe, idempotent when called twice.

**Checkpoint**: Shared helper exists, tested, and ready for callers.

---

## Phase 2: User Story 1 — Device Geofence Drives Stop Progression (Priority: P1)

**Goal**: Device geofence events mark stops as passed AND update route_runs progress pointers in one operation.

**Independent Test**: Send a device geofence event for the first pending stop → verify `route_run_stops` marked passed AND `route_runs.next_stop_id` updated.

**Depends on**: Phase 1 (shared helper)

- [x] T003 [US1] Wire `persistCanonicalProgress()` into `processOneEvent()` in `src/lib/tracking/process-device-geofence-events.ts` — call after successful mark-as-passed (after line ~305, before ledger update at line ~308). Only call when `matchedIndex === 0` (head-of-line succeeded). Import from `persist-canonical-progress.ts`.
- [x] T004 [US1] Update tests in `src/__tests__/tracking/process-device-geofence-events.test.ts` — add assertions that after a successful geofence match, `route_runs` pointers (`last_passed_stop_id`, `next_stop_id`, `progress_updated_at`) are updated. Verify deferred events do NOT trigger pointer updates.

**Checkpoint**: Device geofence events now fully own stop progression including pointer persistence.

---

## Phase 3: User Story 3 — Manual Confirmation Uses Shared Helper (Priority: P1)

**Goal**: Manual confirm refactored to use the shared helper instead of inline canonical-prefix logic.

**Independent Test**: Manually confirm stop C → verify A, B, C marked passed with `pass_source = "manual"` and pointers correctly set.

**Depends on**: Phase 1 (shared helper). Can run in PARALLEL with Phase 2 (US1).

- [x] T005 [P] [US3] Refactor `src/app/api/routes/[routeId]/confirm-start-stop/route.ts` — replace inline canonical-prefix enforcement (lines ~192–234: re-fetch, enforceCanonicalPrefix, heal, pointer persist) with a single call to `persistCanonicalProgress(supabase, run.id)` after bulk-marking prior stops. Keep the bulk-mark logic and idempotency check unchanged.
- [x] T006 [P] [US3] Update tests in `src/__tests__/lib/tracking/confirm-start-stop.test.ts` — verify manual confirm still produces correct pointer state using the shared helper. Existing test assertions should pass without change; add assertion that `persistCanonicalProgress` is called.

**Checkpoint**: Manual confirm uses shared helper. Existing behavior preserved.

---

## Phase 4: User Story 2 — GPS Pings No Longer Change Stop Status (Priority: P1)

**Goal**: Remove `inferStopProgress()` calls from GPS ping ingestion. GPS pings store data and update position but never mutate stop status or progress pointers.

**Independent Test**: Send a GPS ping within geofence radius of first stop → verify `route_run_stops` and `route_runs` pointers unchanged.

**Depends on**: Phase 2 (US1) AND Phase 3 (US3) — both progression writers must be fully wired to the shared helper BEFORE removing the GPS inference fallback.

- [x] T007 [US2] Remove `inferStopProgress()` call and its try-catch block from `src/app/api/tracking/[vanId]/route.ts` (lines ~213–226). Remove the import of `inferStopProgress` if no other callers remain in this file.
- [x] T008 [US2] Remove the "retry deferred geofence after GPS inference" branch from `src/app/api/tracking/[vanId]/route.ts` (lines ~228–244). Deferred events now retry naturally when resubmitted on the next ping since `processDeviceGeofenceEvents()` is called at the top of the handler.
- [x] T009 [US2] Remove the sequential `inferStopProgress()` loop from `src/app/api/tracking-batch/[vanId]/route.ts` (lines ~220–237). Remove the import of `inferStopProgress`. GPS batch pings continue to store pings, snap via OSRM, and update van position.
- [x] T010 [US2] Update `src/__tests__/tracking/tracking-batch.test.ts` — add or update assertions verifying that batch ping ingestion does NOT call `inferStopProgress` and does NOT change `route_run_stops` or `route_runs` pointers.

**Checkpoint**: GPS pings no longer mutate stop progress. All stop advancement comes from device geofence or manual confirm only.

---

## Phase 5: User Story 4 — Stops Seeded and Progress Initialized at Shift Start (Priority: P2)

**Goal**: When a driver starts a shift, `route_run_stops` rows are eagerly created and `next_stop_id` is set to the first stop.

**Independent Test**: Start a shift → immediately query route run → verify all stop rows exist as pending and `next_stop_id` is set.

**Depends on**: Phase 1 (shared helper). Independent of US1/US2/US3.

- [x] T011 [US4] Add stop seeding and pointer initialization to `src/app/api/routes/[routeId]/start/route.ts` — after route_run creation/lookup (line ~99), call `seedRouteRunStops(supabase, run.id, route.id)` then `persistCanonicalProgress(supabase, run.id)`. Import both functions. This sets `next_stop_id` to the first pending stop since all stops are "pending" at shift start.
- [x] T012 [US4] Update tests in `src/__tests__/tracking/routes-api.test.ts` — add assertions that after `POST /api/routes/[routeId]/start`, `route_run_stops` rows exist for all schedule entries with status "pending", and `route_runs.next_stop_id` is set to the first stop by stop_sequence order. Test idempotency: starting a second shift on the same service date preserves existing stops (not duplicated) and recomputes `next_stop_id`.

**Checkpoint**: Shift start eagerly seeds stops and initializes progress pointers.

---

## Phase 6: User Story 5 — Read-Side Uses Persisted Progress Only (Priority: P2)

**Goal**: Remove `TRACKING_PROGRESS_SOURCE` multi-mode branching from the progress resolver. Always use persisted pointer with self-heal fallback.

**Independent Test**: Query route progress → verify ETA targets persisted `next_stop_id` regardless of any environment variable.

**Depends on**: Phase 1 (shared helper for self-heal). Independent of other stories.

- [x] T013 [US5] Simplify `src/lib/tracking/resolve-route-progress.ts` — remove `parseProgressSource()` function and `process.env.TRACKING_PROGRESS_SOURCE` read. Remove the legacy mode branch (computeEta without targetStopId as primary path). Remove the shadow mode branch (dual compute + `progress_source_mismatch` logging). Keep the persisted path: if pointer valid → computeEta with targetStopId; if pointer invalid → self-heal (derive from contiguous prefix, persist repair, log `progress_pointer_healed`), then computeEta with healed targetStopId. Keep four-tier pointer validation (exists, pending, age < 120min, adjacent), contiguous prefix filter, orphaned shift detection.
- [x] T014 [P] [US5] Delete `src/__tests__/tracking/resolve-route-progress-modes.test.ts` — the 3-mode test suite is obsolete since legacy/shadow modes no longer exist.
- [x] T015 [US5] Update `src/__tests__/tracking/resolve-route-progress.test.ts` — remove any test cases that set `TRACKING_PROGRESS_SOURCE` env var. Verify the resolver always uses persisted pointer path. Add test for self-heal: given invalid `next_stop_id`, resolver derives correct pointer from contiguous `route_run_stops`, persists repair, and logs `progress_pointer_healed`.

**Checkpoint**: Progress resolver has one code path. No feature-flag dependent behavior.

---

## Phase 7: User Story 6 — Mobile Config Resync Re-registers Geofences (Priority: P2)

**Goal**: When configVersion mismatches, the tracker re-fetches config AND immediately re-registers device geofences.

**Independent Test**: Change a stop's coordinates on server → send ping → verify device re-registers geofences without restart.

**Depends on**: None (tracker app, independent of server changes).

- [x] T016 [US6] In `apps/van-tracker/src/api/client.ts` (line ~110), chain `registerGeofencesFromCache()` after `fetchTrackerConfig()` in the configVersion mismatch handler. Change `fetchTrackerConfig(settings).catch(() => {})` to `fetchTrackerConfig(settings).then(() => registerGeofencesFromCache()).catch(() => {})`. Add import for `registerGeofencesFromCache` from `@/location/tracking`.

**Checkpoint**: Config version mismatch triggers immediate geofence re-registration.

---

## Phase 8: User Story 7 — Standardized Device Geofence Radii (Priority: P3)

**Goal**: Tracker config endpoint aggregates radius per geofence group with min/clamp/default and logs disagreements.

**Independent Test**: Create grouped stops with conflicting radii → request tracker config → verify clamped minimum and warning log.

**Depends on**: None (independent endpoint change).

- [x] T017 [US7] Refactor geofence region building in `src/app/api/tracker-config/[vanId]/route.ts` (lines ~61–84) — instead of using first-seen entry's `device_geofence_radius_m`, collect all non-null radii per group key. Compute effective radius as `Math.max(100, Math.min(...radii, 150))` with default 150m if all null. If collected radii are not all equal, emit `console.warn(JSON.stringify({ event: "geofence_radius_disagreement", placeId, radii, effectiveRadius }))`.
- [x] T018 [US7] Update tests in `src/__tests__/tracking/tracker-config.test.ts` — add cases: grouped entries with disagreeing radii produce clamped minimum and warning; radii below 100m clamped to 100; radii above 150m clamped to 150; all-null radii default to 150; single non-null value used directly (within clamp range).

**Checkpoint**: Geofence radii are deterministic, bounded, and disagreements are logged.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, documentation, reconciliation, and final validation.

- [x] T019 Remove `TRACKING_PROGRESS_SOURCE` entry from `.env.local.example` (lines ~31–35)
- [x] T020 [P] Remove `TRACKING_PROGRESS_SOURCE` documentation from `docs/OPERATIONS.md` (references at lines ~46, ~290–433)
- [x] T021 [P] Create one-time reconciliation script at `scripts/reconcile-active-runs.ts` — query active route_runs (has shift with `ended_at IS NULL` on current service date), for each: call `seedRouteRunStops()` then `persistCanonicalProgress()`, log repairs. Runnable via `npx tsx scripts/reconcile-active-runs.ts`.
- [x] T022 Run full quality gate: `pnpm lint && pnpm tsc --noEmit && pnpm vitest run && pnpm build` — verify zero errors across all checks
- [x] T023 Run quickstart.md verification checklist: GPS ping doesn't change stops, device geofence updates pointers, shift start seeds stops, resolver ignores env var, deferred events retry naturally

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Foundational) ─────────────────────────────────────────────┐
    │                                                                │
    ├──→ Phase 2 (US1: Device Geofence Wiring) ──┐                  │
    │                                              ├──→ Phase 4 (US2: Remove GPS Inference)
    ├──→ Phase 3 (US3: Manual Confirm Refactor) ──┘                  │
    │                                                                │
    ├──→ Phase 5 (US4: Shift Start Seeding) ─────── independent ─────┤
    │                                                                │
    ├──→ Phase 6 (US5: Resolver Simplification) ── independent ──────┤
    │                                                                │
    ├──→ Phase 7 (US6: Mobile Config Resync) ───── independent ──────┤
    │                                                                │
    └──→ Phase 8 (US7: Geofence Radii) ────────── independent ──────┤
                                                                     │
                                                         Phase 9 (Polish) ←─┘
```

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 1 only. Can run in parallel with US3.
- **US3 (P1)**: Depends on Phase 1 only. Can run in parallel with US1.
- **US2 (P1)**: Depends on US1 AND US3 being complete. This is the critical gate — GPS inference must not be removed until both geofence and manual confirm are wired to persist pointers.
- **US4 (P2)**: Depends on Phase 1 only. Independent of US1/US2/US3.
- **US5 (P2)**: Depends on Phase 1 only. Independent.
- **US6 (P2)**: No dependencies. Can start any time.
- **US7 (P3)**: No dependencies. Can start any time.

### Parallel Opportunities

Within each phase, tasks marked [P] can run in parallel:
- Phase 3: T005 and T006 can run in parallel with Phase 2 tasks (different files)
- Phase 6: T014 (delete file) can run in parallel with T013
- Phase 9: T019, T020, T021 can all run in parallel

Across phases (after Phase 1):
- US1 + US3 + US4 + US5 + US6 + US7 can ALL start in parallel
- US2 waits for US1 + US3

---

## Parallel Example: After Phase 1 Completes

```
Agent A: Phase 2 — US1 (T003, T004)
Agent B: Phase 3 — US3 (T005, T006)
Agent C: Phase 5 — US4 (T011, T012)
Agent D: Phase 6 — US5 (T013, T014, T015)
Agent E: Phase 7 — US6 (T016) + Phase 8 — US7 (T017, T018)

→ After A + B complete:
Agent A: Phase 4 — US2 (T007, T008, T009, T010)

→ After all complete:
Any Agent: Phase 9 — Polish (T019–T023)
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3)

1. Complete Phase 1: Shared helper extraction
2. Complete Phase 2 + Phase 3 in parallel: Wire device geofence + refactor manual confirm
3. Complete Phase 4: Remove GPS inference
4. **STOP and VALIDATE**: Send GPS pings near stops → verify no stop changes. Send geofence events → verify pointer updates. Manual confirm → verify pointer updates.
5. This delivers the core behavioral change (SC-001, SC-002)

### Incremental Delivery

1. Phase 1 → Shared helper ready
2. Phase 2 + 3 → Both writers use shared helper
3. Phase 4 → GPS inference removed (core simplification complete)
4. Phase 5 → Shift start seeding (SC-003)
5. Phase 6 → Resolver simplified (SC-005)
6. Phase 7 → Mobile resync fixed (SC-006)
7. Phase 8 → Radii standardized
8. Phase 9 → Cleanup + reconciliation (SC-007)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- US2 (Remove GPS Inference) is the highest-risk task — removing a progression engine. US1 + US3 MUST be validated first.
- `infer-stop-progress.ts` is retained as dead code (no callers). Cleanup is a future chore.
- No schema migrations — all changes are behavioral.
- Commit after each task or logical group.
