# Tasks: Tracking System Hardening

**Input**: Design documents from `/specs/054-tracking-system-hardening/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — SC-007 requires new test coverage for each hardening area.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Foundational (Shared Type Definitions)

**Purpose**: Add new type fields used across multiple user stories. Must complete before story implementation.

- [X] T001 Add `etaStatus: "estimated" | "overdue" | "none"` to `RouteProgress` type in `src/types/index.ts` and to the `RouteProgress` interface in `src/lib/tracking/resolve-route-progress.ts`
- [X] T002 Add `nextStopMode: "live" | "last_known" | null` to route response construction type in `src/types/index.ts`
- [X] T003 Add `etaStatus` field to the `EtaResult` interface in `src/lib/tracking/eta.ts`

**Checkpoint**: Types compile cleanly with `tsc --noEmit`. No runtime behavior changes yet.

---

## Phase 2: User Story 1 — Deterministic Stop-Passage Confidence (Priority: P1) 🎯 MVP

**Goal**: Evidence query fetched once per inference pass, ordered by `device_ts DESC`, no arbitrary `limit(50)`.

**Independent Test**: Run inference with >50 pings in the 5-minute window and verify identical confidence output across repeated calls.

### Tests for User Story 1

- [X] T004 [P] [US1] Add test: >50 pings in 5-minute window produces deterministic confidence in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T005 [P] [US1] Add test: evidence is fetched exactly once per invocation (not once per stop group) in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T006 [P] [US1] Add test: 2 raw pings in geofence produces confidence 0.90 in `src/__tests__/tracking/infer-stop-progress.test.ts`

### Implementation for User Story 1

- [X] T007 [US1] Lift the evidence query out of the per-group loop in `inferStopProgress()` — fetch once before line 182, store in a variable, and remove the per-group query at lines 244-249 in `src/lib/tracking/infer-stop-progress.ts`
- [X] T008 [US1] Add `order("device_ts", { ascending: false })` to the evidence query and remove `limit(50)` in `src/lib/tracking/infer-stop-progress.ts`
- [X] T009 [US1] Pass the pre-fetched evidence array into each group's confidence computation (replace per-group `recentPings` with the shared set) in `src/lib/tracking/infer-stop-progress.ts`
- [X] T010 [US1] Verify all existing `infer-stop-progress.test.ts` tests still pass and update mocks if the query shape changed

**Checkpoint**: Inference is deterministic. Existing confidence values unchanged (raw 0.70/0.90). Tests T004-T006 pass.

---

## Phase 3: User Story 2 — Consistent Last-Known Route Summary (Priority: P1)

**Goal**: When `includeLastKnown=true` and route is not running, populate top-level `nextStop`, `currentStopIndex`, and `nextStopMode` from persisted progress.

**Independent Test**: Request a non-running route with `includeLastKnown=true` and verify top-level fields are populated.

### Tests for User Story 2

- [X] T011 [P] [US2] Add test: `includeLastKnown=true` on non-running route populates top-level `nextStop` and `currentStopIndex` in `src/__tests__/tracking/routes-api.test.ts`
- [X] T012 [P] [US2] Add test: `nextStopMode = "live"` for active routes and verify `isRunning` remains tied to `runStatus === "in_progress"` (FR-012) in `src/__tests__/tracking/routes-api.test.ts`
- [X] T013 [P] [US2] Add test: `nextStopMode = null` when no persisted progress in `src/__tests__/tracking/routes-api.test.ts`
- [X] T014 [P] [US2] Add test: top-level summary remains null without `includeLastKnown` flag (backward compat) in `src/__tests__/tracking/routes-api.test.ts`

### Implementation for User Story 2

- [X] T015 [US2] In `src/app/api/routes/route.ts`: change `nextStop` gating at line 145 to also populate from `progress.nextStopId` when `includeLastKnown=true`, `!isRunning`, and `nextStopId` resolves to a schedule entry. Set `nextStopMode` accordingly (`"live"`, `"last_known"`, or `null`). Add `nextStopMode` to the response object.
- [X] T016 [US2] In `src/app/api/routes/[routeId]/route.ts`: apply the same gating change at line 153, same `nextStopMode` logic, add to response object.
- [X] T017 [US2] Verify all existing route API tests still pass after the gating change

**Checkpoint**: API internally consistent — `progress.nextStopId` and top-level `nextStop` agree. Tests T011-T014 pass.

---

## Phase 4: User Story 3 — Honest Overdue ETA Signaling (Priority: P2)

**Goal**: Segment and schedule branches return `etaStatus = "overdue"` with `etaNextStopMinutes = null` when predicted arrival is in the past. GPS branch unchanged.

**Independent Test**: Set up a scenario where segment-predicted arrival is past and verify `etaStatus = "overdue"`.

### Tests for User Story 3

- [X] T018 [P] [US3] Add test: overdue segment ETA returns `etaStatus = "overdue"` and `etaNextStopMinutes = null` in `src/__tests__/tracking/eta.test.ts`
- [X] T019 [P] [US3] Add test: overdue schedule ETA returns `etaStatus = "overdue"` and `etaNextStopMinutes = null` in `src/__tests__/tracking/eta.test.ts`
- [X] T020 [P] [US3] Add test: GPS branch at stop returns `etaNextStopMinutes = 0` and `etaStatus = "estimated"` in `src/__tests__/tracking/eta.test.ts`
- [X] T021 [P] [US3] Add test: valid future ETA returns `etaStatus = "estimated"` in `src/__tests__/tracking/eta.test.ts`

### Implementation for User Story 3

- [X] T022 [US3] In `computeEta()` in `src/lib/tracking/eta.ts`: for the segment branch (line 273), when `etaDateTime <= now`, return `etaStatus: "overdue"`, `etaNextStopMinutes: null`, and keep `etaNextStopISO` as the past timestamp. For valid future, return `etaStatus: "estimated"`.
- [X] T023 [US3] In `computeEta()` in `src/lib/tracking/eta.ts`: apply the same overdue logic to the schedule fallback branch (line 316-319). When predicted arrival <= now, return `etaStatus: "overdue"`, `etaNextStopMinutes: null`.
- [X] T024 [US3] In `computeEta()` in `src/lib/tracking/eta.ts`: for the GPS branch, always return `etaStatus: "estimated"`. For the no-next-stop early return, return `etaStatus: "none"`.
- [X] T025 [US3] In `resolveRouteProgress()` in `src/lib/tracking/resolve-route-progress.ts`: pass `etaStatus` from the `computeEta()` result through to the `RouteProgress` return object. Set `etaStatus: "none"` for early-return paths where no ETA is computed.
- [X] T026 [US3] Verify all existing `eta.test.ts` tests still pass with the new `etaStatus` field in return values

**Checkpoint**: Overdue stops return `"overdue"` instead of `0 min`. GPS `0 min` unchanged. Tests T018-T021 pass.

---

## Phase 5: User Story 4 — Monotonic Snapped Confidence Scoring (Priority: P2)

**Goal**: Replace flat 0.8 snapped confidence with tiered model: base 0.65/0.85 + bonuses for evidence (+0.10 for 2+ pings, +0.05 for displacement ≤15m), capped at 0.95.

**Independent Test**: Provide varying evidence levels for snapped matches and verify confidence increases monotonically.

**Dependency**: Requires US1 complete (evidence query refactor provides the ordered evidence set used for scoring).

### Tests for User Story 4

- [X] T027 [P] [US4] Add test: snapped match with raw outside geofence returns confidence 0.65 in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T028 [P] [US4] Add test: snapped match with raw inside geofence returns confidence 0.85 in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T029 [P] [US4] Add test: snapped match with 2+ confirming pings adds +0.10 (capped at 0.95) in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T030 [P] [US4] Add test: snapped match with snap displacement ≤15m adds +0.05 (capped at 0.95) in `src/__tests__/tracking/infer-stop-progress.test.ts`
- [X] T031 [P] [US4] Add test: monotonic property — progressively stronger evidence never decreases confidence in `src/__tests__/tracking/infer-stop-progress.test.ts`

### Implementation for User Story 4

- [X] T032 [US4] Replace the 4-branch confidence `if/else` at lines 266-271 in `src/lib/tracking/infer-stop-progress.ts` with the tiered scoring model from data-model.md: raw 0.70/0.90, snapped base 0.65 (raw outside) or 0.85 (raw inside), +0.10 for 2+ confirming pings, +0.05 for snap displacement ≤15m, capped at 0.95
- [X] T033 [US4] Add `SNAP_LOW_DISPLACEMENT_THRESHOLD_M = 15` constant in `src/lib/tracking/infer-stop-progress.ts` and compute snap displacement bonus when applicable
- [X] T034 [US4] Verify backfill gating at `pass_confidence > 0.7` still works correctly with new snapped base scores in `src/lib/tracking/infer-stop-progress.ts`. Note: snapped-only confidence drops from 0.8 → 0.65 (below gate) — this intentionally disables backfill for snapped matches without corroborating raw evidence. Snapped + raw inside (0.85) or snapped + 2 pings (0.75) still pass the gate
- [X] T035 [US4] Update existing snapped confidence tests (currently expecting 0.8) to expect new tiered values in `src/__tests__/tracking/infer-stop-progress.test.ts`

**Checkpoint**: Snapped confidence is monotonic. Existing raw confidence unchanged. Tests T027-T031 pass.

---

## Phase 6: User Story 5 — Auto-Close Orphaned Active Shifts (Priority: P3)

**Goal**: Standalone reconciliation script that auto-closes shifts where `ended_at IS NULL`, past scheduled end by ≥90 min, and inactive for ≥30 min.

**Independent Test**: Create an orphaned shift and run the script to verify it closes.

### Tests for User Story 5

- [X] T036 [P] [US5] Add test: orphaned shift closes when past end + inactivity thresholds met in `src/__tests__/tracking/reconcile-orphaned-shifts.test.ts`
- [X] T037 [P] [US5] Add test: active route with fresh GPS/progress is NOT auto-closed in `src/__tests__/tracking/reconcile-orphaned-shifts.test.ts`
- [X] T038 [P] [US5] Add test: route still within schedule window is NOT closed in `src/__tests__/tracking/reconcile-orphaned-shifts.test.ts`
- [X] T039 [P] [US5] Add test: `DRY_RUN=1` reports candidates without mutating data in `src/__tests__/tracking/reconcile-orphaned-shifts.test.ts`

### Implementation for User Story 5

- [X] T040 [US5] Create `scripts/reconcile-orphaned-shifts.ts` following the existing script pattern (R6): import `createClient`, require `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, exit early on missing config. Export core logic as testable functions (`findOrphanedShifts()`, `closeOrphanedShifts()`) so `src/__tests__/tracking/reconcile-orphaned-shifts.test.ts` can import and test them with a mocked Supabase client
- [X] T041 [US5] Implement the orphan detection query: join `route_shifts` (ended_at IS NULL) → `route_runs` (service_date, progress_updated_at) → `routes` → `schedule_entries` (MAX time) → `vans` (last_gps_fix_at). Compute `scheduledEnd` and `lastActivity` per data-model.md
- [X] T042 [US5] Implement closure logic: when `now > scheduledEnd + 90 min` AND `now > lastActivity + 30 min`, set `route_shifts.ended_at = now()`. Emit structured JSON logs with closed shift IDs and count
- [X] T043 [US5] Implement `DRY_RUN=1` mode: when env var set, log candidates without executing the UPDATE
- [X] T044 [US5] Add `"tracking:reconcile-shifts"` npm script entry in `package.json` pointing to `npx tsx scripts/reconcile-orphaned-shifts.ts`
- [X] T045 [US5] Document reconciliation scheduling (every 5 minutes via host cron/systemd timer) in `docs/OPERATIONS.md`

**Checkpoint**: Script closes orphaned shifts. DRY_RUN works. Tests T036-T039 pass.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and quality gates

- [X] T046 Run full test suite (`npm test`) — all existing + new tests pass
- [X] T047 Run lint (`npm run lint`) and fix any issues
- [X] T048 Run type-check (`npx tsc --noEmit`) and fix any issues
- [X] T049 Run build (`npm run build`) and fix any issues
- [X] T050 Verify backward compatibility: existing API consumers that don't read `etaStatus` or `nextStopMode` see no behavioral change

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (US1)**: Depends on Phase 1
- **Phase 3 (US2)**: Depends on Phase 1 — can run in parallel with US1
- **Phase 4 (US3)**: Depends on Phase 1 (T003) — can run in parallel with US1 and US2
- **Phase 5 (US4)**: Depends on **US1 complete** (evidence refactor needed for scoring)
- **Phase 6 (US5)**: Depends on Phase 1 only — can run in parallel with US1-US4
- **Phase 7 (Polish)**: Depends on all story phases complete

### User Story Dependencies

```text
Phase 1 (Types)
  ├── US1 (Deterministic confidence) ─── US4 (Monotonic snapped confidence)
  ├── US2 (includeLastKnown wiring)
  ├── US3 (Overdue ETA signaling)
  └── US5 (Orphaned shift reconciliation)
```

- **US1 → US4**: US4 depends on US1 (same file, evidence refactor is prerequisite)
- **US2, US3, US5**: Independent of each other and US1 (different files)

### Parallel Opportunities

- **After Phase 1**: US1, US2, US3, US5 can all start in parallel
- **After US1**: US4 can start
- **Within each story**: Test tasks marked [P] can run in parallel

---

## Parallel Example: Maximum Parallelism After Phase 1

```text
Worker A: US1 (T004-T010) → then US4 (T027-T035)
Worker B: US2 (T011-T017)
Worker C: US3 (T018-T026)
Worker D: US5 (T036-T045)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Type definitions
2. Complete Phase 2: US1 — Deterministic confidence
3. **STOP and VALIDATE**: Verify inference is deterministic with >50 pings
4. This alone fixes the most fundamental correctness issue

### Recommended Order (Sequential)

1. Phase 1 → Phase 2 (US1) → Phase 5 (US4) — confidence correctness path
2. Phase 3 (US2) — API consistency fix
3. Phase 4 (US3) — overdue ETA honesty
4. Phase 6 (US5) — operational hygiene
5. Phase 7 — polish and gates

### Incremental Delivery

Each story can be merged independently. US1+US4 together is the natural pairing since they share the same file.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US4 share `infer-stop-progress.ts` — US4 must follow US1
- US2 and US3 share `src/types/index.ts` but add different fields — can be parallel
- US5 is fully independent (new file)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
