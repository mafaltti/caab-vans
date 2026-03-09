# CAAB Vans — Phase 2 Progress Pointer Cutover: Gap Analysis

## Findings

### [P1] Segment Fallback ETA Is Structurally Weak Beyond the Immediate Next Segment

In `eta.ts` the code explicitly notes that `osrmDistanceM` belongs to the last passed stop's immediate successor, but it will still use it for whatever `targetStopId` is active. That means persisted-pointer mode can compute ETA for an overdue or non-successor target using the wrong segment distance, and because the base time is `lastPassed.passedAt`, the result can clamp to `0` minutes even when the stop is still pending.

### [P1] Persisted Progress Path Is Not the Default Behavior

`resolve-route-progress.ts` reads `TRACKING_PROGRESS_SOURCE`, but defaults to `legacy`. So the system now writes `next_stop_id` and `progress_updated_at`, but unless production explicitly sets the env var, the public API keeps serving the old time-floor selection logic.

### [P2] Pointer Freshness Fallback Can Regress a Valid Overdue Next Stop into "No ETA"

Pointers are discarded after `30` minutes in `time.ts` and `resolve-route-progress.ts`, then the code falls back to legacy ETA selection. In legacy mode, `eta.ts` filters pending stops by `time >= now`, so once every pending stop is overdue the route loses `nextStopId` and ETA entirely — even if the persisted pointer was the only correct target.

### [P2] Hybrid Raw/Snapped Inference Is Still Too Coarse

The snap decision is global per ping, not per stop. `infer-stop-progress.ts` switches to snapped coordinates purely when raw-to-snapped displacement is `<= 50m`, then uses that same effective point for every candidate stop. That is safer than the old split, but it still cannot distinguish "snap is good for road geometry" from "snap is bad for an off-road campus/depot stop".

### [P2] Passage Confidence Uses Raw Pings Even When Passage Source Is Snapped

The confidence query in `infer-stop-progress.ts` reads raw `van_location_pings`, and can still write `pass_source = geofence_snapped`. That means the system can mark a snapped-based pass with "high confidence" or "low confidence" using evidence from a different coordinate source.

### [P2] Backfill Is Still Permissive for One-Stop Gaps

The gate in `infer-stop-progress.ts` allows backfill whenever `gap <= 1`, even if the triggering match was only a low-confidence raw geofence hit. This is much better than unconditional backfill, but it still means one noisy passage can auto-pass the immediately previous stop.

### [P3] Non-Active Runs Hide Too Much State

`resolve-route-progress.ts` returns empty `passedStopIds`, null `nextStopId`, and null ETA for `waiting`, `idle`, and `completed`. If the product ever needs "last known progress" for a completed run, paused run, or a driver who briefly stopped and restarted, that information is already in the DB but intentionally suppressed at the API layer.

## Residual Gaps

The test suite is strong on unit behavior, but the biggest remaining risk is integration behavior under production data volume and environment settings:

- No real DB-level validation that the recent-ping confidence query remains deterministic under high ping counts
- No end-to-end assertion that production is running with `TRACKING_PROGRESS_SOURCE=persisted`
- No full-path verification that segment fallback stays correct when persisted pointers target overdue stops

The highest-priority weaknesses are the **segment ETA approximation**, the **legacy-default progress mode**, and the **stale-pointer regression path**. Those are the three to treat as the next real correctness issues.
