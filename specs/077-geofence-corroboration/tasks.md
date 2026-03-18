# Tasks: GPS Corroboration Gate for Device Geofence Stop Advancement

**Input**: Design documents from `/specs/077-geofence-corroboration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — the existing test suite for device geofence processing must be updated and a new test file created.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Schema Migration)

**Purpose**: Database schema change that all subsequent work depends on

- [x] T001 Create migration `supabase/migrations/00023_awaiting_corroboration_status.sql` to add `'awaiting_corroboration'` to the `tracking_geofence_events.status` CHECK constraint (drop + recreate the constraint)

**Checkpoint**: Migration applies cleanly; existing status values unchanged

---

## Phase 2: User Story 1 — GPS-Corroborated Stop Confirmation (Priority: P1) MVP

**Goal**: Device geofence events enter `"awaiting_corroboration"` state instead of immediately marking stops as passed. A subsequent GPS ping within 50m (`geofence_radius_m`) confirms the stop.

**Independent Test**: Simulate a device geofence event while GPS shows the van at 100m. The stop must NOT be immediately marked as passed. Send a subsequent ping at 30m — the stop should now be confirmed at 0.95 confidence.

### Implementation for User Story 1

- [x] T002 [US1] Modify `processOneEvent()` in `src/lib/tracking/process-device-geofence-events.ts`: after stop matching and the contiguous-prefix guard passes, instead of marking the stop as `"passed"` and the event as `"matched"`, set the event status to `"awaiting_corroboration"` and populate `matched_run_id` + `matched_schedule_entry_id`. Do NOT update `route_run_stops` or call `persistCanonicalProgress()` at this point. Keep the existing GPS corroboration check (lines 294–316) only for the no-GPS-stream immediate fallback (FR-013): if no GPS pings exist for this van in the current run, fall back immediately to `"matched"` with 0.85 confidence using the current logic.
- [x] T003 [US1] Create `src/lib/tracking/evaluate-pending-corroborations.ts` with function `evaluatePendingCorroborations({ supabase, vanId, pingLat, pingLng, pingReceivedAt })`. Query all `tracking_geofence_events` with `status = 'awaiting_corroboration'` for this van. For each event: join to `schedule_entries` via `matched_schedule_entry_id` to get `stop_lat`, `stop_lng`, `geofence_radius_m`. Compute haversine distance from ping to stop. If distance ≤ `geofence_radius_m`: mark stop as `"passed"` in `route_run_stops` with `pass_source = 'device_geofence'`, `pass_confidence = 0.95`, update event to `"matched"`. Respect contiguous-prefix rule — only confirm the head-of-line pending stop. Call `persistCanonicalProgress()` after any confirmations. Return array of confirmed event IDs.
- [x] T004 [US1] Integrate `evaluatePendingCorroborations()` into `src/app/api/tracking/[vanId]/route.ts`: call it AFTER the ping upsert and position update (after the `update_van_position` RPC call), BEFORE the response building (`appendGeofenceResponse`). Pass the current ping's lat, lng, and server-side `new Date().toISOString()` as `pingReceivedAt`.
- [x] T005 [US1] Update `appendGeofenceResponse` logic in `src/app/api/tracking/[vanId]/route.ts` to exclude events with status `"awaiting_corroboration"` from `processedEventIds`. Only `"matched"` and `"deferred"` events should be acknowledged.

### Tests for User Story 1

- [x] T006 [P] [US1] Update `src/__tests__/tracking/process-device-geofence-events.test.ts`: modify the "basic geofence match" test — the event should now transition to `"awaiting_corroboration"` (not `"matched"`) and `route_run_stops` should NOT be updated. Add test: event goes to `"awaiting_corroboration"` when GPS pings exist but are >50m from stop. Add test: immediate fallback to `"matched"` with 0.85 confidence when no GPS pings exist in the run (FR-013).
- [x] T007 [P] [US1] Create `src/__tests__/tracking/evaluate-pending-corroborations.test.ts` using the existing Proxy-based Supabase mock pattern. Test cases: (1) ping within 50m confirms stop at 0.95, (2) ping >50m keeps event as `"awaiting_corroboration"`, (3) contiguous-prefix guard respected — only head-of-line stop confirmed, (4) multiple awaiting events evaluated in one pass — only first-pending confirmed, (5) already-passed stops are skipped idempotently.
- [x] T008 [P] [US1] Update `src/__tests__/tracking/append-geofence-response.test.ts`: add test that `"awaiting_corroboration"` events are NOT included in `processedEventIds`.

**Checkpoint**: Device geofence events no longer immediately advance stops. GPS corroboration within 50m confirms them. False positives from nearby roads are eliminated when GPS is active.

---

## Phase 3: User Story 2 — GPS Staleness Fallback (Priority: P1)

**Goal**: When GPS stops arriving (stream goes stale), the system falls back to trusting the device geofence alone. Staleness is defined as no GPS ping received within 30 seconds of the event's server-side receipt time.

**Independent Test**: Trigger a device geofence event, then send no GPS pings for 30+ seconds. On the next request (with or without a ping), the stop should be confirmed via staleness fallback at 0.90 confidence.

### Implementation for User Story 2

- [x] T009 [US2] Extend `evaluatePendingCorroborations()` in `src/lib/tracking/evaluate-pending-corroborations.ts` with staleness evaluation. For each `"awaiting_corroboration"` event: query `van_location_pings` for any ping with `received_at > event.received_at`. If no pings exist after event receipt AND `(now - event.received_at) >= 30_000ms`: confirm with `pass_confidence = 0.90`, `pass_source = 'device_geofence'`, update event to `"matched"`. If pings DO exist after event receipt but distance > threshold: keep waiting (GPS is alive but not yet close enough). Use server-side timestamps (`received_at`, not `device_ts`) per FR-012.
- [x] T010 [US2] Handle the no-GPS-stream case in `evaluatePendingCorroborations()`: if no GPS pings exist AT ALL for this van (not just after the event — zero pings in the `van_location_pings` table for this van in the current run), confirm immediately with `pass_confidence = 0.85`. This covers FR-013 for events that were already set to `"awaiting_corroboration"` before the no-GPS condition was detected.

### Tests for User Story 2

- [x] T011 [P] [US2] Add staleness tests to `src/__tests__/tracking/evaluate-pending-corroborations.test.ts`: (1) no ping after event receipt + 30s elapsed → confirms at 0.90, (2) no ping after event receipt + only 20s elapsed → stays awaiting, (3) pings exist after event receipt but >50m → stays awaiting (GPS alive, not stale), (4) no GPS pings ever for this van → confirms at 0.85, (5) staleness + contiguous-prefix: only confirms head-of-line even via fallback.

**Checkpoint**: Stop detection works during GPS blackouts. The 30-second staleness threshold prevents indefinite stalling while giving GPS enough time to arrive under normal conditions.

---

## Phase 4: User Story 3 — Request-Driven Evaluation (Priority: P2)

**Goal**: Corroboration evaluation runs on every incoming GPS ping as part of the existing request-driven flow. No background timers or schedulers. Staleness fallback triggers on the next request that arrives after the threshold.

**Independent Test**: Verify that `evaluatePendingCorroborations()` is called on every tracking request that includes a GPS ping, and that it handles the case where no geofence events were submitted in the current request (evaluating previously awaiting events from prior requests).

### Implementation for User Story 3

- [x] T012 [US3] Ensure `evaluatePendingCorroborations()` is called on EVERY tracking request in `src/app/api/tracking/[vanId]/route.ts`, not just when `geofenceEvents` are present in the request body. The call should happen after ping upsert regardless of whether the current request contains geofence events, so that previously awaiting events are evaluated against fresh pings.
- [x] T013 [US3] Verify that `replayDeferredEvents()` in `src/lib/tracking/process-device-geofence-events.ts` correctly handles the new `"awaiting_corroboration"` status: deferred events that become head-of-line should go through the corroboration gate (transition to `"awaiting_corroboration"`, not directly to `"matched"`). Adjust `replayDeferredEvents()` if needed so it calls the updated `processOneEvent()` which now sets `"awaiting_corroboration"`.

### Tests for User Story 3

- [x] T014 [P] [US3] Add integration-style test verifying that a tracking request WITHOUT geofence events still evaluates previously awaiting events. Mock an awaiting event in the DB, send a ping within 50m, verify the stop is confirmed.

**Checkpoint**: The system evaluates pending corroborations on every ping. No background processes needed. Previously awaiting events resolve on subsequent pings even when the current request contains no new geofence events.

---

## Phase 5: User Story 4 — Commuter-Facing Delay (Priority: P3)

**Goal**: The corroboration gate is transparent to commuters. Stops appear as "pending" while awaiting corroboration and as "passed" once confirmed. Typical delay remains under 60 seconds.

**Independent Test**: Verify that `resolveRouteProgress()` (the public-facing query path) shows the stop as "pending" while a geofence event is in `"awaiting_corroboration"` state, and as "passed" after confirmation.

### Implementation for User Story 4

- [x] T015 [US4] Verify that `src/lib/tracking/resolve-route-progress.ts` requires NO changes — stops remain `"pending"` in `route_run_stops` while their geofence event is `"awaiting_corroboration"`, so the public-facing progress query already shows the correct state. If any code path in resolve-route-progress reads `tracking_geofence_events.status` directly, ensure `"awaiting_corroboration"` is handled correctly.

**Checkpoint**: Commuters see no new states. The "pending" → "passed" transition is just slightly delayed (15-30s typical).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, expiry handling, and quality gates

- [x] T016 [P] Ensure pending corroborations expire at shift end: verify that when a shift ends (`POST /api/routes/[routeId]/end`), any `"awaiting_corroboration"` events for that van are updated to `"no_match"` (or left as-is if shift-end cleanup already discards them via the route run lifecycle). Check `src/app/api/routes/[routeId]/end/route.ts` — FR-014.
- [x] T017 [P] Add `console.warn` structured logging in `evaluatePendingCorroborations()` for: (a) GPS corroboration confirmed, (b) staleness fallback triggered, (c) no-GPS-stream fallback triggered. Use the same `JSON.stringify({ event: ... })` pattern as existing geofence logging.
- [x] T018 Run quality gates: `eslint`, `tsc --noEmit`, `vitest` — fix any issues
- [x] T019 Update `src/types/index.ts` if the `TrackingGeofenceEventStatus` type (or equivalent) needs the new `"awaiting_corroboration"` value added

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — migration first
- **Phase 2 (US1 - Corroboration Gate)**: Depends on Phase 1 migration
- **Phase 3 (US2 - Staleness Fallback)**: Depends on Phase 2 (extends `evaluatePendingCorroborations`)
- **Phase 4 (US3 - Request-Driven)**: Depends on Phase 2 (integration into tracking route)
- **Phase 5 (US4 - Commuter Transparency)**: Depends on Phase 2 (verification only)
- **Phase 6 (Polish)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Foundation — all other stories depend on this
- **US2 (P1)**: Extends US1's `evaluatePendingCorroborations()` with staleness logic
- **US3 (P2)**: Integration concern — ensures US1+US2 work on every request
- **US4 (P3)**: Verification only — no code changes expected

### Within User Story 1

```
T002 (modify processOneEvent) → T003 (new evaluate function) → T004 (integrate into route) → T005 (response handling)
T006, T007, T008 can run in parallel (different test files)
```

### Parallel Opportunities

- T006, T007, T008 (US1 tests — different files)
- T011 (US2 tests) after T009 completes
- T014 (US3 test) after T012 completes
- T016, T017 (Polish — different concerns)

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all US1 tests in parallel (different files):
Task T006: "Update process-device-geofence-events.test.ts for awaiting_corroboration"
Task T007: "Create evaluate-pending-corroborations.test.ts"
Task T008: "Update append-geofence-response.test.ts for awaiting exclusion"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Migration
2. Complete Phase 2: US1 — Corroboration gate + tests
3. **STOP and VALIDATE**: Device geofence events now require GPS confirmation within 50m. False positives from nearby roads are eliminated.
4. Deploy to DEV and test with real vans

### Incremental Delivery

1. Phase 1 + Phase 2 (US1) → MVP: GPS corroboration gate working
2. Add Phase 3 (US2) → Staleness fallback: GPS blackouts handled
3. Add Phase 4 (US3) → Request-driven evaluation: awaiting events resolve on every ping
4. Add Phase 5 (US4) → Verification: commuter-facing behavior confirmed
5. Phase 6 → Polish: logging, expiry, quality gates

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No device-side (tracker app) changes needed — the device resubmits unacknowledged events naturally
- The existing `"deferred"` status and `replayDeferredEvents()` mechanism is preserved — `"awaiting_corroboration"` is a separate lifecycle phase
- Key constants: corroboration radius = `geofence_radius_m` (50m default), staleness = 30s, confidence tiers = 0.95/0.90/0.85
- Commit after each task or logical group
