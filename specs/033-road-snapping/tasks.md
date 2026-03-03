# Tasks: Road Snapping for Van GPS Positions

**Input**: Design documents from `/specs/033-road-snapping/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/osrm-match-api.md, research.md, quickstart.md

**Tests**: Not explicitly requested in the feature specification. Test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migration and environment configuration

- [x] T001 Create migration to add snapped coordinate columns in `supabase/migrations/00005_road_snapping.sql` — add `snapped_lat double precision` and `snapped_lng double precision` to `vans` table (both nullable, default NULL)
- [x] T002 [P] Add `OSRM_BASE_URL` to `.env.local.example` with default value `https://router.project-osrm.org` (public demo for dev) and add a comment explaining the variable

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core modules that MUST be complete before user story implementation

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Add `snapped_lat: number | null` and `snapped_lng: number | null` fields to the `Van` type in `src/types/index.ts`
- [x] T004 [P] Create OSRM match client in `src/lib/tracking/osrm.ts` — implement a single async function `snapToRoad(coords: Array<{lat, lng, ts, accuracy?}>, osrmBaseUrl: string): Promise<{lat: number, lng: number} | null>` that: (1) formats coordinates as OSRM `/match/v1/driving/` URL with timestamps and radiuses params, (2) calls OSRM with a 50ms fetch timeout via AbortController (enforces FR-011's `<50ms` latency constraint; typical localhost latency is 5-20ms for 5 coordinates), (3) parses the response and extracts the last tracepoint's `location` as `{lat, lng}`, (4) returns `null` on any error (connection refused, timeout, NoMatch code, null tracepoint), (5) logs a warning via `console.warn` on fallback. Reference `specs/033-road-snapping/contracts/osrm-match-api.md` for the full API contract.

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Accurate Van Marker on Map (Priority: P1) MVP

**Goal**: Van marker on the live tracking map appears on the road surface instead of on buildings or sidewalks

**Independent Test**: Open the live tracking map at close zoom while a van is operating. The marker should appear on the road, not on adjacent buildings or sidewalks.

### Implementation for User Story 1

- [x] T005 [US1] Modify tracking ingestion in `src/app/api/tracking/[vanId]/route.ts` to: (1) after inserting into `van_location_pings` and confirming the ping is newest, query the last 4 pings from `van_location_pings` for this van (ordered by `device_ts DESC`, limit 4), (2) build a 5-coordinate trajectory array (4 recent + current ping), (3) read `OSRM_BASE_URL` from `process.env`, (4) if `OSRM_BASE_URL` is set, call `snapToRoad()` from `src/lib/tracking/osrm.ts`, (5) include `snapped_lat` and `snapped_lng` in the `vans` UPDATE (set to OSRM result or NULL on failure). Keep `last_lat`/`last_lng` as raw GPS. Keep `inferStopProgress` call unchanged (uses raw `lat`/`lng` params, NOT snapped).
- [x] T006 [US1] Modify route detail API in `src/app/api/routes/[routeId]/route.ts` to: (1) add `snapped_lat` and `snapped_lng` to the Supabase `.select()` for the van join, (2) when constructing the `VanPosition` object, use `van.snapped_lat ?? van.last_lat` for `lat` and `van.snapped_lng ?? van.last_lng` for `lng`, (3) when constructing the response `van` object, use `snapped_lat ?? last_lat` for `lastLat` and `snapped_lng ?? last_lng` for `lastLng`. No changes to the map component — it receives corrected coordinates transparently.

**Checkpoint**: At this point, User Story 1 should be fully functional — van markers appear on roads when OSRM is available, fall back to raw GPS otherwise. Map component and ETA computation receive corrected positions automatically.

---

## Phase 4: User Story 2 — Improved ETA Accuracy (Priority: P2)

**Goal**: ETA computation uses road-aligned coordinates for more accurate distance calculations

**Independent Test**: Compare ETA estimates with and without OSRM enabled. Snapped coordinates should produce more consistent ETAs, especially on winding or parallel roads.

### Implementation for User Story 2

> **Note**: This story is automatically delivered by T006. When the route detail API serves `snapped_lat ?? last_lat` as `VanPosition.lat`, the ETA computation in `src/lib/tracking/eta.ts` receives road-aligned coordinates without any code changes. The `haversineDistanceMeters()` call uses whatever `lat`/`lng` values are in `VanPosition`, which are now snapped when available.

- [x] T007 [US2] Verify ETA uses snapped coordinates — confirm in `src/app/api/routes/[routeId]/route.ts` that the `VanPosition` object passed to `computeEta()` uses the snapped-with-fallback values from T006. No code changes expected — this is a verification that the data flow is correct. If the `VanPosition` construction does NOT use the snapped values, update it to match T006's pattern.

**Checkpoint**: ETA computation now benefits from road-aligned positions automatically.

---

## Phase 5: User Story 3 — Graceful Degradation (Priority: P3)

**Goal**: System continues operating with raw GPS when OSRM is unavailable — no user-visible errors

**Independent Test**: Unset `OSRM_BASE_URL` or stop OSRM, send GPS pings, verify tracking/map/ETA all work exactly as before this feature.

### Implementation for User Story 3

> **Note**: Core fallback logic is implemented in T004 (OSRM client returns `null` on any error) and T005 (tracking ingestion sets `snapped_lat = NULL` on failure). This phase adds the env-var bypass and ensures the integration handles missing config.

- [x] T008 [US3] Verify graceful bypass when `OSRM_BASE_URL` is not set — confirm in `src/app/api/tracking/[vanId]/route.ts` (from T005) that when `process.env.OSRM_BASE_URL` is undefined, the OSRM call is skipped entirely (no network request, no error), and `snapped_lat`/`snapped_lng` are set to NULL. The ingestion path must behave identically to pre-feature behavior.
- [x] T009 [US3] Verify route detail API fallback — confirm in `src/app/api/routes/[routeId]/route.ts` (from T006) that when `snapped_lat` is NULL in the database, the API response correctly uses `last_lat`/`last_lng` as `lastLat`/`lastLng` with no errors or missing data.

**Checkpoint**: System is fully resilient — OSRM is a pure enhancement, never a hard dependency.

---

## Phase 6: User Story 4 — Raw GPS Preserved for Audit (Priority: P4)

**Goal**: Original raw GPS coordinates remain intact in the audit trail after road snapping is enabled

**Independent Test**: Query `van_location_pings` after snapping is active — all entries should contain the original device-reported coordinates, unmodified.

### Implementation for User Story 4

> **Note**: This story is satisfied by architectural design — `van_location_pings` INSERT in T005 continues using raw `lat`/`lng` from the device payload (unchanged from current code). Snapped values are only stored in `vans.snapped_lat`/`vans.snapped_lng`, never in the pings table.

- [x] T010 [US4] Verify audit trail preservation — confirm in `src/app/api/tracking/[vanId]/route.ts` (from T005) that the `van_location_pings` INSERT statement still uses the raw `lat`/`lng` values from the validated payload, NOT the snapped values. The INSERT must remain identical to the pre-feature implementation.

**Checkpoint**: Raw GPS audit trail is 100% intact.

---

## Phase 7: OSRM Infrastructure (Self-Hosted Deployment)

**Purpose**: Docker stack for self-hosted OSRM on VPS (Phase 2 of deployment — not needed for dev/testing which uses the public demo)

- [x] T011 [P] Create OSRM Docker Compose stack in `infra/osrm/docker-compose.yml` — define an `osrm` service using `osrm/osrm-backend` image on port 5000, with a volume mount for processed Nordeste map data, `restart: unless-stopped`, and a healthcheck hitting `/match/v1/driving/-38.5,-12.97;-38.51,-12.97`
- [x] T012 [P] Create environment example in `infra/osrm/.env.example` with `OSRM_PORT=5000` and comments documenting the Geofabrik Nordeste extract download URL and OSRM data processing steps (`osrm-extract`, `osrm-partition`, `osrm-customize`)

- [x] T015 [P] Create road data refresh script in `infra/osrm/scripts/update-data.sh` — a shell script that: (1) downloads the latest Geofabrik Nordeste extract, (2) runs `osrm-extract`, `osrm-partition`, `osrm-customize` to process the new data into a temp directory, (3) swaps the processed data into the OSRM volume, (4) restarts the OSRM container via `docker compose restart osrm`. Add a comment header documenting monthly usage (FR-010) and that the swap-and-restart approach minimizes downtime to container restart time (~seconds).

**Checkpoint**: OSRM infrastructure ready for VPS deployment, including monthly data refresh.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and final validation

- [x] T013 Run quality gates — execute `npx tsc --noEmit`, `npx eslint .`, and `npx next build` to verify zero errors
- [x] T014 Validate quickstart.md — follow the steps in `specs/033-road-snapping/quickstart.md` to verify the dev setup works end-to-end with the OSRM public demo

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion (migration must exist before types reference new columns) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — core implementation
- **US2 (Phase 4)**: Depends on T006 from Phase 3 — verification only
- **US3 (Phase 5)**: Depends on T005, T006 from Phase 3 — verification only
- **US4 (Phase 6)**: Depends on T005 from Phase 3 — verification only
- **Infrastructure (Phase 7)**: Independent of Phases 3-6 — can run in parallel with user stories
- **Polish (Phase 8)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **US2 (P2)**: Depends on US1 (T006 serves snapped coords that ETA consumes)
- **US3 (P3)**: Depends on US1 (T005 implements the OSRM call that needs fallback verification)
- **US4 (P4)**: Depends on US1 (T005 modifies the ingestion that must preserve audit trail)

### Within Each User Story

- US1: T005 (tracking ingestion) before T006 (route detail API) — ingestion writes snapped coords that the API reads
- US2-US4: Single verification tasks, no internal ordering

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- T003 and T004 can run in parallel (different files)
- T011, T012, and T015 can run in parallel (different files, independent of app code)
- Phase 7 (Infrastructure) can run in parallel with Phases 3-6 (different directories entirely)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# These two tasks touch different files and can run simultaneously:
Task T003: "Add snapped fields to Van type in src/types/index.ts"
Task T004: "Create OSRM match client in src/lib/tracking/osrm.ts"
```

## Parallel Example: Phase 3 + Phase 7

```bash
# Infrastructure setup is independent of app code:
Task T005: "Integrate OSRM into tracking ingestion"  # App code
Task T011: "Create OSRM Docker Compose stack"          # Infra code (parallel)
Task T012: "Create OSRM .env.example"                  # Infra code (parallel)
Task T015: "Create road data refresh script"            # Infra code (parallel)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001, T002)
2. Complete Phase 2: Foundational (T003, T004)
3. Complete Phase 3: User Story 1 (T005, T006)
4. **STOP and VALIDATE**: Send test GPS pings, verify van marker appears on road at close zoom
5. Deploy to dev — all user stories are satisfied by the US1 implementation

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (T005, T006) → Map markers on roads (MVP!)
3. US2-US4 (T007-T010) → Verification passes confirming ETA, fallback, audit trail
4. Infrastructure (T011, T012, T015) → Self-hosted OSRM ready for VPS
5. Polish (T013, T014) → Quality gates pass, quickstart validated

### Single Developer Strategy

Execute sequentially: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T015 → T013 → T014

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US2/US3/US4 are architectural properties of the US1 design — they have verification tasks but no separate implementation
- The OSRM public demo (`router.project-osrm.org`) is sufficient for development and testing
- Self-hosted OSRM (Phase 7) is needed for production but not for the MVP
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
