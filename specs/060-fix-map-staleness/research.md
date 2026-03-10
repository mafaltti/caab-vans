# Research: Fix Map Staleness

## R1: Stationary Throttle Value

**Decision**: Reduce `STATIONARY_MAX_INTERVAL` from `60_000` to `20_000` (20 seconds).

**Rationale**: 20 seconds balances freshness vs. data volume. At 5s GPS collection, a stationary van currently sends ~1 ping/min. At 20s, it sends ~3 pings/min — a 3x increase but still modest bandwidth (~600 bytes/min). 15s was considered but is aggressive for vans that may idle for hours at the depot.

**Alternatives considered**:
- 15s: More responsive but higher volume for no meaningful UX gain (frontend polls every 5s, so 20s already guarantees at most one "stale" poll cycle).
- 30s: Still a 2x improvement but leaves noticeable gaps where the dot appears stuck.

## R2: Stale Guard Relaxation Strategy

**Decision**: During cold gaps (>120s since last send), skip the stale guard entirely — send all points regardless of age, up to the existing accuracy filter.

**Rationale**: The current stale guard creates a feedback loop during Android doze: gap grows → point staler → dropped → gap grows more. During a cold gap, any GPS data is better than none. The accuracy filter (`ACCURACY_THRESHOLD = 50m`) already prevents garbage data. The original guard (spec 043) was designed for steady-state operation where stale cached fixes cause position jumps — but after a 2+ minute gap, there's no "current position" to jump from.

**Alternatives considered**:
- Increase stale threshold universally to 120s: Helps cold gaps but relaxes quality during normal operation, potentially allowing stale cached fixes through.
- Add `stale: true` flag to payload: Requires API contract change and server-side handling. Over-engineered for the benefit — the server already accepts any valid GPS point.
- Keep current behavior with doubled thresholds: Partial fix; 120s threshold already exists for cold+stationary but doesn't cover cold+moving.

## R3: Staleness Threshold Value

**Decision**: Reduce `STALENESS_THRESHOLD_MINUTES` from `10` to `3`.

**Rationale**: With the tracker sending heartbeats every 20s, a 3-minute silence strongly indicates the tracker has stopped (battery kill, app crash, phone off). Existing test `is-location-fresh.test.ts` must be updated for the new value.

**Alternatives considered**:
- 2 minutes: Risks false positives during brief phone tunnels or elevator passages.
- 5 minutes: Too long — users stare at a frozen dot for 5 minutes before getting any feedback.

## R4: "Last Updated" Timestamp Source

**Decision**: Use the existing `lastGpsFixAt` field already present in the API response (`RouteWithStatus.van.lastGpsFixAt`). No API changes needed.

**Rationale**: The route detail API already returns `lastGpsFixAt` (ISO string) at line 218 of `src/app/api/routes/[routeId]/route.ts`. The frontend page component (`page.tsx:262`) already passes it to `HeroCard` but NOT to `VanTrackingMap`. Simply threading this prop through to the map component is sufficient.

**Alternatives considered**:
- Use `location_updated_at`: Already queried from DB (line 37) but not exposed in API. Would require API response change. `last_gps_fix_at` is the correct field — it represents when the GPS fix was taken, not when the server processed it.
- Compute staleness client-side: Would require syncing clocks. Better to keep the `isLocationOutdated` boolean computed server-side and only use `lastGpsFixAt` for the relative time display.

## R5: Test Strategy for Tracker Filters

**Decision**: No new tests for the van-tracker app in this spec. The tracker app has zero test infrastructure and setting it up is out of scope.

**Rationale**: The main Next.js app has a mature vitest setup, but `apps/van-tracker/` has no test config, no test files, and uses Expo Task Manager which requires complex mocking. The changes in this spec are constant tweaks and a small conditional change — low risk of regression. Adding tracker test infrastructure should be a separate spec.

**Alternatives considered**:
- Add vitest to van-tracker: Significant effort (Expo + React Native mocking, Task Manager stubs). Out of scope for a focused fix.
- Extract filter logic to a pure function and test it: Good idea but a refactor — YAGNI for this spec where we're changing 2-3 lines.

## R6: Existing Test Impact

**Decision**: Update `src/__tests__/time/is-location-fresh.test.ts` to reflect the new 3-minute threshold.

**Rationale**: The test at line 52-54 explicitly asserts `STALENESS_THRESHOLD_MINUTES === 10`. This must change to 3. Other test cases using 9-minute and 11-minute fixtures need updating to use values around the 3-minute boundary.
