# Tasks: Device-Side Geofencing

**Input**: Design documents from `/specs/062-device-side-geofencing/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md
**Analysis**: `docs/execution/0106-device-side-geofencing-complete-analysis.md`

**Tests**: Included — plan.md explicitly includes test steps (1.8, 1.9).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migration and type changes shared by all user stories

- [x] T001 Create migration `supabase/migrations/00015_device_side_geofencing.sql`: add `device_geofence` to `route_run_stops.pass_source` CHECK constraint (DROP + ADD), add `device_geofence_radius_m integer` column to `schedule_entries`, add `updated_at timestamptz NOT NULL DEFAULT now()` column + `trg_schedule_entries_updated_at` trigger (uses existing `set_updated_at()` function) to `schedule_entries`, create `tracking_geofence_events` table with columns per `data-model.md` (id, van_id, event_id, place_id, entered_at, received_at, matched_run_id, matched_schedule_entry_id, status), UNIQUE(van_id, event_id), CHECK(status IN received/matched/no_match), index idx_tge_van_status(van_id, status)
- [x] T002 [P] Add `"device_geofence"` to `PassSource` union type in `src/types/index.ts`
- [x] T003 [P] Add `"device_geofence"` to the geofence guard check in `src/app/api/routes/[routeId]/confirm-start-stop/route.ts` (line ~141, add `s.pass_source === "device_geofence"` to `hasGeofencePasses` condition)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and type infrastructure that MUST be complete before user story implementation

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Extend Zod schema in `src/lib/validators/tracking.ts`: add optional `geofenceEvents` array field to `trackingSchema` with shape `z.array(z.object({ placeId: z.string(), enteredAt: z.int().positive(), eventId: z.string().uuid() })).optional()`. Export the inferred type.
- [x] T005 [P] Add tracker-side types to `apps/van-tracker/src/types.ts`: export `GeofenceRegion` (placeId, lat, lng, radius), `GeofenceEvent` (placeId, enteredAt, eventId), and `TrackerConfig` (geofenceRegions array, configVersion string) interfaces

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Stop Detection During GPS Blackouts (Priority: P1) MVP

**Goal**: Device detects van proximity to stops via OS geofencing, buffers events locally, delivers them to server piggybacked on pings. Server processes events and marks stops as passed.

**Independent Test**: Send a ping with `geofenceEvents[]` containing a valid placeId during an active shift. Verify the server marks the matching stop as passed with `pass_source='device_geofence'` and returns `processedEventIds` containing the submitted eventId.

### Server Implementation

- [x] T006 [US1] Create tracker-config endpoint `src/app/api/tracker-config/[vanId]/route.ts`: GET handler with `x-ingestion-token` auth (same pattern as tracking endpoint), look up route via `routes.van_id`, query `schedule_entries` for that route, deduplicate by `stop_group_id` or coordinate key `${stop_lat.toFixed(6)},${stop_lng.toFixed(6)}`, return `{ geofenceRegions: [{ placeId, lat, lng, radius }], configVersion }` where radius = `device_geofence_radius_m ?? 150` and configVersion = max `updated_at` from schedule_entries. Return 404 if no route assigned. Contract: `contracts/tracker-config-api.md`
- [x] T007 [US1] Create `src/lib/tracking/process-device-geofence-events.ts`: export async function `processDeviceGeofenceEvents({ supabase, vanId, geofenceEvents })` that for each event: (1) INSERT into `tracking_geofence_events` ON CONFLICT DO NOTHING, (2) route/run lookup + upsert (reuse pattern from `inferStopProgress`), (3) shift gate — no active shift → update status='no_match', (4) seed route_run_stops (reuse `seedRouteRunStops`), (5) resolve placeId → pending stops by stop_group_id or coord key, filter by early arrival window (30 min), pick closest-in-time match, (6) tiered confidence: 0.90 base + 0.05 if recent GPS ping (last 5 min) within geofence_radius_m of stop, cap 0.95, (7) mark passed with pass_source='device_geofence', (8) conservative gap-1 backfill at confidence 0.80, (9) update ledger status='matched' or 'no_match'. Return `tentativeMatchIds[]`. Reference: analysis doc Section 11a
- [x] T008 [US1] Wire event processing into `src/app/api/tracking/[vanId]/route.ts`: after auth validation but BEFORE ping upsert, extract `geofenceEvents` from parsed body, if present call `processDeviceGeofenceEvents()`. Add `configVersion` to response (query max `updated_at` from schedule_entries for van's route; return only when route exists). Add basic `processedEventIds` to response (events with status='matched' whose matched_schedule_entry_id is still 'passed' in route_run_stops). Contract: `contracts/tracking-ping-extension.md`

### Tracker Implementation

- [x] T009 [P] [US1] Add geofence AsyncStorage helpers to `apps/van-tracker/src/storage/tracking-state.ts`: `getGeofenceRegions()`/`setGeofenceRegions()` for `@geofenceRegions` key, `getGeofenceConfigVersion()`/`setGeofenceConfigVersion()` for `@geofenceConfigVersion` key, `getGeofenceEventBuffer()`/`addGeofenceEvent()`/`removeGeofenceEvents(eventIds[])` for `@geofenceEventBuffer` key. Follow existing patterns (async, null checks, JSON parse/stringify).
- [x] T010 [US1] Create config fetch module `apps/van-tracker/src/api/config.ts`: export async function `fetchTrackerConfig(settings: Settings)` that calls `GET ${settings.apiBaseUrl}/api/tracker-config/${settings.vanId}` with `x-ingestion-token` header, parses response as `TrackerConfig`, caches regions via `setGeofenceRegions()` and version via `setGeofenceConfigVersion()`. Handle 401/404/network errors gracefully (log, don't crash). Use 10s timeout (same as existing ping client).
- [x] T011 [US1] Create geofence task definition `apps/van-tracker/src/location/geofence-task.ts`: import and call `TaskManager.defineTask()` with task name `"geofence-task"`. On callback: extract `eventType` and `region` from data, ignore exit events (only process enter), deduplicate by `region.identifier` + 60s time window (check `@geofenceEventBuffer` for same placeId within last 60s), generate `eventId` via `Crypto.randomUUID()`, call `addGeofenceEvent({ placeId: region.identifier, enteredAt: Date.now(), eventId })`. Log via `logEvent("geofence_enter", region.identifier)`.
- [x] T012 [US1] Add geofence lifecycle to `apps/van-tracker/src/location/tracking.ts`: in `startTracking()` after location updates start, call `fetchTrackerConfig()` then `Location.startGeofencingAsync("geofence-task", regions)` where regions map `GeofenceRegion[]` to expo format `{ identifier: placeId, latitude: lat, longitude: lng, radius, notifyOnEnter: true, notifyOnExit: false }`. In `stopTracking()` call `Location.stopGeofencingAsync("geofence-task")` and clear `@geofenceRegions`, `@geofenceConfigVersion`, `@geofenceEventBuffer`. On boot recovery (when `@trackingEnabled` is true), load cached `@geofenceRegions` and re-register with `startGeofencingAsync()` immediately (no network wait). Import geofence task definition in `app/_layout.tsx` alongside existing task import.
- [x] T013 [US1] Extend `apps/van-tracker/src/api/client.ts`: in `sendLocationPing()`, before sending, drain `@geofenceEventBuffer` and include as `geofenceEvents` field in request body. Parse `processedEventIds` from response and call `removeGeofenceEvents(processedEventIds)` to clear only confirmed events. Parse `configVersion` from response and store for resync comparison. Do NOT clear buffer on generic 200 — only clear specific confirmed eventIds.

**Checkpoint**: At this point, US1 is fully functional. A geofence enter event is detected by the device, buffered, delivered to the server, matched to a stop, and confirmed back. The stop is marked passed with `device_geofence` source.

---

## Phase 4: User Story 2 — Reliable Event Delivery and Idempotent Processing (Priority: P2)

**Goal**: Events are processed exactly-once even with retries, duplicate pings, and canonical healing. Device retries unconfirmed events until they stick.

**Independent Test**: Send the same eventId twice. Verify the stop is marked passed exactly once. Then simulate canonical healing reverting the stop — verify the event is NOT acked and the device retries until the chain reconnects.

### Implementation

- [x] T014 [US2] Enhance re-processing logic in `src/lib/tracking/process-device-geofence-events.ts`: after INSERT ON CONFLICT DO NOTHING, check if insert succeeded (new event → process normally). If conflict (row already exists), query existing row state: `status='matched'` + matched stop still `passed` → skip (already resolved). `status='matched'` + matched stop healed to `pending` → RE-PROCESS from placeId resolution (re-attempt mark-passed, backfill may have reconnected chain). `status='received'` → RE-PROCESS (partial failure). `status='no_match'` → skip. Reference: analysis doc Section 11a step [1], review correction C14.
- [x] T015 [US2] Refine post-healing `processedEventIds` computation in `src/app/api/tracking/[vanId]/route.ts`: after `inferStopProgress()` runs (or is skipped for duplicate pings), query `tracking_geofence_events` WHERE van_id = vanId AND event_id IN (submitted eventIds) AND status='matched', then JOIN with `route_run_stops` to verify each `matched_schedule_entry_id` still has status='passed'. Only include events whose matched stops survived canonical healing. Reference: analysis doc Section 11a, review correction C11.
- [x] T016 [US2] Handle duplicate pings with geofence events in `src/app/api/tracking/[vanId]/route.ts`: change the PGRST116 (duplicate) early return (currently line ~113-114) to be conditional — if the parsed body had `geofenceEvents`, do NOT return early. Skip OSRM snap (step 5), van position update (step 6), and inferStopProgress (step 7), but continue to processedEventIds computation (step 9). Only return early for duplicate pings with NO geofence events (preserves existing behavior). Reference: analysis doc review correction C15.
- [x] T017 [US2] Ensure selective ack in `apps/van-tracker/src/api/client.ts`: verify that `removeGeofenceEvents()` is called with ONLY the `processedEventIds` array from the server response, not the full buffer. Events not in `processedEventIds` MUST remain in `@geofenceEventBuffer` for retry on next ping. This should already be the behavior from T013, but verify edge cases: empty processedEventIds (keep all), missing field (keep all), partial list (keep unconfirmed).

**Checkpoint**: Events are resilient to retries, duplicates, and healing. The idempotent ledger + post-healing ack + selective buffer clearing ensure exactly-once semantics.

---

## Phase 5: User Story 3 — Automatic Configuration Sync (Priority: P3)

**Goal**: Tracker automatically detects stale geofence configuration and re-fetches regions when admin changes stop coordinates.

**Independent Test**: Change a stop's coordinates on the server. On the next ping, the tracker should detect the configVersion mismatch and re-register geofences with the new coordinates.

### Implementation

- [x] T018 [US3] Add resync handling to `apps/van-tracker/src/api/client.ts`: after parsing `configVersion` from ping response, compare with cached `@geofenceConfigVersion`. If they differ (or response has configVersion but cache is empty), call `fetchTrackerConfig()` to re-fetch regions, then call `Location.startGeofencingAsync("geofence-task", newRegions)` to re-register. Update `@geofenceConfigVersion` with new value. Guard against re-fetch during backoff (don't resync if in backoff state).
- [x] T019 [US3] Add optional progress-based event buffer pruning to `apps/van-tracker/src/api/client.ts`: if response includes `progress.pendingPlaceIds`, discard buffered events whose `placeId` is NOT in `pendingPlaceIds` (those stops are already passed by other means). This is an optimization — not required for correctness.

**Checkpoint**: Configuration resync is automatic. Admin stop changes are picked up within one ping cycle without manual intervention.

---

## Phase 6: User Story 4 — GPS-Based Detection as Fallback (Priority: P4)

**Goal**: Existing GPS-based server-side stop detection continues working unchanged. Higher-confidence device events are preserved.

**Independent Test**: Send a ping without `geofenceEvents`. Verify `inferStopProgress()` runs identically to the pre-feature behavior. Then send a ping where a stop was already marked by a device event — verify the GPS inference does not overwrite it with lower confidence.

### Implementation

- [x] T020 [US4] Verify confidence guard in `src/lib/tracking/infer-stop-progress.ts`: confirm that the existing code skips marking a stop as passed when `existingStop.status === 'passed'` (the pending stops query at line ~101-110 already filters by `status = 'pending'`, so stops marked by device events are naturally excluded from GPS inference). If the filter is insufficient (e.g., a stop was healed back to pending and then re-matched by GPS at lower confidence), add an explicit guard: before marking passed, check if `pass_confidence` of the about-to-be-written value is >= any existing value for that stop. Document finding in code comment.
- [x] T021 [US4] Verify backward compatibility in `src/app/api/tracking/[vanId]/route.ts`: confirm that pings without `geofenceEvents` field follow the exact same code path as before this feature (no new queries, no new response fields except `configVersion` which is harmless). Ensure the Zod schema change (T004) does not reject existing payloads (field is optional). Test with an older tracker build payload to verify.

**Checkpoint**: Fallback is verified. Old tracker versions and pings without events work identically to the pre-feature system.

---

## Phase 7: Tests & Polish

**Purpose**: Automated tests and quality gate verification

- [x] T022 [P] Create `src/__tests__/process-device-geofence-events.test.ts`: test cases — (1) new event matched to pending stop, (2) new event with no active shift → no_match, (3) duplicate eventId → idempotent (no overwrite), (4) healed event re-delivered → re-processes and re-matches, (5) received event re-delivered → re-processes, (6) tiered confidence: base 0.90, with GPS corroboration 0.95, (7) gap-1 backfill at 0.80 confidence, (8) repeated place disambiguation (Mundo Plaza 13:50 vs 14:30 — closest-in-time matching), (9) event outside early arrival window → no_match
- [x] T023 [P] Create `src/__tests__/tracker-config.test.ts`: test cases — (1) valid auth returns regions + configVersion, (2) invalid token → 401, (3) van with no route → 404, (4) regions deduplicated by stop_group_id, (5) device_geofence_radius_m used when present (otherwise 150m default), (6) configVersion equals latest updated_at of schedule_entries
- [x] T024 Run quality gates: `npx eslint .` + `npx tsc --noEmit` + `npm run build` + `npx vitest run`. Fix any lint, type, or build errors introduced by the feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (migration must exist before types reference new values)
- **US1 (Phase 3)**: Depends on Phase 2. This is the MVP — delivers core value.
- **US2 (Phase 4)**: Depends on US1 (enhances the helper and route.ts from Phase 3)
- **US3 (Phase 5)**: Depends on US1 (extends the client.ts and tracking.ts from Phase 3)
- **US4 (Phase 6)**: Depends on US1 (verifies fallback after event processing is wired)
- **Tests & Polish (Phase 7)**: Depends on US1 and US2 (tests cover the helper + endpoint logic)

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2). No dependencies on other stories. **This is the MVP.**
- **US2 (P2)**: Depends on US1 server implementation (T007, T008). Enhances the helper's retry/ack logic.
- **US3 (P3)**: Depends on US1 tracker implementation (T012, T013). Adds resync protocol.
- **US4 (P4)**: Depends on US1 server wiring (T008). Verifies fallback behavior.

### Within User Story 1

- Server: T006 (config endpoint) and T007 (helper) can run in parallel. T008 (wiring) depends on both.
- Tracker: T009 (storage) first, then T010 (config fetch), T011 (geofence task), T012 (lifecycle), T013 (client) — sequential chain due to cross-file dependencies.
- Server and tracker sides can be developed in parallel by different developers.

### Parallel Opportunities

```
Phase 1:  T002 ─┬─ parallel
          T003 ─┘

Phase 2:  T004 ─┬─ parallel
          T005 ─┘

Phase 3:  T006 ─┬─ parallel (server)     T009 ── (tracker, parallel with server)
          T007 ─┘                           │
            │                             T010
          T008                              │
                                          T011
                                            │
                                          T012
                                            │
                                          T013

Phase 7:  T022 ─┬─ parallel
          T023 ─┘
```

---

## Parallel Example: User Story 1

```bash
# Server + Tracker can be developed in parallel:

# Server side (sequential):
Task T006: "Create tracker-config endpoint in src/app/api/tracker-config/[vanId]/route.ts"
Task T007: "Create processDeviceGeofenceEvents helper in src/lib/tracking/process-device-geofence-events.ts"
# Then:
Task T008: "Wire helper into src/app/api/tracking/[vanId]/route.ts"

# Tracker side (sequential, can run in parallel with server):
Task T009: "Add geofence AsyncStorage helpers to apps/van-tracker/src/storage/tracking-state.ts"
Task T010: "Create config fetch module apps/van-tracker/src/api/config.ts"
Task T011: "Create geofence task definition apps/van-tracker/src/location/geofence-task.ts"
Task T012: "Add geofence lifecycle to apps/van-tracker/src/location/tracking.ts"
Task T013: "Extend apps/van-tracker/src/api/client.ts with event piggyback"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (migration + types)
2. Complete Phase 2: Foundational (Zod schema + tracker types)
3. Complete Phase 3: User Story 1 (server helper + tracker lifecycle)
4. **STOP and VALIDATE**: Test with a real device — verify geofence enter event → stop marked passed
5. Deploy server to DEV, push EAS build for testing

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add US1 → Test → Deploy (MVP — core detection works)
3. Add US2 → Test → Deploy (idempotency hardened — safe for production retries)
4. Add US3 → Test → Deploy (resync — safe for admin config changes)
5. Add US4 → Verify → Deploy (fallback confirmed — full confidence)
6. Tests + Polish → Quality gates pass → PR ready

### Suggested PR Scope

**Option A (single PR)**: All phases in one PR targeting `dev`. ~593 lines production + ~120 tests. Manageable given the tight focus and thorough analysis document.

**Option B (split PRs)**:
- PR 1: Phases 1-3 (Setup + Foundational + US1 MVP) — can be field-tested immediately
- PR 2: Phases 4-7 (US2-4 + Tests + Polish) — hardening and verification

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in the same phase
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable after its phase completes
- The analysis document (`docs/execution/0106-device-side-geofencing-complete-analysis.md`) contains detailed implementation guidance for every task
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
