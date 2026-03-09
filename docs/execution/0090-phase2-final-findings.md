# CAAB Vans — Phase 2 Final Findings

## Findings

### [P1] Low-Confidence Late Stop Matches Can Still Persist a Non-Adjacent Progress State

Backfill is skipped unless confidence is `> 0.7` in `infer-stop-progress.ts`, but `lastPassedStopId` and `nextStopId` are then derived independently from the final stop rows and persisted to `route_runs`. The resolver only checks that the pointer exists, is pending, and is fresh — it does not enforce adjacency. When that happens, the segment branch is skipped unless `nextStopIdx > lastPassedIdx`, and the code falls back to schedule ETA, which can yield misleading `0 min` for a still-pending stop.

### [P1] A Forgotten Open Shift Keeps the Route `in_progress` Indefinitely

`deriveRunStatus()` returns `in_progress` whenever any shift has `ended_at = null` in `run-status.ts`, and both public route endpoints wire `isRunning` directly to that value. No automatic close path was found; the only code that sets `ended_at` is the manual driver endpoint at `end/route.ts`.

### [P2] Stop-Passage Confidence Is Still Nondeterministic and More Expensive Than Necessary

`inferStopProgress()` re-queries recent pings inside the per-group loop using raw `lat, lng`, filters only by a time lower bound, and caps the sample at `50` rows without any explicit ordering. That raw count drives both `pass_confidence` and the backfill gate, so high ping volume or unstable row ordering can change passage confidence and whether backfill happens at all.

### [P2] `includeLastKnown=true` Does Not Fully Propagate to the Top-Level Route Summary

Both public route endpoints accept the flag and pass it into `resolveRouteProgress()`, but the top-level `nextStop` and `currentStopIndex` are still only derived when `isRunning` is true. A response can contain last-known `progress.nextStopId` while the top-level summary remains `null`.

### [P2] Degraded Segment ETA Still Collapses to "Arriving Now" When the Estimate Is Already in the Past

In the segment branch, arrival is anchored to `lastPassedAt + accumulatedTravel`, and negative remaining time is clamped to zero. Even when the target is adjacent and accumulated distances are correct, a late van with stale or unusable GPS can still produce `0 min` instead of "overdue/uncertain".

### [P3] Snapped-Match Confidence Is Still Weakly Calibrated

The chosen source is tracked in `infer-stop-progress.ts`, but confidence for snapped matches is flat `0.8` whether or not corroborating pings exist. Those corroborating pings are also counted from the raw-position query, so `pass_confidence` is not monotonic and not fully aligned with the source used to mark the stop.

---

## Open Questions / Assumptions

- A later stop can legitimately be matched before earlier pending stops in low-confidence conditions, and this is not meant to be impossible by data design alone.
- Orphaned active shifts are treated as an operational bug, not an intentional "still running until driver closes it" product rule.

---

## Brief Summary

The current implementation is much stronger than earlier versions: persisted pointers are now the default, segment ETA accumulates multiple stop distances, and last-known progress exists. The main remaining weaknesses are:

- **Consistency under degraded or partial progress states**
- **Lack of automatic shift reconciliation**
- **Confidence logic that still depends on a nondeterministic recent-ping sample**
