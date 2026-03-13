# Applying the Driver Workflow Recommendations — Gap Analysis

*Cross-referenced the 0112 recommendations against every relevant file in the codebase on March 11, 2026.*

---

## How to Read This Document

The 0112 analysis proposed four priorities. This document maps each one to the current codebase, identifies what exists vs. what must be built, sizes the effort, and flags risks. The goal is to turn the recommendations into a concrete spec backlog.

---

## Priority 1 — Active-Route Driver Screen + Tracker Health + Navigation Handoff

### What the recommendation says

> Add a dedicated active-route screen powered by the existing route detail endpoint: next stop hero, ETA/delay, `Navegar`, map, upcoming stops, tracker health, and shift controls.

### What exists today

| Capability | Status | Where |
|---|---|---|
| Route list dashboard | Done | `src/app/driver/page.tsx` |
| Shift start/end controls | Done | `src/components/driver/route-card.tsx` |
| Cold-start stop confirmation | Done | `confirm-start-stop` endpoint + dialog |
| Shift history display | Done | Route card footer |
| Route detail API (public) | Done | `GET /api/routes/[routeId]` returns full progress, ETA, van position, schedule |
| Live tracking map (public) | Done | `src/app/(public)/routes/[routeId]/page.tsx` with MapLibre, 5s polling |
| ETA computation | Done | `src/lib/tracking/eta.ts` — GPS/OSRM/schedule branches |
| Tracker health metadata | Partial | `van_location_pings` stores battery, network type, buffer/failure counts |
| Driver-specific route detail endpoint | Missing | Public endpoint exists, no driver-auth wrapper |
| Active-route page | Missing | No `/driver/routes/[routeId]` page |
| Navigation handoff (Navegar) | Missing | No deep-link to Google Maps / Waze |
| Driver-side tracker health display | Missing | Health stored in pings, not surfaced in UI |
| Auto-polling/refresh | Missing | Driver page loads once, no periodic refresh |

### Gap analysis

**Small gaps (reuse existing work):**

1. **Route detail data** — The public `GET /api/routes/[routeId]` already returns everything the active-route screen needs: schedule entries with stop names/times/coordinates, route_run progress (next_stop_id, last_passed_stop_id), van position, ETA, delay, tracking status. The driver screen can call this same endpoint (it's public) or a thin driver-auth wrapper could be added that delegates to `resolveRouteProgress()`.

2. **Map component** — The public route detail page (`src/app/(public)/routes/[routeId]/page.tsx`) already has a MapLibre component with van marker, stop markers, route polyline, and 5-second auto-refetch. This can be extracted or shared.

3. **ETA/delay computation** — `computeEta()` in `src/lib/tracking/eta.ts` already handles GPS-based, segment-based, and schedule fallback branches. No changes needed to the ETA engine.

**Medium gaps (new code, existing patterns):**

4. **Active-route page** — New page at `/driver/routes/[routeId]` needs to be created. It should compose:
   - Next-stop hero card (stop name, ETA, delay badge)
   - Map (reuse existing MapLibre component)
   - Upcoming stops list with passed/pending status
   - Shift controls (extracted from route-card.tsx)
   - Navigation button ("Navegar" → `geo:` or Google Maps deep-link)
   - Auto-polling (TanStack Query `refetchInterval` like the public page does)

5. **Tracker health display** — Query the latest `van_location_ping` for the route's van to show battery level, network type, last ping age, buffer/failure counts. The data is there; needs a small UI component.

6. **Navigation handoff** — Simple: construct a `geo:lat,lng` URI or `https://www.google.com/maps/dir/?api=1&destination=lat,lng` link from the next stop's coordinates. One-liner, but needs UX decision on which app to target.

### Estimated scope

- **New files**: ~3 (active-route page, driver-route-detail component, navigation helper)
- **Modified files**: ~2 (driver layout for nav, route-card to link to active route)
- **Backend changes**: 0–1 (optional driver-auth wrapper for route detail)
- **Migrations**: 0
- **Risk**: Low. Mostly frontend composition of existing data and components.

---

## Priority 2 — Skip-Next-Stop and Detour Events with Reasons and Audit

### What the recommendation says

> V1 should allow only `skip current next stop`, with required reason, confirmation, and audit log. Before real deviation support, extend stop/run data to include exception statuses and reasons: `pending`, `passed`, `skipped`, maybe `deferred`; plus `reason_code`, `note`, `acted_by`, `acted_at`, and a run event log.

### What exists today

| Capability | Status | Where |
|---|---|---|
| Stop status enum | `pending \| passed` only | `route_run_stops` CHECK constraint, `src/types/index.ts` |
| Pass source tracking | Done | `pass_source` column: geofence_raw, geofence_snapped, backfill, manual, device_geofence |
| Pass confidence | Done | `pass_confidence` numeric 0.0–1.0 |
| Contiguous-prefix enforcement | Done | `enforceCanonicalPrefix()` — heals gaps |
| Head-of-line blocking | Done | `processDeviceGeofenceEvents()` — drops non-first-pending events |
| Reason codes | Missing | No `reason_code` column |
| Free-text notes | Missing | No `note` column |
| Actor tracking | Missing | No `acted_by`/`acted_at` columns |
| Event log table | Missing | `tracking_geofence_events` is device-only, not a general audit log |
| Skip-stop API endpoint | Missing | No endpoint to skip a stop |
| Detour event API | Missing | No endpoint to enter/exit detour |
| Run-level exception flags | Missing | No `has_skipped_stops`, `is_deviating`, etc. on `route_runs` |
| Public app exception warnings | Missing | No deviating/exception display |

### Gap analysis

This is the **hardest priority** because it touches the core progression invariant.

**Schema changes required (migration 00020+):**

1. **Extend `route_run_stops.status`** — ALTER CHECK constraint from `('pending', 'passed')` to `('pending', 'passed', 'skipped')`. Adding `deferred` is explicitly deferred to Priority 3 per the recommendation.

2. **Add stop exception metadata** — New columns on `route_run_stops`:
   - `reason_code text` (nullable) — structured reason for skip
   - `note text` (nullable) — free-form driver explanation
   - `acted_by uuid` (nullable) — FK to auth.users
   - `acted_at timestamptz` (nullable) — when action recorded

3. **Create `route_run_events` table** — General-purpose audit log:
   - `id`, `run_id`, `event_type`, `schedule_entry_id`, `actor_id`, `reason_code`, `note`, `metadata jsonb`, `created_at`
   - Event types V1: `stop_skipped`, `cold_start_confirmed`, `detour_started`, `detour_ended`

4. **Add run-level exception flags** — On `route_runs`:
   - `has_skipped_stops boolean DEFAULT false`
   - `exception_note text` (for detour reason)

**Backend logic changes:**

5. **Contiguous-prefix rule must treat `skipped` as "resolved"** — The key design decision: when the prefix scanner encounters a `skipped` stop, it should treat it like `passed` for progression purposes (the stop is no longer blocking). Otherwise, skipping a stop would not unblock the next stop.

   Current code in `enforceCanonicalPrefix()`:
   ```typescript
   for (const stop of sortedStops) {
     if (stop.status === "passed") {
       contiguousPassedIds.add(stop.schedule_entry_id);
     } else {
       break; // STOP at first non-passed
     }
   }
   ```

   Must become:
   ```typescript
   for (const stop of sortedStops) {
     if (stop.status === "passed" || stop.status === "skipped") {
       resolvedIds.add(stop.schedule_entry_id);
     } else {
       break;
     }
   }
   ```

   This change ripples through:
   - `enforceCanonicalPrefix()` — treat skipped as resolved
   - `persistCanonicalProgress()` — next_stop_id skips over skipped stops
   - `resolveRouteProgress()` — ETA skips over skipped stops
   - `computeEta()` — delay computation skips over skipped stops
   - `inferStopProgress()` — backfill must also consider skipped as resolved
   - `processDeviceGeofenceEvents()` — head-of-line must skip over skipped stops

6. **New API endpoint: `POST /api/routes/[routeId]/skip-stop`** — Driver-only, requires:
   - Active shift belonging to requesting driver
   - `stopId` must be current `next_stop_id`
   - `reasonCode` (required, enum)
   - `note` (optional, free-text)
   - Returns updated progress pointers

7. **New API endpoint: `POST /api/routes/[routeId]/detour`** — Driver-only:
   - `action: "start" | "end"`
   - `reason` (required on start)
   - Sets/clears `exception_note` on `route_runs`
   - Logs event to `route_run_events`

**Frontend changes:**

8. **Exception drawer on active-route page** — As recommended, first actions:
   - "Pular próxima parada" (skip next stop) — shows reason picker + optional note + confirmation
   - "Entrar em desvio" / "Sair do desvio" (toggle detour)
   - Future: "Confirmar parada manualmente", "Pausar/retomar", "Encerrar turno"

9. **Skipped stop display** — In the schedule timeline (both driver and public), show skipped stops with distinct styling (strikethrough, gray, reason tooltip).

### Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Contiguous-prefix change breaks existing progression | High | Comprehensive unit tests for `enforceCanonicalPrefix()` with skipped stops; deploy behind feature flag if needed |
| ETA becomes unreliable after skip | Medium | ETA engine already handles "next pending" logic; just needs to skip over skipped stops in the sorted list |
| Head-of-line blocking interaction with skip | Medium | If stop #2 is skipped, device geofence for stop #3 should now be valid (it's the new head-of-line). Must test this flow |
| Backfill interaction with skip | Medium | If GPS inference sees stop #4 while #2 is skipped, backfill should fill #3 but not un-skip #2. Confidence logic needs review |
| Migration on production data | Low | New columns are all nullable with defaults; additive-only migration |

### Estimated scope

- **New files**: ~5 (skip-stop endpoint, detour endpoint, event log helpers, migration, exception drawer component)
- **Modified files**: ~8 (enforce-canonical-prefix, persist-progress, resolve-progress, eta, infer-stop-progress, process-device-geofence, types, public route detail)
- **Migrations**: 1 (00020: status enum + metadata columns + event log table + run flags)
- **Tests**: Must add/update unit tests for the modified progression logic
- **Risk**: Medium-High. Core invariant change, but well-scoped (only `skipped`, not `deferred`).

---

## Priority 3 — Deferred Stop / Rerank Remaining Stops

### What the recommendation says

> If "skip now and come back later" is needed later, model it as `deferred`, not `skipped`. That requires an execution order for remaining stops; otherwise the current `next_stop_id` and head-of-line geofence rules will keep snapping back to planned order.

### What exists today

Nothing. The current model has no concept of deferred stops or dynamic execution order.

### Gap analysis

This is the **most architecturally disruptive** change because it breaks the fundamental assumption that `stop_sequence` determines execution order.

**Core problem:**

Today, all progression logic sorts by `stop_sequence` (the planned order). If a driver defers stop #3 to the end, the system needs a separate "execution order" that differs from `stop_sequence`. The current `next_stop_id` pointer would need to skip #3 now but eventually come back to it.

**Required changes:**

1. **New column on `route_run_stops`**: `execution_sequence integer` (nullable) — overrides `stop_sequence` for this run. NULL means "use planned order."

2. **Rerank API**: `POST /api/routes/[routeId]/rerank-stops` — Accepts a new execution order for remaining pending stops. Only admin or controlled-access.

3. **Contiguous-prefix logic must sort by `execution_sequence ?? stop_sequence`** instead of `stop_sequence`. This changes every single place that sorts stops.

4. **Head-of-line blocking must use execution order** — Device geofence matching must respect the dynamic order.

5. **ETA must recalculate based on new order** — If stop #3 is deferred to after #5, the ETA for #4 changes because the van doesn't detour through #3's location.

6. **Geofence registration on tracker device must update** — If the tracker app has geofences registered in planned order, deferring a stop means the device needs to know the new order (or at least which geofences to ignore).

### Recommendation

**Do not build this until Priority 2 is stable in production.** The 0112 analysis explicitly says "model it as `deferred`, not `skipped`" and "requires an execution order for remaining stops" — acknowledging this is a model change. The skip-only V1 (Priority 2) is the correct stepping stone.

If deferred is needed, consider a simpler intermediate: treat deferred as "skipped with a flag" that the driver manually re-confirms later (via the existing `confirm-start-stop` pattern), rather than full dynamic reranking.

### Estimated scope

- **Schema**: 1 migration (execution_sequence, deferred status, rerank helpers)
- **Backend**: ~10 files modified (every file that sorts by stop_sequence)
- **Frontend**: Reorder UI, deferred stop management
- **Risk**: High. Fundamental model change.

---

## Priority 4 — Public Warning States for Route Exceptions

### What the recommendation says

> Add passenger-facing warning states when a driver enters detour or skip mode. Otherwise the public app will keep presenting a clean planned route while operations are explicitly deviating from it.

### What exists today

| Capability | Status | Where |
|---|---|---|
| Public route list | Done | `GET /api/routes` → `RouteWithStatus[]` |
| Public route detail | Done | `GET /api/routes/[routeId]` → full progress + ETA |
| Schedule timeline UI | Done | Bottom sheet with passed/upcoming stops |
| Exception display | Missing | No visual indication of skipped stops or deviations |

### Gap analysis

This is a **frontend-only change** once Priority 2 is in place (the `has_skipped_stops` flag and skipped stop status will already be in the API responses).

**Required changes:**

1. **Route list warning badge** — On `RouteWithStatus`, if `has_skipped_stops` or `exception_note` is set, show a warning icon/text (e.g., "Rota com desvio" or "Parada pulada").

2. **Route detail skipped-stop styling** — In the schedule timeline, render skipped stops with strikethrough text, a "Pulada" badge, and the reason (if available).

3. **Detour banner** — If the route run has `exception_note` set (detour active), show a banner at the top of the route detail page: "Esta rota está em desvio: [reason]".

4. **ETA caveat** — When stops are skipped, ETA may change. Show a small note: "Tempo estimado pode variar — parada(s) pulada(s)."

### Dependencies

Requires Priority 2 to be complete (schema + API changes).

### Estimated scope

- **New files**: ~1 (exception badge component)
- **Modified files**: ~3 (route list page, route detail page, schedule timeline)
- **Backend**: 0 (data already in responses after Priority 2)
- **Migrations**: 0
- **Risk**: Low.

---

## Cross-Cutting Concerns

### TypeScript types

`src/types/index.ts` needs:
- `RouteRunStop.status` extended to `"pending" | "passed" | "skipped"`
- New fields: `reason_code`, `note`, `acted_by`, `acted_at`
- New type: `RouteRunEvent`
- `RouteRun` extended with `has_skipped_stops`, `exception_note`

### Test coverage

Key files that MUST have tests updated/added:
- `enforceCanonicalPrefix()` — new status handling
- `persistCanonicalProgress()` — pointer calculation with skipped stops
- `resolveRouteProgress()` — progress resolution with skipped stops
- `inferStopProgress()` — backfill interaction with skipped
- `processDeviceGeofenceEvents()` — head-of-line with skipped
- `computeEta()` — ETA over skipped stops
- New skip-stop endpoint — validation, state transitions, audit

### Existing test infrastructure

The repo uses Vitest. Existing tests should be checked for coverage of the progression pipeline.

---

## Implementation Order

```
Phase A: Active-Route Screen (Priority 1)
├── No backend changes
├── No migrations
├── Unblocks driver usability immediately
└── Can ship independently

Phase B: Skip-Stop Foundation (Priority 2a — Schema + Backend)
├── Migration 00020: status enum + metadata + event log + run flags
├── Modify contiguous-prefix logic
├── New skip-stop endpoint
├── New detour endpoints
├── Update types
└── Full test coverage

Phase C: Skip-Stop UI (Priority 2b — Frontend)
├── Exception drawer on active-route page
├── Skipped stop display in timeline
└── Depends on Phase A (active-route page) and Phase B (API)

Phase D: Public Warnings (Priority 4)
├── Frontend-only
├── Warning badges and banners
└── Depends on Phase B (data in API responses)

Phase E: Deferred Stops (Priority 3) — Future
├── Schema change for execution_sequence
├── Full progression model update
└── Only after Phase B is stable in production
```

### Recommended spec sequence

1. **spec/068-active-route-screen** — Priority 1 (Phase A)
2. **spec/069-skip-stop-exception-model** — Priority 2a (Phase B)
3. **spec/070-exception-drawer-ui** — Priority 2b (Phase C)
4. **spec/071-public-exception-warnings** — Priority 4 (Phase D)

---

## Summary Table

| Priority | Effort | Risk | Backend | Frontend | Migration | Dependencies |
|---|---|---|---|---|---|---|
| 1. Active-route screen | Medium | Low | 0–1 files | ~5 files | 0 | None |
| 2. Skip-stop + audit | Large | Medium-High | ~8 files | ~3 files | 1 | None (but Benefits from P1) |
| 3. Deferred stops | Very Large | High | ~10+ files | ~5 files | 1 | P2 stable |
| 4. Public warnings | Small | Low | 0 | ~4 files | 0 | P2 complete |
