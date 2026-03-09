**Findings**
- `[P1]` Forgotten active shifts keep a route `in_progress` indefinitely. [run-status.ts](C:/Projetos/caab-vans/src/lib/tracking/run-status.ts#L9) returns `in_progress` whenever any shift has `ended_at = null`, and both public route endpoints wire `isRunning` directly to that result in [route.ts](C:/Projetos/caab-vans/src/app/api/routes/route.ts#L140) and [route.ts](C:/Projetos/caab-vans/src/app/api/routes/[routeId]/route.ts#L148). I did not find any auto-close path; the only write that sets `ended_at` is the manual driver endpoint in [end/route.ts](C:/Projetos/caab-vans/src/app/api/routes/[routeId]/end/route.ts#L66). If a driver never ends the shift, the route can stay “running” after service hours with stale or missing GPS.

- `[P2]` Stop-passage confidence is computed from an unordered arbitrary slice of recent pings. [infer-stop-progress.ts](C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts#L246) queries raw pings with `gte(device_ts, windowStart)` and then just [limits to 50](C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts#L249) without any `order(...)`. The resulting `pingsInGeofence` count in [infer-stop-progress.ts](C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts#L259) feeds both `pass_confidence` and the backfill gate in [infer-stop-progress.ts](C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts#L328). Under higher ping volume, confidence can become nondeterministic depending on which 50 rows PostgREST returns.

- `[P2]` Segment ETA still collapses to `0 min` for overdue pending stops in degraded GPS mode. The selection logic now correctly falls back to the first pending stop even when every pending stop is overdue in [eta.ts](C:/Projetos/caab-vans/src/lib/tracking/eta.ts#L92), but the `segment` branch still computes arrival as `lastPassedAt + estimatedTravel` in [eta.ts](C:/Projetos/caab-vans/src/lib/tracking/eta.ts#L272) and clamps negative time deltas to zero in [eta.ts](C:/Projetos/caab-vans/src/lib/tracking/eta.ts#L273). If the van is still late and GPS is unavailable, the API reports `0` instead of a late/uncertain remaining ETA.

- `[P3]` Snapped-stop confidence metadata is not actually stronger when more evidence exists. The code chooses `geofence_snapped` vs `geofence_raw` per stop, but for snapped matches the confidence is `0.8` whether `pingsInGeofence >= 2` or not in [infer-stop-progress.ts](C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts#L264) and [infer-stop-progress.ts](C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts#L267). Those confirming pings are also raw GPS points from [infer-stop-progress.ts](C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts#L246), not snapped positions. So `pass_confidence` is not fully comparable across raw vs snapped paths.

- `[P3]` `includeLastKnown` is only half wired into the public payload. Both route endpoints accept the query flag and pass it through to `resolveRouteProgress` in [route.ts](C:/Projetos/caab-vans/src/app/api/routes/route.ts#L61) and [route.ts](C:/Projetos/caab-vans/src/app/api/routes/[routeId]/route.ts#L119), but the top-level summary fields still gate `nextStop` and `currentStopIndex` on `isRunning` in [route.ts](C:/Projetos/caab-vans/src/app/api/routes/route.ts#L145) and [route.ts](C:/Projetos/caab-vans/src/app/api/routes/[routeId]/route.ts#L153). That means `progress` can contain last-known stop data while the summary fields stay `null`, which makes the API internally inconsistent for consumers that rely on the top-level fields.

**Testing Gaps**
- I did not see coverage for the “active shift left open past schedule end” case.
- I did not see a test that exercises `includeLastKnown=true` and verifies top-level `nextStop/currentStopIndex`.
- I did not see a test with more than 50 recent pings to prove confidence/backfill behavior remains stable under load.

**Best Approaches**
The remaining issues can be addressed with targeted changes. This does not need another rewrite.

1. **Handle orphaned active shifts with reconciliation, not just read-time logic**
   The root problem is that [run-status.ts](C:/Projetos/caab-vans/src/lib/tracking/run-status.ts) treats any open shift as `in_progress`, and the only close path is the manual driver endpoint at [end/route.ts](C:/Projetos/caab-vans/src/app/api/routes/[routeId]/end/route.ts). The best fix is a two-layer model:
   - Keep `route_shifts` as the source of truth for audit.
   - Add a reconciliation rule that auto-ends clearly orphaned shifts when all of these are true: active shift exists, now is past the route’s last scheduled stop plus a grace window, and there has been no GPS fix or progress update for a configurable inactivity period.
   
   This is better than silently changing `deriveRunStatus()` because it fixes the underlying data, not just the presentation. If you want visibility before hard auto-close, add `runHealth = "normal" | "orphaned"` in [resolve-route-progress.ts](C:/Projetos/caab-vans/src/lib/tracking/resolve-route-progress.ts) and only turn on the cleanup job after observing it in logs.

2. **Make confidence evidence deterministic**
   The current confidence query in [infer-stop-progress.ts](C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts#L246) uses a time window but no `order(...)`, then caps at 50 rows. The best fix is:
   - query the full 5-minute window ordered by `device_ts DESC`
   - either remove the limit entirely, or set it to a deterministic ceiling based on expected tracker cadence
   - if you keep a cap, ensure it comfortably covers the whole window under normal operation
   
   Given the current tracker cadence, reading all pings for 5 minutes is operationally cheap and much safer than returning an arbitrary 50-row slice. If this ever becomes expensive, the next step is to precompute evidence during ingestion rather than sampling ad hoc in [infer-stop-progress.ts](C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts).

3. **Stop returning `0 min` from degraded segment ETA when the prediction is already in the past**
   The accumulated segment-distance fix in [eta.ts](C:/Projetos/caab-vans/src/lib/tracking/eta.ts) is good, but the overdue behavior is still weak because the segment branch anchors ETA to `lastPassedAt` and then clamps negative remaining time to zero at [eta.ts](C:/Projetos/caab-vans/src/lib/tracking/eta.ts#L272). The best fix is:
   - if `segment` predicted arrival is already `< now`, do not return `etaNextStopMinutes = 0`
   - instead fall through to `schedule` fallback
   - if schedule fallback is also already in the past, return `etaNextStopMinutes = null` and add an explicit low-confidence state such as `etaStatus = "overdue_uncertain"`
   
   `0 min` implies “arriving now”, which is false in degraded mode. `null` or an explicit uncertain state is more honest.

4. **Make snapped confidence monotonic and evidence-based**
   Right now snapped matches in [infer-stop-progress.ts](C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts#L264) get the same confidence whether or not there are multiple confirming pings. The best near-term fix is to replace the hardcoded branches with a score built from explicit features:
   - whether raw current ping is in geofence
   - whether snapped current ping is in geofence
   - recent raw ping count in geofence
   - snap displacement size
   - how close current time is to the stop’s scheduled time
   
   Then make the score monotonic: more evidence should never lower or freeze confidence. The best medium-term fix is to store snapped coordinates per ping as well, so snapped matches can be supported by snapped history instead of raw-only history.

5. **Finish wiring `includeLastKnown` through the top-level route summary**
   The flag is already accepted by [routes/route.ts](C:/Projetos/caab-vans/src/app/api/routes/route.ts#L61) and [routes/[routeId]/route.ts](C:/Projetos/caab-vans/src/app/api/routes/[routeId]/route.ts#L119), and it affects `progress` via [resolve-route-progress.ts](C:/Projetos/caab-vans/src/lib/tracking/resolve-route-progress.ts). But top-level `nextStop` and `currentStopIndex` are still gated by `isRunning` in [routes/route.ts](C:/Projetos/caab-vans/src/app/api/routes/route.ts#L145) and [routes/[routeId]/route.ts](C:/Projetos/caab-vans/src/app/api/routes/[routeId]/route.ts#L153).
   
   The best fix is:
   - when `includeLastKnown=true`, derive top-level `nextStop` and `currentStopIndex` from `progress.nextStopId` even if `isRunning` is false
   - add a discriminator like `nextStopMode = "live" | "last_known" | null`
   
   That keeps the API internally consistent and avoids forcing consumers to special-case `progress` vs summary fields.

6. **Add targeted regression coverage before more logic changes**
   The most valuable tests to add are:
   - orphaned active shift remains open forever unless reconciliation runs
   - confidence calculation with more than 50 pings in the 5-minute window
   - `includeLastKnown=true` populates top-level `nextStop/currentStopIndex`
   - overdue `segment` ETA does not return `0 min`
   - snapped confidence rises when corroborating evidence increases
   
   The files to extend are [infer-stop-progress.test.ts](C:/Projetos/caab-vans/src/__tests__/tracking/infer-stop-progress.test.ts), [eta.test.ts](C:/Projetos/caab-vans/src/__tests__/tracking/eta.test.ts), and the route-progress tests under [src/__tests__/tracking](C:/Projetos/caab-vans/src/__tests__/tracking).

**Recommended Order**
Start with the deterministic confidence query and the `includeLastKnown` summary fix. Those are low-risk and remove current inconsistencies quickly. Then fix degraded overdue ETA semantics, then add orphan-shift reconciliation, then refine the confidence model for snapped matches.