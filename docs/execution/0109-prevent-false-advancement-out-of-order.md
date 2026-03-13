# Hotfix Plan: Prevent False Advancement From Out-of-Order Device Geofences

## Summary
- Goal: stop false stop progression when a later stop’s device geofence fires before an earlier scheduled stop on the real road.
- Safety rule: a device geofence event may only advance route progress when it extends the contiguous passed prefix. Otherwise it must stay retryable and unacked.
- Hotfix scope: no schema change and no mobile contract change. `processedEventIds` stays the same; some events will now remain buffered longer.

## Implementation Changes

### process-device-geofence-events.ts
[Source](C:/Projetos/caab-vans/src/lib/tracking/process-device-geofence-events.ts)

- Remove the gap-1 backfill block entirely (lines 275-299).
- Move the `matchedIndex = pendingStops.findIndex(...)` call (currently inside the backfill block at line 276) to immediately after the confidence check (after line 253), before the mark-as-passed block.
- Only mark the stop `passed` (lines 256-273) and update the ledger to `matched` (lines 302-310) when `matchedIndex === 0`.
- When `matchedIndex > 0`, do not write to `route_run_stops`, do not mark the ledger row `matched`, and leave the event retryable as `received`.
- Add structured logging for deferred non-adjacent events with `vanId`, `runId`, `eventId`, `placeId`, `matchedScheduleEntryId`, `firstPendingScheduleEntryId`, `matchedSequence`, and `firstPendingSequence`.
- Keep the existing duplicate/retry behavior; `received` now explicitly covers both transient failures and deferred non-adjacent events (lines 46-101 are unchanged).

### route.ts (defense-in-depth)
[Source](C:/Projetos/caab-vans/src/app/api/tracking/[vanId]/route.ts)

- Harden `appendGeofenceResponse` (lines 238-281) so ack is based on canonical contiguity, not only `status=’passed’`.
- For each `matched_run_id` involved in submitted events, load that run’s stops with `stop_sequence`, compute the contiguous passed prefix with the existing `enforceCanonicalPrefix` helper from [enforce-canonical-prefix.ts](C:/Projetos/caab-vans/src/lib/tracking/enforce-canonical-prefix.ts), and ack only events whose `matched_schedule_entry_id` is inside the `contiguousPassedIds` set.
- Preserve current response shape and duplicate-ping behavior.
- Note: with the process-device-geofence-events guard, non-adjacent events stay `received` and never appear in the `status=’matched’` query. This route.ts change is a safety net for race conditions and legacy data.

### operations/config (database, not code)
- Set explicit `device_geofence_radius_m` values in `schedule_entries` for CAAB, Fórum Ruy Barbosa, and similar dense downtown stops instead of relying on the 150m default. The column already exists (migration 00015). Target radii TBD after auditing GPS traces and road geometry.
- Audit active routes for close stop clusters where road geometry can enter a later stop’s geofence before an earlier scheduled stop.

### live-data remediation (database, not code)
- Use a one-time manual SQL runbook after deploy, not a repo-tracked script.
- For active/today `route_runs`, clear any non-contiguous `passed` rows back to `pending` with null pass metadata, then recompute `last_passed_stop_id` and `next_stop_id` from the contiguous prefix.

## Test Plan

### Unit tests — process-device-geofence-events.test.ts
[Source](C:/Projetos/caab-vans/src/__tests__/tracking/process-device-geofence-events.test.ts)

Existing tests (9 total). Changes:

- **Replace** “backfills gap-1 preceding pending stop at confidence 0.80” (lines 397-435) with “does not backfill predecessor” — same setup (two pending stops, event matches the second), but assert only 0 stop updates and event stays `received`.
- **Add** “defers non-adjacent device geofence match” — seq 18 matched while seq 17 is still pending; expect no stop updates, no ledger transition to `matched`, event stays `received`.
- **Add** “retries deferred event after earlier stop is passed” — start from an existing `received` event, reconfigure pending stops so the matched stop is now head-of-line (`matchedIndex === 0`), confirm it matches and marks the stop `passed`.
- **Add** “deferred event remains deferred across multiple retries” — event is deferred on first call, still deferred on second call (earlier stop still pending), succeeds on third call (earlier stop now passed).
- **Keep** all other passing tests unchanged (happy path, no_match, idempotent duplicate, healed re-process, GPS corroboration, closest-in-time, early arrival window, no_match recovery).

### Unit tests — tracking route handler (new file)
Create `src/__tests__/api/tracking/route.test.ts`.

Note: no route-handler test infrastructure exists today. Use `NextRequest`/`NextResponse` mocks and inject a mock Supabase client. Scope to `appendGeofenceResponse` logic only — extract it as a testable function if needed to avoid full HTTP scaffolding.

- Duplicate ping with a non-contiguous matched stop returns `processedEventIds: []`.
- Contiguous matched stop still returns the submitted `eventId`.
- Previously corrupted non-contiguous `passed` rows do not produce an ack.

### Verification commands
- `npm test -- --run src/__tests__/tracking`
- `npm test -- --run src/__tests__/api/tracking` (new)
- `npm run typecheck`

## Rollout and Acceptance
- Apply the stop-radius config changes first or in the same release.
- Deploy the server hotfix next.
- Execute the manual SQL reconciliation immediately after deploy.
- Monitor deferred-event logs to confirm they appear on known problematic segments and do not advance progress incorrectly.
- Acceptance criteria:
  - CAAB firing before Fórum no longer marks Fórum passed and no longer advances `next_stop_id` to Comércio.
  - The CAAB event remains buffered until Fórum is legitimately confirmed or CAAB later becomes contiguous.
  - A normal in-order device geofence still marks the stop passed and returns its `eventId` in `processedEventIds`.
  - Duplicate pings never ack a non-contiguous device event.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Stuck deferred events — earlier stop's geofence never fires, deferred event retries every ping indefinitely | Medium | Acceptable for this hotfix. Follow-up: add a run-end cleanup that marks remaining `received` events as `no_match` when the route_run is completed/ended. |
| Incorrect `stop_sequence` data blocks legitimate contiguous events | Low | `stop_sequence` is computed on insert (migration 00016). Existing data is audited. |
| `received` status is now overloaded (transient failure vs. deferred non-adjacent) | Low | Structured logging distinguishes the two cases. Follow-up: consider adding a `deferred` status if observability needs grow. |
| Race between `processDeviceGeofenceEvents` and `enforceCanonicalPrefix` healing | Low | route.ts defense-in-depth check covers this; healing reverts stop to pending which prevents ack. |

## Assumptions
- This hotfix prioritizes “no false advancement” over immediate confirmation of out-of-order device geofence events.
- The tracker already handles longer-lived buffered events correctly because unacked events remain in the local buffer.
- A first-class out-of-order evidence model is out of scope for this fix; if needed later, it should be designed separately instead of writing non-contiguous rows into `route_run_stops`.
- Deferred events have no TTL in this hotfix. A run-end cleanup (mark remaining `received` as `no_match` when route_run ends) should be added as a fast follow-up to prevent unbounded retries.
