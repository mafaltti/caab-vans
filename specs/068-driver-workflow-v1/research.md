# Research: Driver Workflow V1

**Feature**: 068-driver-workflow-v1
**Date**: 2026-03-11

## R1: Contiguous-Prefix Modification for "skipped" Status

**Decision**: Treat `skipped` as "resolved" in the contiguous-prefix walk, identical to `passed`.

**Rationale**: The contiguous-prefix rule (in `enforceCanonicalPrefix()`) walks stops by `stop_sequence` and breaks at the first non-`passed` stop. To allow progression past a skipped stop, the walk must continue through `skipped` stops. The simplest change is:

```
if (stop.status === "passed" || stop.status === "skipped") → add to resolved set
else → break
```

This means `skipped` stops:
- Do NOT block head-of-line advancement
- Are included in the "resolved prefix" for pointer calculation
- Cannot be backfilled or reverted (they are terminal)

**Alternatives considered**:
- Separate "exception prefix" set: Rejected — adds complexity with no behavioral difference in V1.
- Skip as a flag on `passed`: Rejected — conflates two distinct outcomes and makes audit queries harder.

**Files affected**: `enforce-canonical-prefix.ts`, `persist-canonical-progress.ts`, `resolve-route-progress.ts`, `infer-stop-progress.ts`, `process-device-geofence-events.ts`, `eta.ts`, `run-status.ts`

---

## R2: Head-of-Line Blocking with Skipped Stops

**Decision**: The head-of-line check must skip over `skipped` stops to find the first `pending` stop.

**Rationale**: In `processDeviceGeofenceEvents()`, the guard `if (matchedIndex > 0) return` drops events that don't match the first pending stop. After a skip, the "first pending" is now the stop after the skipped one. The guard must filter `allPendingStops` to exclude `skipped` stops, or equivalently, only consider `pending` stops.

Current code filters stops with `status === "pending"` from `route_run_stops`. Since skipped stops will have `status === "skipped"`, they naturally won't appear in the pending list. **No code change needed in the filter** — the existing query `WHERE status = 'pending'` already excludes non-pending rows. The head-of-line guard works correctly as-is once the status is updated.

**Verification needed**: Confirm that `allPendingStops` is filtered by `status = 'pending'` (not by exclusion of `passed` only).

---

## R3: Backfill Interaction with Skipped Stops

**Decision**: Backfill in `inferStopProgress()` must not un-skip a stop. Backfill only applies to `pending` stops.

**Rationale**: The backfill logic in `inferStopProgress()` collects pending stops with `stop_sequence < maxPassedSeq` and bulk-marks them as `passed` with `pass_source = "backfill"`. Since skipped stops have `status = "skipped"` (not `pending`), the existing filter `WHERE status = 'pending'` naturally excludes them. The backfill will fill `pending` gaps but leave `skipped` stops untouched.

**Verification needed**: Confirm the backfill UPDATE query filters by `status = 'pending'` explicitly.

---

## R4: ETA Computation with Skipped Stops

**Decision**: ETA skips over `skipped` stops — they are treated as resolved, not as destinations.

**Rationale**: `computeEta()` in `eta.ts` works from the `next_stop_id` pointer. Since `persistCanonicalProgress()` will set `next_stop_id` to the first `pending` stop (skipping over `skipped`), the ETA engine automatically targets the correct stop. Delay computation uses the last `passed` stop's actual-vs-scheduled time — `skipped` stops should be excluded from delay calculation (they weren't served).

**Change needed**: In `resolveRouteProgress()`, the `effectiveRunStops` filtering must treat `skipped` like `passed` for the contiguous prefix, but exclude `skipped` from the "passed stops" used for delay computation (since there's no `passed_at` representing actual service time).

---

## R5: Run Status When All Stops Are Skipped

**Decision**: If all stops are resolved (passed or skipped) and no pending stops remain, the run's progression is complete. The `deriveRunStatus()` function is not affected — it derives from shifts, not stops. However, `resolveRouteProgress()` must handle `next_stop_id = null` (all resolved) gracefully.

**Rationale**: `deriveRunStatus()` checks shifts (active/ended) and schedule window, not stop statuses. If all stops are skipped and the shift is still active, status is `in_progress`. If the shift ends, it's `idle` or `completed` depending on schedule window.

`resolveRouteProgress()` already handles `next_stop_id = null` (route completed). No change needed.

---

## R6: Geofence Events for Already-Skipped Stops

**Decision**: Drop the event. A skipped stop cannot transition to any other status.

**Rationale**: In `processDeviceGeofenceEvents()`, the matching logic looks up `route_run_stops` by `schedule_entry_id`. If the matched stop has `status = "skipped"`, it should be treated as already resolved and the event should be logged as `no_match` (or a new status like `skipped_stop`). The simplest approach: after matching, check `if (matchedStop.status !== "pending") return` — this already exists implicitly since the code only processes pending stops.

---

## R7: Active-Route Screen Data Source

**Decision**: Create a new `GET /api/driver/routes/[routeId]` endpoint that combines the existing `resolveRouteProgress()` output with tracker health data.

**Rationale**: The public `GET /api/routes/[routeId]` endpoint returns route progress, schedule, ETA, and van position — everything the active-route screen needs except tracker health (battery, network type, last ping age). Adding tracker health to the public endpoint would leak driver concerns. A new driver-specific endpoint wraps the same `resolveRouteProgress()` call and adds a single query for the latest `van_location_ping` to extract health data.

**Alternatives considered**:
- Reuse public endpoint + separate health endpoint: Rejected — two round-trips per refresh cycle.
- Add tracker health to public endpoint behind a query param: Rejected — public/driver separation is cleaner.

---

## R8: Polling Pattern for Active-Route Screen

**Decision**: Use TanStack Query with `refetchInterval: 5000`, matching the existing public route detail page pattern.

**Rationale**: The public route detail page (`src/app/(public)/routes/[routeId]/page.tsx`) already uses TanStack Query with 5-second polling for route progress. The active-route screen should follow the same pattern for consistency. TanStack Query handles deduplication, stale data, and background refetching.

---

## R9: Navigation Handoff URI

**Decision**: Use `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=driving` as the primary navigation URI, with `geo:{lat},{lng}` as fallback.

**Rationale**: Google Maps URLs work across all Android devices (most driver phones). The `geo:` URI scheme opens the device's default map app but has inconsistent behavior across manufacturers. Google Maps URL is the most predictable for the CAAB driver fleet (Android phones).

---

## R10: Audit Event Table Design

**Decision**: Create a dedicated `route_run_events` table with a flat schema (no polymorphic columns).

**Rationale**: The audit trail needs to record skip, detour-enter, and detour-exit events with consistent fields. A flat table with `event_type`, `schedule_entry_id` (nullable for non-stop events), `actor_id`, `reason_code`, `note`, and `metadata` (jsonb for future extensibility) is simpler than separate tables per event type. RLS: service-role only (same as route_run_stops).

**Alternatives considered**:
- Extend `tracking_geofence_events`: Rejected — that table is device-specific with different semantics (place_id, entered_at).
- JSONB event log column on `route_runs`: Rejected — not queryable, not immutable, violates append-only audit principle.

---

## R11: Skip Reason Codes (V1 List)

**Decision**: The following predefined reason codes for stop-skip in V1:

| Code | Label (pt-BR) |
|------|---------------|
| `road_closure` | Via interditada |
| `no_passengers` | Sem passageiros |
| `facility_closed` | Local fechado |
| `vehicle_issue` | Problema no veiculo |
| `other` | Outro (unlocks free-text) |

**Rationale**: Covers the most common real-world scenarios reported by CAAB operations. "Other" with free-text handles edge cases while keeping structured data for the majority.

---

## R12: Detour Reason Codes (V1 List)

**Decision**: The following predefined reason codes for detour in V1:

| Code | Label (pt-BR) |
|------|---------------|
| `road_closure` | Via interditada |
| `accident` | Acidente |
| `construction` | Obra na via |
| `flooding` | Alagamento |
| `police_checkpoint` | Blitz policial |
| `other` | Outro (unlocks free-text) |

**Rationale**: Road-condition-specific reasons are distinct from stop-skip reasons. Some codes overlap intentionally (`road_closure`, `other`) because the same cause can trigger both stop-level and route-level actions.

---

## R13: Detour State Storage

**Decision**: Store detour state as columns on `route_runs`: `is_detour_active` (boolean), `detour_reason_code` (text), `detour_note` (text). Clear on shift end.

**Rationale**: Detour is a route-run-level state (not stop-level). Storing it on `route_runs` makes it queryable from the public route list endpoint without joining the events table. The events table still records the full enter/exit audit trail.

**Alternatives considered**:
- Derive from latest event: Rejected — requires scanning events table on every public route list call.
- Separate `route_detours` table: Rejected — over-engineering for a simple boolean flag.
