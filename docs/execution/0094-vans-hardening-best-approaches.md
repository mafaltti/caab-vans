# CAAB Vans — Hardening: Best Approaches and Recommended Order

## Best Approaches

After re-validating the code and test suite, the fix work should focus on five confirmed or materially real gaps.

### 1. Replay Stop Inference by Event Time, Not Just Latest-Position Time

The strongest gap is in `tracking-batch/[vanId]/route.ts`: all accepted pings are stored, but only `newestUpserted` is sent into inference. The best fix is to make inference accept `deviceTs` and derive `now`/`serviceDate` from that timestamp instead of `todayBahiaDate()` and wall-clock `now`. Then batch ingestion can replay newly accepted points in chronological order for stop progression, while still updating the van's latest position only once. That is better than trying to infer from the newest point only, because missed buffered crossings are otherwise unrecoverable.

### 2. Make `route_run_stops` Canonical State, Not Provisional Evidence

Right now late false-positive passes can remain stored as `passed` and are only hidden by the read path. The best fix is to normalize before writing: compute candidate matches and backfills in memory, collapse them to the contiguous canonical prefix, then persist only that final state plus pointers. If auditability matters, add a separate evidence trail such as `candidate_passed` or a stop-event log — do not overload `route_run_stops` with both evidence and canonical progress. That is better than the current "write first, demote later in memory" approach because it removes sticky false positives from storage.

### 3. Replace Capped Raw-Only Confidence with Source-Aligned Evidence

The query in `infer-stop-progress.ts` is now ordered correctly, so nondeterminism is no longer the problem. The remaining weakness is that confidence is based on raw-only evidence and capped at 50 pings. The best fix is to score confidence from the same coordinate source that actually triggered the pass. Long term, store snapped coordinates per ping so snapped passages can be corroborated by snapped history. Short term, remove the arbitrary cap or replace it with a time-bucketed rule such as "2 confirming pings at least N seconds apart in the last 5 minutes." That is more robust than a raw row-count threshold.

### 4. Use One Shared Position-Selection Policy for ETA and Stop Passage

The current system still lets ETA/public position prefer snapped coordinates while stop passage can reject them. The best fix is to extract a shared helper that, given raw point, snapped point, displacement, and target stop, returns the effective position and source. Use that helper in both `eta.ts` and `infer-stop-progress.ts`. For the UI, keep road-snapped display in general, but near the active stop prefer the same effective point used by ETA/passage, or at least expose the chosen `positionSource` for debugging. That removes backend inconsistency without giving up map quality everywhere else.

### 5. Treat Orphan-Shift Reconciliation as a Shared Runtime Invariant, Not Just an Ops Script

The repo now has `scripts/reconcile-orphaned-shifts.ts` and tests, so the gap is no longer "missing code" — it is operational dependency. The best fix is defense in depth:

- Keep the scheduled reconciliation job as the mutating path.
- Extract orphan detection into a shared helper used by both the script and the read path.
- Surface `runHealth = "normal" | "orphaned"` or equivalent when a route still has an open shift but clearly satisfies orphan criteria.
- Add a heartbeat or health signal so the system can detect if reconciliation stops running.

That is better than silently changing `runStatus` on reads, because it preserves operational truth while making failures visible.

---

## Recommended Order

1. Event-time replay for batch and buffered pings.
2. Canonicalize `route_run_stops` before write.
3. Shared position-selection helper for ETA and passage.
4. Source-aligned confidence model.
5. Reconciliation health/heartbeat hardening.

---

## What To Prove

- A buffered batch where an earlier point crosses a stop must advance progress correctly.
- A low-confidence late match must not leave a persistent non-contiguous `passed` row behind.
- ETA target selection and stop passage must use the same effective point for the active stop.
- Snapped confidence must be based on snapped-capable evidence, not just raw ping count.
- An orphaned shift must be detectable even if the scheduled reconciliation job is not running.
