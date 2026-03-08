# Research: Last-Known Client Wiring

**Date**: 2026-03-08
**Feature**: 055-last-known-client-wiring

## Decision 1: Hook Query Parameter Approach

**Decision**: Append `?includeLastKnown=true` as a hardcoded query string to both fetch URLs.

**Rationale**: The flag should always be on — there's no user-facing toggle. Both `useRoutes` and `useRouteDetail` currently have zero query params, so this is a simple string append. No need to update queryKeys since the flag is static (not dynamic).

**Alternatives considered**:
- Making it configurable via hook param → YAGNI, no consumer needs to toggle it
- Adding to queryKey → Unnecessary since the flag is always `true`; cache key stability is unaffected

## Decision 2: Branch Reorder in deriveTimelineStops

**Decision**: Move the `passedStopIds.length > 0` check (currently step 4, line 51) above the `!isRunning` catch-all (currently step 3, line 44).

**Rationale**: The existing derivation logic in the `passedStopIds` branch already correctly handles all the classification (passedSet, inferredNextStopId, time-based fallback). It works identically for running and non-running routes — the only issue is that the `!isRunning` guard prevents it from executing. The existing test at line 162 ("returns all neutral when not running") confirms the current blocking behavior and must be updated.

**Alternatives considered**:
- Adding a separate `!isRunning && passedStopIds` branch → DRY violation; duplicates the existing passedStopIds logic
- Checking `nextStopMode === "last_known"` → Not available in the function signature; would require plumbing a new param for no benefit

## Decision 3: Visual Distinction for Last-Known Current Marker

**Decision**: Pass `nextStopMode` to `ScheduleTimeline` and use it only in the TimelineNode rendering layer. When `nextStopMode === "last_known"`, the "current" node renders with gray styling (zinc) instead of blue, and the pulse animation is suppressed.

**Rationale**: The derivation logic (`deriveTimelineStops`) should remain mode-agnostic — it classifies stops by position data regardless of source. The visual distinction belongs in the rendering layer where it's a simple conditional on the dot's CSS classes.

**Alternatives considered**:
- Adding a new status like `"last_known_current"` to deriveTimelineStops → Leaks rendering concerns into pure logic
- No visual distinction → Violates FR-006 and risks user confusion

## Decision 4: HeroCard Prop Extension

**Decision**: Add `nextStopMode` to `HeroCardProps`. Insert a new early-return branch after the `completed` check and before the `in_progress + !isRunning` check.

**Rationale**: HeroCard already has a well-structured cascade of early returns. The new branch fits naturally at position 2 (after completed, before other non-running states). The parent component already has `nextStopMode` from `RouteWithStatus`.

**Alternatives considered**:
- Passing the full `RouteWithStatus` object → Over-fetching; HeroCard should only receive what it renders
- Modifying existing branches → Riskier; the new branch is cleanly isolated

## Decision 5: Testing Approach

**Decision**: Extend existing `schedule-timeline.test.ts` with new cases for non-running routes with passedStopIds. Add new test file for route-card last-known label gating. Follow the project's pure-function extraction pattern.

**Rationale**: The codebase tests `deriveTimelineStops` as an exported pure function (7 existing tests). The route-card ETA test uses a similar pattern with `shouldShowEtaBadge`. This approach avoids needing `@testing-library/react` which isn't installed.

**Alternatives considered**:
- Component rendering tests → No `@testing-library/react` in project; would require new dependency for minimal gain
- Hook-level tests for `useRoutes`/`useRouteDetail` → No existing pattern; the URL change is trivial and verified by integration testing

## Decision 6: Waiting-Route Suppression at Backend (Review Fix)

**Decision**: Suppress last-known summaries for `runStatus === "waiting"` in both route handlers (`route.ts`), not in individual client components.

**Rationale**: The backend route handlers are the single source of `nextStopMode`. Guarding at the source prevents all consumers (route card, hero card, timeline, any future component) from seeing stale progress on waiting routes. A client-side-only fix (e.g., hero-card guard) would leave other components vulnerable to the same bug.

**Alternatives considered**:
- Guard in each client component → Fragile; every new consumer must remember to check `runStatus !== "waiting"`
- Guard in `resolveRouteProgress` → Too deep; `resolveRouteProgress` correctly returns the pointer; the _display_ decision belongs in the route handler

## Decision 7: ETA Nulling in Stale-Pointer Safeguard (Review Fix)

**Decision**: When the stale-pointer safeguard in `resolve-route-progress.ts` nulls `nextStopId`, also null `etaNextStopMinutes` and `etaNextStopISO`.

**Rationale**: The safeguard existed to prevent schedule-derived guesses from leaking as "last_known" data, but it only nulled `nextStopId` while leaving ETA fields intact. This allowed non-null ETA values to reach client components, which then rendered live-looking ETAs beside gray "Última posição" UI. Additionally, client-side ETA guards (`nextStopMode !== "last_known"`) were added as defense-in-depth.

**Alternatives considered**:
- Client-side-only ETA guard → Insufficient; the backend should not return semantically invalid combinations (null nextStopId with non-null ETA)
- Null all ETA fields in `computeEta` → Wrong layer; `computeEta` doesn't know about the pointer validity context
