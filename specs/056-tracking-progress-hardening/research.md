# Research: Tracking Progress Hardening

## R1: Non-Adjacent Pointer Persistence

**Decision**: Enforce adjacency at both write-time (infer) and read-time (resolver) — defense in depth.

**Rationale**: The write path (`infer-stop-progress.ts:396-414`) already picks the first chronologically pending stop as `nextStopId`, which is correct when all prior stops are passed. The bug occurs when backfill is skipped (confidence <= 0.7) — a later stop gets marked passed while earlier ones remain pending. The derived `nextStopId` is then the first pending stop (correct), but `lastPassedStopId` points to the non-adjacent later stop (incorrect gap). The read path trusts both without checking adjacency.

**Fix approach**:
- **Write-time** (`infer-stop-progress.ts`): After deriving `lastPassedStopId`, validate that no pending stops exist between it and the first pending stop. If a gap exists, override `lastPassedStopId` to the last contiguously-passed stop (the one immediately before the first pending stop).
- **Read-time** (`resolve-route-progress.ts:172-189`): Add an adjacency check — verify that `next_stop_id` is the immediate successor of `last_passed_stop_id` in the sorted schedule. If not, reject the pointer and fall back to schedule-based ETA.

**Alternatives considered**:
- Force backfill even at low confidence: Rejected — would introduce false-positive passage marks.
- Only fix write-time: Rejected — stale non-adjacent pointers already persisted would remain problematic.

## R2: Nondeterministic Ping Query

**Decision**: Add stable tiebreaker ordering and explicit row limit to the recent-pings query.

**Rationale**: The query at `infer-stop-progress.ts:187-192` orders by `device_ts DESC` but has no tiebreaker for identical timestamps and no explicit `.limit()`. Supabase REST API defaults vary, so different invocations can return different row sets, causing confidence to fluctuate.

**Fix approach**:
- Add `.order("id", { ascending: false })` as tiebreaker after `device_ts` ordering.
- Add `.limit(50)` to cap the sample explicitly.
- These two changes make the query fully deterministic for any given time window.

**Alternatives considered**:
- Push geofence filtering into PostGIS: Rejected — optimization, not correctness fix; out of scope.
- Remove the limit entirely: Rejected — unbounded queries under high ping volume could degrade performance.

## R3: Overdue ETA UI Rendering

**Decision**: Add `etaStatus` check to the route card component; render overdue indicator when `etaStatus === "overdue"`.

**Rationale**: The backend already correctly returns `etaStatus: "overdue"` with `etaNextStopMinutes: null` (confirmed in `eta.ts:279-289` and `eta.ts:333-343`). The route card (`route-card.tsx:71-78`) only checks `etaNextStopMinutes != null` — it silently hides the ETA section when overdue instead of showing a delay indicator.

**Fix approach**:
- When `etaStatus === "overdue"` and the stop ID matches, render a "Delayed" badge (e.g., amber/orange text with clock icon) instead of the "ETA: ~X min" line.
- Keep existing behavior for `etaStatus === "estimated"` (show minutes).
- No new backend changes needed — only UI.

**Alternatives considered**:
- Show computed delay minutes (e.g., "5 min late"): Rejected for now — delay accuracy under degraded GPS is questionable; simple "Delayed" is safer.
- Do nothing (hide ETA when overdue): Rejected — silence is worse than a clear signal.

## R4: `includeLastKnown` Response Consistency

**Decision**: Centralize the waiting-state exclusion in `resolveRouteProgress()` rather than fixing it in each route handler.

**Rationale**: Both route handlers (`routes/route.ts:169-178`, `routes/[routeId]/route.ts:177-186`) gate last-known population on `progress.runStatus !== "waiting"`. But `resolveRouteProgress()` still populates `progress.nextStopId` for waiting routes when `includeLastKnown=true`, creating an inconsistent response.

**Fix approach**:
- In `resolveRouteProgress()`, after the early-return gate (line 83), add a condition: if `runStatus === "waiting"` and `includeLastKnown`, null out progress fields (same as the existing non-running nullification at lines 274-281).
- This ensures the response is always consistent regardless of which handler consumes it.

**Alternatives considered**:
- Fix each route handler independently: Rejected — duplicates logic, violates DRY.
- Remove the waiting exclusion entirely: Rejected — stale progress from a previous day's run should not leak into a waiting state.
