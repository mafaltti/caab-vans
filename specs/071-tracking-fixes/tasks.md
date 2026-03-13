# Tasks: Tracking Reliability Fixes

**Input**: Design documents from `specs/071-tracking-fixes/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested. Existing test suite (17 scenarios) covers deferred event behavior. No new test tasks generated.

**Organization**: Tasks are grouped by user story. No setup or foundational phases needed — all changes are modifications to existing files in an established codebase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 — Stop Deferred Event Retry Loop (Priority: P1) 🎯 MVP

**Goal**: Mark out-of-sequence geofence events as `no_match` so the device acknowledges them and stops resending every 5 seconds. Eliminates ~16,000 warnings per 4-hour shift.

**Independent Test**: Start a shift, skip over a stop, verify a geofence event for a later stop is acknowledged to the device and does not reappear in subsequent pings. Monitor logs for near-zero "deferred non-adjacent" warnings.

### Implementation for User Story 1

- [x] T001 [US1] Add `await updateEventStatus(supabase, vanId, eventId, "no_match")` before the `return` in the contiguous-prefix guard (~line 285) in `src/lib/tracking/process-device-geofence-events.ts`

**Checkpoint**: Deferred events are now acknowledged. Device removes them from buffer. Re-evaluation still works via existing duplicate-detection reset (`no_match` → `received` on resend).

---

## Phase 2: User Story 2 — Prevent API Failures from Large Event Payloads (Priority: P1)

**Goal**: Prevent gateway 502 errors by capping geofence events per request at 100 and batching the `.in()` query in chunks of 50.

**Independent Test**: Simulate a van with 100+ geofence events in a single ping. Verify the API responds successfully without gateway errors. Verify >100 events are rejected at validation.

### Implementation for User Story 2

- [x] T002 [P] [US2] Add `.max(100)` to `geofenceEvents` array schema (line 23) in `src/lib/validators/tracking.ts`
- [x] T003 [P] [US2] Replace single `.in("event_id", submittedEventIds)` query with batched chunks of 50 in `appendGeofenceResponse` function in `src/app/api/tracking/[vanId]/route.ts`

**Checkpoint**: Tracking API handles high event volumes without 502 errors. Unbounded payloads rejected at validation boundary.

---

## Phase 3: User Story 3 — Reprocess Rejected Events After Late Shift Creation (Priority: P2)

**Goal**: When a shift is created, automatically re-evaluate all `no_match` geofence events from that van's service date so stops advance retroactively.

**Independent Test**: Accumulate geofence events for a van with no active shift, then start the shift late. Verify previously rejected events are reprocessed and matching stops advance correctly.

**⚠️ Dependency**: Requires US1 (T001) to be complete — deferred events must be marked `no_match` for reprocessing to find them.

### Implementation for User Story 3

- [x] T004 [US3] Add import for `processDeviceGeofenceEvents` from `@/lib/tracking/process-device-geofence-events` and add reprocessing block after shift insert (~line 128) in `src/app/api/routes/[routeId]/start/route.ts` — query `no_match` events for `van.id` on `serviceDate`, call `processDeviceGeofenceEvents`, wrap in try/catch per FR-008

**Checkpoint**: Late shift creation triggers retroactive stop advancement. Reprocessing failures do not block shift start response.

---

## Phase 4: Polish & Quality Gates

**Purpose**: Validate all changes pass quality gates before PR

- [x] T005 Run `npx eslint .` and fix any lint errors
- [x] T006 Run `npx tsc --noEmit` and fix any type errors
- [x] T007 Run `npx vitest run` and verify all existing tests pass
- [x] T008 Run `npx next build` and verify build succeeds

---

## Dependencies & Execution Order

### Phase Dependencies

- **US1 (Phase 1)**: No dependencies — can start immediately
- **US2 (Phase 2)**: No dependencies — can start immediately, independent of US1
- **US3 (Phase 3)**: Depends on US1 completion (needs `no_match` marking for deferred events)
- **Quality Gates (Phase 4)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent — single file change
- **US2 (P1)**: Independent — two different files, no overlap with US1
- **US3 (P2)**: Depends on US1 — reprocessing queries `no_match` events that are only correctly marked after T001

### Parallel Opportunities

- **T001 (US1)** and **T002 + T003 (US2)** can run in parallel — different files, no dependencies
- **T002** and **T003** can run in parallel within US2 — different files (`tracking.ts` vs `route.ts`)
- **T004 (US3)** must wait for T001 (US1) to be complete

```
Timeline:
  T001 (US1) ──────┐
                    ├──→ T004 (US3) ──→ T005-T008 (Quality)
  T002 (US2) ──┐   │
               ├───┘
  T003 (US2) ──┘
```

---

## Parallel Example: Phase 1 + Phase 2

```bash
# Launch US1 and US2 in parallel (different files, no dependencies):
Task: "T001 [US1] Add updateEventStatus call in src/lib/tracking/process-device-geofence-events.ts"
Task: "T002 [US2] Add .max(100) to schema in src/lib/validators/tracking.ts"
Task: "T003 [US2] Batch .in() query in src/app/api/tracking/[vanId]/route.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 (US1) — 1 line change, highest impact
2. **STOP and VALIDATE**: Deploy to DEV, monitor logs for warning reduction
3. This alone eliminates 99% of the retry loop problem and cascading Issue 5

### Incremental Delivery

1. T001 (US1) → Retry loop fixed → Deploy/Validate
2. T002 + T003 (US2) → 502 errors eliminated → Deploy/Validate
3. T004 (US3) → Late shift reprocessing works → Deploy/Validate
4. T005-T008 → Quality gates pass → PR ready

---

## Notes

- All 4 implementation tasks modify different files — no merge conflicts possible
- Total code changes are minimal: ~1 line (T001), ~1 line (T002), ~10 lines (T003), ~20 lines (T004)
- No database migrations required
- No new dependencies
- Existing test suite should continue passing without modification
