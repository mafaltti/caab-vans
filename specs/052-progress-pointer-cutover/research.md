# Research: Progress Pointer Cutover

**Feature**: 052-progress-pointer-cutover
**Date**: 2026-03-08

## 1. ETA Target Selection — Current vs Required

**Decision**: Add optional `targetStopId?: string` parameter to `computeEta`.
**Rationale**: Current time-floor selection (`sortedPending[0]` at `eta.ts:88`) cannot honor a persisted pointer pointing to an overdue stop. The explicit parameter allows the resolver to pass the trusted pointer directly, bypassing internal selection when valid.
**Alternatives considered**:
- Modify time-floor logic to consider overdue stops → rejected, changes existing behavior for all callers
- Pass pointer externally and override ETA result's `nextStopId` → rejected, ETA would still compute for the wrong stop

## 2. Progress Assembly Duplication

**Decision**: Extract shared `resolveRouteProgress()` helper into `src/lib/tracking/resolve-route-progress.ts`.
**Rationale**: ~160 lines of identical logic duplicated across `routes/route.ts` (lines 132-287) and `routes/[routeId]/route.ts` (lines 140-296). Includes: `route_runs` fetch, shift derivation, `route_run_stops` loading, speed/ping assembly, `computeEta` call, and next-stop override. DRY principle satisfied (identical logic, 2 occurrences, but constitutes the entire critical path).
**Alternatives considered**:
- Keep duplication and add shadow mode in both handlers → rejected, doubles maintenance risk during cutover
- Use middleware/wrapper → rejected, Next.js route handlers don't share middleware cleanly

## 3. Write Path Error Handling

**Decision**: Capture and log errors from all three unchecked writes in `infer-stop-progress.ts`.
**Rationale**: Geofence mark (line 266), backfill mark (line 321), and pointer persist (line 378) all lack error capture. The seed operation (line 115) already demonstrates the correct pattern: `const { error } = await supabase...`. Silent write failures make the cutover unsafe.
**Alternatives considered**:
- Add retry logic → rejected (YAGNI), fallback-to-legacy on read path is sufficient for now
- Throw on write failure → rejected, would break tracking ingestion for transient errors

## 4. Feature Flag Pattern

**Decision**: Use `TRACKING_PROGRESS_SOURCE` env var with values `legacy|shadow|persisted`, defaulting to `legacy`.
**Rationale**: Consistent with existing env var patterns (`DEBUG_ETA` for boolean checks, `OSRM_*_TIMEOUT_MS` with `parsePositiveInt` for validated values). Server-side only, no client exposure needed.
**Alternatives considered**:
- Database-stored flag → rejected, requires schema change and admin UI for a temporary rollout control
- LaunchDarkly/Unleash → rejected, no existing FF infrastructure; env var is simpler for a one-time cutover

## 5. Pointer Staleness Threshold

**Decision**: 30 minutes, checked via `progress_updated_at` age.
**Rationale**: ~2x the maximum reasonable ping interval (10-15 min). GPS staleness is 10 min (`STALENESS_THRESHOLD_MINUTES` in `time.ts:13`); pointer staleness is intentionally longer because pointer writes happen less frequently than ping reception.
**Alternatives considered**: 15 min (too aggressive, GPS gaps would trigger false fallbacks), 60 min (too conservative, stale pointers served too long)

## 6. GPS Stale + Pointer Fresh Precedence

**Decision**: Pointer freshness controls which `nextStopId` is targeted; GPS freshness controls which ETA computation branch is used. These are orthogonal.
**Rationale**: When GPS is stale (>10 min), ETA already falls back to segment or schedule-based computation (`eta.ts:112-144`). The pointer determines *which stop* to compute for; GPS freshness determines *how* to compute the distance/time. Both can be stale/fresh independently.
**Alternatives considered**: Coupling them (if GPS stale, ignore pointer) → rejected, pointer is updated by inference logic which doesn't require fresh GPS to make correct stop-progression decisions.

## 7. Grouped Stops Under Cutover

**Decision**: No special handling needed. `resolveNextStop` operates on individual `schedule_entry_id` values, and `infer-stop-progress.ts` already handles group-aware geofence selection (lines 171-226).
**Rationale**: The persisted `next_stop_id` always references a specific schedule entry, not a group. The grouping logic is only relevant during inference (write path), not during resolution (read path).
**Alternatives considered**: Resolve pointer to nearest group member → rejected, would change semantics; the inference already picked the correct entry.

## 8. Existing Test Infrastructure

**Finding**: 4,005 lines across 9 test files in `src/__tests__/tracking/`. Key files:
- `infer-stop-progress.test.ts` (1,983 lines) — comprehensive mock-based testing of inference logic
- `eta.test.ts` (1,140 lines) — 91 tests covering GPS, OSRM, segment, schedule branches
- `routes-api.test.ts` (262 lines) — tests helper functions only, not endpoint flow

**Gap**: No tests exist for explicit target stop in ETA, no endpoint-level tests for progress assembly, no UI component tests for ETA gating.
