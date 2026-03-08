# Tasks: Live Tracking Ingestion

**Input**: Design documents from `/specs/016-live-tracking-ingestion/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not requested for this phase (per research.md R-008). Tests will be added in Phase 2 (inference + ETA).

**Organization**: Tasks are grouped by user story. US3 (Database) is foundational — it blocks US1/US2/US4. US2 (Rate Limiting) and US4 (Timestamp Handling) are merged into US1's endpoint implementation because they are single-line/few-line behaviors in the same file.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Foundational — Database & Types (US3)

**Goal**: Create the database schema and TypeScript types that all other tasks depend on.

**Independent Test**: Run migration against a database; verify tables, columns, constraints, indexes, RLS, and trigger are created. Verify TypeScript compilation passes with extended types.

- [x] T001 [US3] Create database migration with all tables, columns, indexes, triggers, and RLS in `supabase/migrations/00002_live_tracking.sql` — per data-model.md: (1) ALTER `schedule_entries` adding `stop_lat`, `stop_lng`, `geofence_radius_m`; (2) ALTER `vans` adding `last_lat`, `last_lng`, `last_accuracy_m`, `last_speed_mps`, `last_heading_deg`; (3) CREATE TABLE `van_location_pings` with index on `(van_id, received_at DESC)`; (4) CREATE TABLE `route_runs` with UNIQUE `(route_id, service_date)` and `set_updated_at()` trigger; (5) CREATE TABLE `route_run_stops` with composite PK `(run_id, schedule_entry_id)`, CHECK constraint on status, and index on `(run_id, status)`; (6) ENABLE ROW LEVEL SECURITY on all three new tables with no anon policies
- [x] T002 [US3] Extend types in `src/types/index.ts` — add `last_lat`, `last_lng`, `last_accuracy_m`, `last_speed_mps`, `last_heading_deg` to `Van` type; add `stop_lat`, `stop_lng`, `geofence_radius_m` to `ScheduleEntry` type; add new types `VanLocationPing`, `RouteRun`, `RouteRunStop` per data-model.md TypeScript section

**Checkpoint**: Database schema ready, types compile. All subsequent tasks can proceed.

---

## Phase 2: Core Endpoint (US1 + US2 + US4) — MVP

**Goal**: Accept GPS pings from the tracker app, validate them, store in history, and update the van's latest position. Includes rate limiting (US2) and timestamp capping (US4) as they are integral parts of the same handler.

**Independent Test**: `curl -X POST /api/tracking/{vanId} -H "x-ingestion-token: {token}" -d '{"deviceId":"...","lat":-12.97,"lng":-38.51,"accuracy":8.5,"speed":12.3,"heading":180,"ts":1717012345678}'` — verify 200 response, row in `van_location_pings`, updated `vans.last_lat/last_lng/location_updated_at`. Verify 401 for bad token, 400 for invalid body, 404 for unknown van, 429 for >25 req/min.

- [x] T003 [P] [US1] Create Zod validation schema in `src/lib/validators/tracking.ts` — import from `zod/v4`; export `trackingSchema` with: `deviceId` (uuid string), `lat` (number, -90 to 90), `lng` (number, -180 to 180), `accuracy` (nonnegative number, nullable), `speed` (nonnegative number, nullable), `heading` (number 0-360, nullable), `ts` (positive integer) — per contracts/tracking-endpoint.md
- [x] T004 [US1] Implement POST handler in `src/app/api/tracking/[vanId]/route.ts` following the pattern from `src/app/api/ingest/[vanId]/route.ts` — (1) rate limiter at 25 req/min per vanId using `createRateLimiter` [US2]; (2) read `x-ingestion-token` header, return 401 if missing; (3) look up van by vanId via `createServiceClient`, return 404 if not found, 401 if token mismatch; (4) parse body with `trackingSchema`, return 400 on failure via `validationError`; (5) convert `ts` from Unix ms to ISO via `DateTime.fromMillis()`, cap to `now()` if >24h in the future [US4]; (6) insert row into `van_location_pings` (van_id, device_id, lat, lng, accuracy_m, speed_mps, heading_deg, device_ts); (7) update `vans` set `last_lat`, `last_lng`, `last_accuracy_m`, `last_speed_mps`, `last_heading_deg`, `location_updated_at = now()`; (8) return `{ received: true, ts: Date.now() }` with status 200

**Checkpoint**: Full ingestion pipeline working end-to-end. All acceptance scenarios from US1, US2, US4 are testable.

---

## Phase 3: Polish & Quality Gates

**Purpose**: Verify all quality gates pass before PR.

- [x] T005 Run quality gates: `eslint` (zero errors), `tsc --noEmit` (zero errors), `next build` (succeeds), `vitest` (passes with no tests)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (Core Endpoint)**: Depends on Phase 1 completion (types must exist for endpoint code)
- **Phase 3 (Polish)**: Depends on Phase 2 completion

### Task Dependencies

```
T001 (migration) ──┐
                    ├──→ T004 (endpoint)──→ T005 (quality gates)
T002 (types) ──────┤
                    │
T003 (validator) ──┘
```

- T001, T002, T003 can all start in parallel (different files)
- T004 depends on T002 (types) and T003 (validator)
- T005 depends on T004

### User Story Coverage

| Story | Priority | Tasks | Notes |
|-------|----------|-------|-------|
| US3 (Database) | P1 | T001, T002 | Foundational — blocks US1 |
| US1 (Ping Ingestion) | P1 | T003, T004 | Core endpoint |
| US2 (Rate Limiting) | P1 | T004 (step 1) | Merged — single config line in endpoint |
| US4 (Timestamps) | P2 | T004 (step 5) | Merged — few lines of timestamp capping |

### Parallel Opportunities

```bash
# Launch all foundational + validator tasks together:
Task T001: "Create migration in supabase/migrations/00002_live_tracking.sql"
Task T002: "Extend types in src/types/index.ts"
Task T003: "Create validator in src/lib/validators/tracking.ts"

# Then sequentially:
Task T004: "Implement endpoint in src/app/api/tracking/[vanId]/route.ts"
Task T005: "Run quality gates"
```

---

## Implementation Strategy

### MVP (All P1 Stories)

1. Complete T001 + T002 + T003 in parallel (foundational + validator)
2. Complete T004 (endpoint — covers US1, US2, US4)
3. Complete T005 (quality gates)
4. **VALIDATE**: Test via curl per quickstart.md
5. Open PR targeting `dev`

### Commit Plan

- Commit 1: `feat(tracking): add live tracking database migration` (T001)
- Commit 2: `feat(tracking): add tracking types and Zod validator` (T002 + T003)
- Commit 3: `feat(tracking): implement POST /api/tracking/[vanId] endpoint` (T004)

---

## Notes

- [P] tasks = different files, no dependencies
- US2 and US4 are not separate phases because their code lives entirely within the US1 endpoint handler (1 line for rate limiter config, 3 lines for timestamp capping)
- No tests in this phase per research.md R-008 — tests arrive in Phase 2 (inference + ETA) when there's domain logic worth testing
- Follow existing `ingest/[vanId]/route.ts` as the reference pattern for the endpoint
- All imports use `zod/v4` path per codebase convention
