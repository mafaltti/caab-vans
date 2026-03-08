# Analysis: Wire `includeLastKnown` Into Client Hooks

**Date**: 2025-03-08
**Status**: Ready for implementation
**Depends on**: PR #59 (tracking system hardening — merged to dev)
**Affected files**: 5 client files (2 hooks, 3 components)

---

## Problem

When a route is **not running** (idle, completed, waiting), the UI blanks out all progress info:

- **Next stop** shows nothing
- **Stop timeline** marks all stops as neutral (no visual progress)
- **ETA** is hidden
- **Progress counter** disappears

A commuter (lawyer or estagiario) checking the app after a shift ends has no way to know whether the van already passed their stop. An admin reviewing mid-day sees no progress trail for paused routes.

The backend already supports `includeLastKnown=true` (shipped in PR #59), which returns the last persisted progress pointer for non-running routes. But neither `useRoutes()` nor `useRouteDetail()` pass this parameter, so the data never reaches the UI.

---

## Backend Behavior (Already Implemented)

### API contract

Both endpoints accept the query parameter:

```
GET /api/routes?includeLastKnown=true
GET /api/routes/{routeId}?includeLastKnown=true
```

### Response changes when `includeLastKnown=true`

For a **non-running** route with valid persisted progress:

| Field | Without flag | With flag |
|-------|-------------|-----------|
| `nextStop` | `null` | `{ stopName, time, id }` |
| `currentStopIndex` | `null` | `2` (last known position) |
| `nextStopMode` | `null` | `"last_known"` |
| `progress.nextStopId` | `null` | `"entry-id"` |
| `progress.passedStopIds` | `[]` | `["entry-1", "entry-2"]` |
| `progress.etaNextStopISO` | `null` | `null` (no ETA for non-running) |
| `progress.etaNextStopMinutes` | `null` | `null` |

For a **running** route: no change — `nextStopMode` is `"live"`, flag is ignored.

### Safety guards

- If the persisted pointer is **expired** (older than `POINTER_ABSOLUTE_CEILING_MINUTES`), `nextStopId` returns `null` — prevents showing stale data as "last known".
- If the pointer references a **non-existent** or **already-passed** stop, it returns `null`.
- `etaNextStopMinutes` is always `null` for non-running routes — no false ETA promises.

---

## Current Client Behavior

### Hooks (no query params today)

| Hook | File | Refetch | Params |
|------|------|---------|--------|
| `useRoutes()` | `src/lib/queries/use-routes.ts` | 5s | none |
| `useRouteDetail(routeId)` | `src/lib/queries/use-route-detail.ts` | 5s | none |

### Component rendering when `isRunning === false`

| Component | Current behavior | What changes with last-known |
|-----------|-----------------|------------------------------|
| **RouteCard** | Gray icon; next stop block and progress counter **already render if data exists** — but today the backend returns `nextStop: null` for non-running routes, so the block is empty in practice | Once hooks pass the flag, the next stop block renders automatically; only needs a label change ("Última posição" vs. implied "Próxima") |
| **HeroCard** | Multiple early-return branches for non-running states (completed → in_progress+stale GPS → waiting/idle → schedule ended → generic !isRunning) | Needs a new branch for `nextStopMode === "last_known"` inserted into the cascade |
| **ScheduleTimeline** | `deriveTimelineStops()` has three early returns: `runStatus === "waiting"` → all neutral, `runStatus === "completed"` → all past, `!isRunning` → all neutral. The `passedStopIds` branch (line 51) only runs for running routes because the `!isRunning` guard (line 44) exits first | Reorder branches so `passedStopIds` is checked before the `!isRunning` catch-all |
| **RouteDetailPeek** | Not shown (sheet hidden when not running) | N/A |
| **RouteStatusBadge** | Shows idle/completed/waiting badge | No change needed |

### Key rendering guards (must remain intact)

1. **ETA only renders when `etaMinutes != null`** — already correct; non-running routes return `null` ETA.
2. **Map only shows when `isRunning && hasCoords`** — no change; last-known doesn't imply live tracking.
3. **Sheet layout latches once shown** — no interaction with last-known.

---

## Proposed Changes

### 1. Pass `includeLastKnown=true` in both hooks

**Files**: `src/lib/queries/use-routes.ts`, `src/lib/queries/use-route-detail.ts`

```typescript
// use-routes.ts — line ~12
const res = await fetch("/api/routes?includeLastKnown=true", { signal });

// use-route-detail.ts — line ~8
const res = await fetch(`/api/routes/${routeId}?includeLastKnown=true`, { signal });
```

**Risk**: None. The flag only affects non-running routes. Running routes return identical data. Backward compatible — existing fields remain unchanged.

### 2. Reorder branches in `deriveTimelineStops()` for last-known progress

**File**: `src/components/public/schedule-timeline.tsx`

The current branch order in `deriveTimelineStops()` is:

```
1. runStatus === "waiting"  → all neutral    (line 30)
2. runStatus === "completed" → all past       (line 37)
3. !isRunning                → all neutral    (line 44)  ← blocks passedStopIds
4. passedStopIds.length > 0  → derive states  (line 51)
5. !nextStopId               → all past       (line 73)
6. nextStopId fallback       → derive states  (line 80)
```

The `!isRunning` guard at step 3 exits before `passedStopIds` is ever checked. When `includeLastKnown` sends `passedStopIds` for non-running routes, the data is ignored.

**Fix**: Move the `passedStopIds` check (step 4) above the `!isRunning` catch-all (step 3):

```
1. runStatus === "waiting"   → all neutral
2. runStatus === "completed" → all past
3. passedStopIds.length > 0  → derive states  ← now runs for non-running too
4. !isRunning                → all neutral     ← catch-all for routes with no progress data
5. !nextStopId               → all past
6. nextStopId fallback       → derive states
```

This requires **no new props** — `passedStopIds` and `inferredNextStopId` are already in the function signature and the component props. The existing derivation logic (passedSet, currentIdx, fallback to time-based) works correctly for last-known data.

**Visual distinction**: The `TimelineNode` for `"current"` status uses a blue pulsing dot. For last-known, consider using a gray dot instead. This can be achieved by passing `nextStopMode` to the component and using it only in the rendering layer (not in `deriveTimelineStops`).

### 3. Add last-known label in RouteCard

**File**: `src/components/public/route-card.tsx`

RouteCard receives the full `RouteWithStatus` object, which already includes `nextStopMode`. The next stop block (line 56) already renders when `route.nextStop` is truthy — no structural change needed.

Changes:
- Add a label above or beside the stop name when `route.nextStopMode === "last_known"`:
  - e.g., a small "Última posição" text prefix or badge
- The ETA sub-block (line 68) already gates on `etaNextStopMinutes != null`, which is `null` for non-running routes — no change needed.
- The progress counter (line 16) already renders when `currentStopIndex !== null` — no change needed.

### 4. Add last-known branch in HeroCard

**File**: `src/components/public/hero-card.tsx`

HeroCard has 6 early-return branches for non-running states. It needs `nextStopMode` added to `HeroCardProps`.

Insert a new branch after the `completed` check (line 42) and before the `in_progress + !isRunning` check (line 53):

```typescript
// 1.5 Last-known position available — show muted card with last known stop
if (!isRunning && nextStopMode === "last_known" && nextStop) {
  return (
    <div className="rounded-3xl bg-zinc-100 p-6 text-center">
      <MapPin className="mx-auto mb-2 size-6 text-zinc-400" />
      <p className="text-sm font-medium text-zinc-600">
        Última posição conhecida
      </p>
      <p className="mt-1 text-lg font-bold text-zinc-800">
        {nextStop.stopName}
      </p>
      <p className="mt-0.5 text-xs text-zinc-400">
        às {nextStop.time}
      </p>
    </div>
  );
}
```

This branch renders a muted gray card — visually distinct from both the live blue card and the status-only cards. No ETA, no GPS timestamp.

### 5. Pass `nextStopMode` through component props

**File**: `src/types/index.ts`

`nextStopMode: "live" | "last_known" | null` is already in `RouteWithStatus` (line 131). Components that need it:

- **RouteCard** — already receives the full route object; accesses `route.nextStopMode` directly.
- **HeroCard** — needs `nextStopMode` added to `HeroCardProps` interface.
- **ScheduleTimeline** — optionally add `nextStopMode` to props for visual distinction (gray vs. blue current dot). Not needed for the derivation logic itself.

---

## What NOT to Change

- **No ETA for non-running routes** — the backend already returns `null`. Don't synthesize fake ETAs.
- **No map for non-running routes** — last-known position is a stop, not a GPS coordinate. Don't show the van marker.
- **No "live" styling** — use distinct muted colors/labels so users don't confuse last-known with active tracking.
- **RouteStatusBadge** — status logic is correct as-is; don't alter badge behavior.

---

## UX Copy Suggestions (Portuguese)

| Context | Text |
|---------|------|
| Last known stop label (RouteCard) | "Última posição: **Parada B**" |
| Last known stop label (HeroCard) | "Última posição conhecida: **Parada B** às **08:15**" |
| Timeline current marker (last-known) | Same dot but gray instead of blue (no pulse) |
| No last-known available | No change — same blank state as today |

---

## Testing Strategy

### Unit tests (Vitest)

1. `useRoutes` hook passes `includeLastKnown=true` in fetch URL
2. `useRouteDetail` hook passes `includeLastKnown=true` in fetch URL
3. `deriveTimelineStops` returns past/current/future (not all-neutral) when `passedStopIds` is populated and `isRunning === false`
4. `deriveTimelineStops` still returns all-neutral for `runStatus === "waiting"` (even with passedStopIds)
5. `deriveTimelineStops` still returns all-past for `runStatus === "completed"`
6. `RouteCard` renders last-known label when `nextStopMode === "last_known"`
7. `RouteCard` does NOT render ETA when `nextStopMode === "last_known"` (already null)
8. `HeroCard` renders last-known card when `nextStopMode === "last_known"`
9. All components render identically for running routes (no regression)

### Manual verification

1. Start a route, advance past 2 stops, end the shift
2. Verify route card shows "Última posição: Stop C" with progress "Parada 3 de 5"
3. Verify timeline shows first 2 stops as past, 3rd as current (gray), rest as future
4. Verify no ETA displayed anywhere
5. Start a new shift — verify everything switches back to live mode instantly

---

## Effort Estimate

| Area | Files | Complexity |
|------|-------|------------|
| Hook params | 2 | Trivial (append query string to existing fetch URL) |
| ScheduleTimeline | 1 | Low (reorder two existing branches; optional gray dot) |
| RouteCard | 1 | Low (conditional label prefix) |
| HeroCard | 1 | Low (new early-return branch + `nextStopMode` prop) |
| Tests | 2-3 | Medium (new test cases for deriveTimelineStops, components) |
| **Total** | **~7 files** | **Small PR** |

---

## Open Questions

1. **Should last-known show for `completed` routes?** Currently the `completed` branch in both HeroCard and ScheduleTimeline exits before last-known is checked (HeroCard shows "Rota encerrada por hoje"; timeline marks all past). This is correct — a completed route's progress trail is fully past by definition. No change needed unless we want to show "last known" for completed routes too, which adds little value.

2. **Polling frequency for non-running routes?** Currently 5s for all routes. Could reduce to 30s when `!isRunning` since progress won't change. Separate concern but related optimization.

3. **Driver route card?** `src/components/driver/route-card.tsx` exists separately. Should it also show last-known? Drivers have more context, so possibly lower priority.
