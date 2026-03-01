# Tasks: Stop Inference, ETA Computation & Tracking UI

**Input**: Design documents from `/specs/017-stop-inference-eta/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/public-api.md

**Tests**: Included — spec US7 explicitly requests unit tests for haversine, inference, and ETA.

**Organization**: Tasks grouped by user story. Each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1–US7)
- Exact file paths included in all descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend shared types and helpers that all user stories depend on

- [x] T001 Extend types in `src/types/index.ts`: (1) Add `id: string` to `NextStop` type. (2) Add `lastLat: number | null` and `lastLng: number | null` to `RouteWithStatus.van`. (3) Create `RouteProgress` type with fields: `serviceDate: string`, `nextStopId: string | null`, `passedStopIds: string[]`, `etaNextStopISO: string | null`, `etaNextStopMinutes: number | null`, `delayMinutes: number | null`. (4) Add `progress: RouteProgress | null` to both `RouteWithStatus` and `RouteDetail`.

- [x] T002 Add `todayBahiaDate()` helper to `src/lib/time.ts`: export a function that returns today's date as `"YYYY-MM-DD"` string in `America/Bahia` timezone using `nowBahia().toFormat("yyyy-MM-dd")`. This is used by inference to determine the service date for `route_runs`.

**Checkpoint**: Shared types and helpers ready — all stories can now reference them.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utility module that all tracking logic depends on

**⚠️ CRITICAL**: The haversine module is required by both stop inference (US1) and tests (US7)

- [x] T003 Create haversine distance module at `src/lib/tracking/haversine.ts`. Export a pure function `haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number` that computes great-circle distance in meters between two WGS84 coordinate pairs. Use Earth radius = 6_371_000 meters. Standard haversine formula: `a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlng/2)`, `c = 2 · atan2(√a, √(1−a))`, `d = R · c`. Convert degrees to radians internally. No external dependencies.

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 — Automatic Stop Detection (Priority: P1) 🎯 MVP

**Goal**: Detect when a van passes a scheduled stop using proximity-based geofence detection and mark the stop as "passed" in the database.

**Independent Test**: Send a tracking ping with coordinates within 50m of a configured stop → verify `route_run_stops.status` is updated to `'passed'` with a timestamp.

### Implementation for User Story 1

- [x] T004 [US1] Create stop inference module at `src/lib/tracking/infer-stop-progress.ts`. Export an async function `inferStopProgress(supabase: SupabaseClient, vanId: string, lat: number, lng: number)` that: (1) Queries `routes` to find the route where `van_id = vanId` (single result expected — select `id`). If no route found, return early with `{ passedStopIds: [], nextStopId: null, lastPassedStopId: null }`. (2) Computes today's service date using `todayBahiaDate()` from `src/lib/time.ts`. (3) Upserts a `route_run` row for `(route_id, service_date)` using Supabase `.upsert()` with `onConflict: "route_id,service_date"` and `.select("id").single()`. (4) On first creation (check if stops exist for this run), bulk-inserts `route_run_stops` rows for each `schedule_entry` of the route, all with `status: 'pending'`. Use a select-then-insert pattern: query `route_run_stops` count for this `run_id`; if 0, query all `schedule_entries` for the route and insert them. (5) Fetches pending stops: query `route_run_stops` joined with `schedule_entries` where `status = 'pending'` and `stop_lat IS NOT NULL` and `stop_lng IS NOT NULL`, ordered by `schedule_entries.time ASC`. (6) For each pending stop, computes `haversineDistanceMeters(lat, lng, stop_lat, stop_lng)`. If distance <= `geofence_radius_m`, updates `route_run_stops` row to `status: 'passed'`, `passed_at: new Date().toISOString()`. (7) Returns `{ passedStopIds: string[], nextStopId: string | null, lastPassedStopId: string | null }` reflecting the state after all updates. Import `haversineDistanceMeters` from `./haversine` and `todayBahiaDate` from `@/lib/time`.

- [x] T005 [US1] Wire inference into tracking endpoint at `src/app/api/tracking/[vanId]/route.ts`. After the existing van position update block (after the `if (count === 0) { ... }` section, before the final `return NextResponse.json()`), add a try/catch block that calls `inferStopProgress(supabase, vanId, lat, lng)`. On error, log with `console.error("Stop inference failed:", error)` but do NOT affect the response — the endpoint still returns `{ received: true, ts: Date.now() }`. Import `inferStopProgress` from `@/lib/tracking/infer-stop-progress`.

**Checkpoint**: Stop detection works end-to-end. Pings near configured stops cause `route_run_stops` to transition from `pending` to `passed`.

---

## Phase 4: User Story 2 — ETA Computation (Priority: P1)

**Goal**: Compute estimated time of arrival for the next unpassed stop using schedule-shifted delay.

**Independent Test**: Given a route run where the last passed stop was 5 minutes late (passed_at 08:35, scheduled 08:30), verify the ETA for the next stop (scheduled 08:45) is 08:50.

### Implementation for User Story 2

- [x] T006 [US2] Create ETA computation module at `src/lib/tracking/eta.ts`. Export a pure function `computeEta(args: { stops: Array<{ scheduleEntryId: string; time: string; status: "pending" | "passed"; passedAt: string | null }>; now: DateTime }): { etaNextStopISO: string | null; etaNextStopMinutes: number | null; delayMinutes: number | null; nextStopId: string | null; passedStopIds: string[] }` that: (1) Separates stops into passed (`status === 'passed'`) and pending. Collect `passedStopIds`. (2) If all stops are passed: return `{ etaNextStopISO: null, etaNextStopMinutes: null, delayMinutes: null, nextStopId: null, passedStopIds }`. (3) Find the last passed stop (latest by `time` string sort). (4) If no stops passed: `delayMinutes = null`, `nextStopId` = first pending stop by time, ETA = `parseTime(nextStop.time)`. (5) If a stop was passed: compute `delay = DateTime.fromISO(passedAt).diff(parseTime(stop.time), "minutes").minutes`. `nextStopId` = first pending stop by time. `etaDateTime = parseTime(nextStop.time).plus({ minutes: delay })`. (6) Compute `etaNextStopMinutes = Math.ceil(etaDateTime.diff(now, "minutes").minutes)`. Clamp to 0 if negative. (7) Return `{ etaNextStopISO: etaDateTime.toISO(), etaNextStopMinutes, delayMinutes: delay != null ? Math.round(delay) : null, nextStopId, passedStopIds }`. Import `parseTime` from `@/lib/time` and `DateTime` from `luxon`.

**Checkpoint**: ETA module computes correct schedule-shifted predictions. Ready for integration with API endpoints.

---

## Phase 5: User Story 7 — Unit Test Coverage (Priority: P1)

**Goal**: Unit tests for haversine, inference logic, and ETA computation ensure correctness and prevent regressions.

**Independent Test**: Run `npx vitest run src/__tests__/tracking/` — all tests pass.

### Tests for User Story 7

- [x] T007 [P] [US7] Create haversine unit tests at `src/__tests__/tracking/haversine.test.ts`. Test cases: (1) Distance between two identical points = 0. (2) Known pair: Salvador (-12.9714, -38.5124) to nearby point (-12.9718, -38.5120) ≈ expected meters (compute reference value; should be ~55m). (3) Known pair: New York (40.7128, -74.0060) to London (51.5074, -0.1278) ≈ 5,570 km (within 1% tolerance). (4) Antipodal points ≈ half Earth circumference (~20,000 km). (5) Points at same latitude, different longitude. Import `haversineDistanceMeters` from `@/lib/tracking/haversine`.

- [x] T008 [P] [US7] Create inference unit tests at `src/__tests__/tracking/infer-stop-progress.test.ts`. Since `inferStopProgress` requires a Supabase client, test the geofence detection logic in isolation. Extract or test the core logic: (1) Test that a point within 50m of a stop is detected as "within geofence". (2) Test that a point 100m away from a stop is NOT detected. (3) Test that stops without coordinates (`stop_lat === null`) are skipped. (4) Test that already-passed stops are not re-evaluated. Use `haversineDistanceMeters` directly to verify distance thresholds match expected geofence behavior. These are pure function tests that validate the mathematical correctness of the proximity check.

- [x] T009 [P] [US7] Create ETA unit tests at `src/__tests__/tracking/eta.test.ts`. Test cases using `computeEta`: (1) **5-min delay**: Last passed stop at 08:35 (scheduled 08:30), next stop scheduled 08:45 → ETA 08:50, delay 5 min. (2) **No stops passed**: All pending, first stop at 09:00 → ETA 09:00, delay null. (3) **All stops passed**: → ETA null, nextStopId null. (4) **Van ahead of schedule** (negative delay): Passed at 08:25 (scheduled 08:30) → ETA for next stop (08:45) is 08:40, delay -5 min. (5) **Zero delay**: Passed exactly on time → ETA equals scheduled time. For each test, construct the `stops` array and a fixed `now` DateTime using `DateTime.fromISO()` with zone `America/Bahia`. Import `computeEta` from `@/lib/tracking/eta`.

**Checkpoint**: All unit tests pass. Core tracking logic is verified correct.

---

## Phase 6: User Story 3 — Progress Data in Route API (Priority: P1)

**Goal**: Extend `GET /api/routes` and `GET /api/routes/[routeId]` responses with `van.lastLat`, `van.lastLng`, `nextStop.id`, and a nullable `progress` object.

**Independent Test**: With a route that has a `route_run` for today with some passed stops, call `GET /api/routes/[routeId]` and verify the response includes `progress` with correct `passedStopIds`, `nextStopId`, `etaNextStopMinutes`, and `delayMinutes`. Call the same endpoint for a route with no tracking data and verify `progress` is `null`.

### Implementation for User Story 3

- [x] T010 [US3] Extend route list API at `src/app/api/routes/route.ts`. Changes: (1) Add `last_lat, last_lng` to the `vans!inner` select clause. (2) Add `lastLat: van.last_lat` and `lastLng: van.last_lng` to the van object in the response. (3) Add `id` to the `nextStop` response object by finding the matching entry's `id` from the `entries` array (the sorted entry whose formatted time matches `nextStop.time`). (4) After computing the existing route fields, query `route_runs` for `(route_id, todayBahiaDate())`. If a run exists, query `route_run_stops` joined with `schedule_entries` (select `schedule_entry_id, status, passed_at, time, stop_name`) for that run. Call `computeEta()` with the stops array and `now`. Build the `progress` object from the result. If no run exists, set `progress: null`. (5) Include `progress` in the response object. Import `computeEta` from `@/lib/tracking/eta` and `todayBahiaDate` from `@/lib/time`.

- [x] T011 [US3] Extend route detail API at `src/app/api/routes/[routeId]/route.ts`. Apply the same changes as T010: (1) Add `last_lat, last_lng` to van select. (2) Add `lastLat`/`lastLng` to van response. (3) Add `id` to `nextStop`. (4) Query `route_runs` + `route_run_stops` for today, compute progress via `computeEta()`, include in response. Same imports as T010.

**Checkpoint**: Public API returns tracking progress. Existing fields unchanged — fully backward compatible.

---

## Phase 7: User Story 4 — Admin Configures Stop Coordinates (Priority: P2)

**Goal**: Admin users can set latitude and longitude for each schedule entry via the admin panel.

**Independent Test**: In the admin schedule editor, add lat/lng values to a stop, save, reload, and verify values persist.

### Implementation for User Story 4

- [x] T012 [P] [US4] Extend schedule entry validators at `src/lib/validators/schedule-entry.ts`. Add to both `createScheduleEntrySchema` and `updateScheduleEntrySchema`: `stopLat: z.number().min(-90).max(90).nullable().optional()` and `stopLng: z.number().min(-180).max(180).nullable().optional()`. Note: uses `zod/v4` import path (existing convention).

- [x] T013 [US4] Extend admin schedule GET and POST at `src/app/api/admin/routes/[routeId]/schedule/route.ts`. (1) In `GET`: add `stop_lat, stop_lng` to the Supabase `.select()` clause. Add `stopLat: e.stop_lat ?? null` and `stopLng: e.stop_lng ?? null` to each entry in the response mapping. (2) In `POST`: add `stop_lat: parsed.data.stopLat ?? null` and `stop_lng: parsed.data.stopLng ?? null` to the `.insert()` call. Add `stopLat` and `stopLng` to the response entry mapping from `data.stop_lat` and `data.stop_lng`.

- [x] T014 [US4] Extend admin schedule PUT at `src/app/api/admin/routes/[routeId]/schedule/[entryId]/route.ts`. Add `stop_lat: parsed.data.stopLat ?? null` and `stop_lng: parsed.data.stopLng ?? null` to the `.update()` call. Add `stopLat` and `stopLng` to the response entry mapping.

- [x] T015 [US4] Extend schedule editor component at `src/components/admin/schedule-editor.tsx`. (1) Add `stopLat: number | null` and `stopLng: number | null` to the `EntryData` type. (2) Add state for new entry: `newStopLat` and `newStopLng` (string state for input, parsed to number on submit). (3) Add state for editing: `editStopLat` and `editStopLng`. (4) In the add form row, add two number inputs below the existing time/name row: "Latitude" (placeholder: `-12.9714`) and "Longitude" (placeholder: `-38.5124`). Style as secondary/collapsed fields with smaller text. (5) Include `stopLat`/`stopLng` in POST and PUT request bodies (parse to float or null if empty). (6) In the entry display row, show lat/lng as small gray text below the stop name when present (e.g., `"📍 -12.9714, -38.5124"`). (7) In the edit row, populate `editStopLat`/`editStopLng` from `entry.stopLat`/`entry.stopLng` and include editable inputs.

**Checkpoint**: Admins can configure stop coordinates. Inference can now use these coordinates for geofence detection.

---

## Phase 8: User Story 5 — Passengers See ETA in Route Detail (Priority: P2)

**Goal**: Display ETA and inference-based stop progress on the route detail page.

**Independent Test**: Load a route detail page for a running route with tracking data → hero card shows ETA, timeline shows passed stops with completed visual state.

### Implementation for User Story 5

- [x] T016 [US5] Update schedule timeline at `src/components/public/schedule-timeline.tsx`. (1) Add optional props: `passedStopIds?: string[]` and `inferredNextStopId?: string | null`. (2) In `deriveTimelineStops()`: when `passedStopIds` is provided and non-empty, use it to determine stop statuses instead of index-based inference. A stop is `"past"` if its `id` is in `passedStopIds`, `"current"` if its `id === inferredNextStopId`, and `"future"` otherwise. (3) When `passedStopIds` is not provided or empty, fall back to the existing `nextStopId`-based index logic (no behavior change). (4) Add optional `etaMinutes?: number | null` prop. When the current stop is rendered and `etaMinutes` is provided, display `"~{etaMinutes} min"` below the existing `"Próxima parada"` text in blue-400 color.

- [x] T017 [US5] Update hero card at `src/components/public/hero-card.tsx`. (1) Add optional prop: `etaMinutes?: number | null` and `etaISO?: string | null`. (2) When `isRunning` and `etaMinutes` is not null: display below the scheduled time line a new row with `Clock` icon and text `"Chegada estimada: HH:mm (~{etaMinutes} min)"` where `HH:mm` is formatted from `etaISO` using `new Date(etaISO).toLocaleString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" })`. Style as `text-blue-100` to match the gradient card's color scheme. (3) When `etaMinutes` is null, do not render the ETA row — existing display is unchanged.

- [x] T018 [US5] Update route detail page at `src/app/(public)/routes/[routeId]/page.tsx`. (1) Extract `progress` from `data.route` (via the `RouteDetail` type which now includes `progress: RouteProgress | null`). (2) Pass `etaMinutes={route.progress?.etaNextStopMinutes}` and `etaISO={route.progress?.etaNextStopISO}` to `HeroCard`. (3) Pass `passedStopIds={route.progress?.passedStopIds}` and `inferredNextStopId={route.progress?.nextStopId}` to `ScheduleTimeline`. Also pass `etaMinutes={route.progress?.etaNextStopMinutes}`. (4) Update the `nextStopId` derivation: when `route.progress?.nextStopId` is available, use it directly instead of the fragile `stopName + time` lookup. Fall back to the existing lookup when `progress` is null.

**Checkpoint**: Route detail page shows ETA and inference-based stop progress. Falls back to schedule-based display when no tracking data.

---

## Phase 9: User Story 6 — Passengers See ETA on Route List (Priority: P3)

**Goal**: Show a brief ETA indication on each running route's card in the route list.

**Independent Test**: Load route list → running route with tracking data shows "ETA: ~X min" below the next stop pill.

### Implementation for User Story 6

- [x] T019 [US6] Update route card at `src/components/public/route-card.tsx`. (1) The `route` prop is `RouteWithStatus` which now includes `progress: RouteProgress | null`. (2) When `route.progress?.etaNextStopMinutes` is not null: render a small line below the existing next-stop pill with text `"ETA: ~{etaNextStopMinutes} min"` styled as `text-xs text-blue-600 font-medium` with a `Clock` icon (size 3). (3) When `etaNextStopMinutes` is null, do not render the ETA line — existing display unchanged.

**Checkpoint**: Route list shows ETA when available. No visual change when tracking data is absent.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Validate quality gates and backward compatibility across all stories

- [x] T020 Run all quality gates: `npx eslint .` (zero errors), `npx tsc --noEmit` (zero errors), `npm run build` (success), `npx vitest run` (all tests pass). Fix any issues found.

- [x] T021 Verify backward compatibility: confirm that `GET /api/routes` and `GET /api/routes/[routeId]` responses include all existing fields unchanged when no tracking data exists (`progress` should be `null`, existing `nextStop`/`van`/`scheduleStatus` fields intact).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types must exist) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 (needs haversine module)
- **US2 (Phase 4)**: Depends on Phase 1 (needs types) — can run parallel with US1
- **US7 (Phase 5)**: Depends on Phase 3 + Phase 4 (needs all modules implemented to test them)
- **US3 (Phase 6)**: Depends on Phase 3 + Phase 4 (needs inference + ETA modules)
- **US4 (Phase 7)**: Depends on Phase 1 only — can run parallel with US1/US2/US7
- **US5 (Phase 8)**: Depends on Phase 6 (needs progress data in API responses)
- **US6 (Phase 9)**: Depends on Phase 6 (needs progress data in API responses)
- **Polish (Phase 10)**: Depends on all phases complete

### User Story Independence

- **US1 + US2**: Can be implemented in parallel (different files, no shared state)
- **US4**: Fully independent — can be implemented at any time after Phase 1
- **US5 + US6**: Can be implemented in parallel after US3 (different component files)
- **US7**: Must wait for US1 + US2 to be implemented (tests validate those modules)

### Within Each User Story

- Validators/types before services
- Backend modules before API endpoints
- API endpoints before UI components
- Core implementation before integration

### Parallel Opportunities

Within Phase 5 (US7): T007, T008, T009 can all run in parallel (different test files)
Within Phase 7 (US4): T012 can run parallel with other phases (different file)
Within Phase 8+9: US5 and US6 can run in parallel after US3 (different component files)

---

## Parallel Example: User Story 7 (Tests)

```bash
# All three test files can be written simultaneously (different files, no deps between them):
T007: "Create haversine tests at src/__tests__/tracking/haversine.test.ts"
T008: "Create inference tests at src/__tests__/tracking/infer-stop-progress.test.ts"
T009: "Create ETA tests at src/__tests__/tracking/eta.test.ts"
```

## Parallel Example: US1 + US2 + US4

```bash
# After Phase 2 (foundational), these can start simultaneously:
# Developer A: US1 (T004, T005) — inference module + wiring
# Developer B: US2 (T006) — ETA module
# Developer C: US4 (T012–T015) — admin UI for coordinates
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003)
3. Complete Phase 3: US1 — Stop Detection (T004–T005)
4. **STOP and VALIDATE**: Send pings near configured stops → verify `route_run_stops` transition
5. This MVP proves inference works before building ETA or UI on top of it

### Incremental Delivery

1. Setup + Foundational → Types and haversine ready
2. US1 (Stop Detection) → Test pings → **Inference works** ✅
3. US2 (ETA) → Test computations → **ETA logic correct** ✅
4. US7 (Tests) → Run vitest → **Regression protection** ✅
5. US3 (API) → Test API responses → **Progress data exposed** ✅
6. US4 (Admin UI) → Test editor → **Coordinates configurable** ✅
7. US5 + US6 (Public UI) → Visual check → **Passengers see ETA** ✅
8. Polish → Quality gates → **PR ready** ✅

---

## Notes

- [P] tasks = different files, no dependencies between them
- [Story] label maps task to specific user story for traceability
- No new npm dependencies required — all using existing stack
- No new database migration required — all tables/columns exist from `00002_live_tracking.sql`
- Commit after each task or logical group using conventional commits format
- Stop at any checkpoint to validate story independently
