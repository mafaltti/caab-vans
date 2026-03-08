# Analysis: Wire `includeLastKnown` Into Client Hooks

**Date**: 2025-03-08
**Status**: Ready for implementation
**Depends on**: PR #59 (tracking system hardening — merged to dev)
**Affected files**: 6 client files, 2 hooks, 4 components

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
| **RouteCard** | Gray icon, no progress counter, no next stop, no ETA | Could show "Ultima parada: Stop B" with `last_known` label |
| **HeroCard** | Status-only card ("Aguardando inicio" / "Encerrada") | Could show last known stop + time below status |
| **ScheduleTimeline** | All stops neutral (gray) | Could highlight passed stops + last known position |
| **RouteDetailPeek** | Not shown (sheet hidden when not running) | N/A (card layout used instead) |
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
// use-routes.ts
const res = await fetch("/api/routes?includeLastKnown=true");

// use-route-detail.ts
const res = await fetch(`/api/routes/${routeId}?includeLastKnown=true`);
```

**Risk**: None. The flag only affects non-running routes. Running routes return identical data. Backward compatible — existing fields remain unchanged.

### 2. Show last-known progress in ScheduleTimeline

**File**: `src/components/public/schedule-timeline.tsx`

In `deriveTimelineStops()`, the current logic for `!isRunning` returns all stops as `neutral`. Change to:

```
if (!isRunning && passedStopIds.length > 0 && nextStopMode === "last_known") {
  // Use passedStopIds to mark stops as "past"
  // Mark the nextStopId position as "current" (last known)
  // Remaining stops stay "future"
}
```

This shows the progress trail with a visual indicator that it's historical, not live.

### 3. Show last-known stop in RouteCard

**File**: `src/components/public/route-card.tsx`

When `nextStop` is populated and `nextStopMode === "last_known"`:

- Show next stop name with a distinct label (e.g., "Ultima posicao: Stop B" instead of "Proxima: Stop B")
- Show the progress counter ("Parada 2 de 5") instead of hiding it
- Do **not** show ETA (already null)

### 4. Show last-known info in HeroCard

**File**: `src/components/public/hero-card.tsx`

When `nextStopMode === "last_known"`:

- Below the status message ("Encerrada" / "Aguardando"), add a secondary line: "Ultima posicao conhecida: Stop B"
- Use a muted/gray style to distinguish from live data
- Do **not** show ETA or GPS timestamp

### 5. Pass `nextStopMode` through component props

**File**: `src/types/index.ts`

`nextStopMode` is already in `RouteWithStatus`. Components that need it:
- `RouteCard` — already receives the full route object
- `HeroCard` — needs `nextStopMode` added to props
- `ScheduleTimeline` — needs `nextStopMode` added to props

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
| Last known stop label (RouteCard) | "Ultima posicao: **Parada B**" |
| Last known stop label (HeroCard) | "Ultima posicao conhecida: **Parada B** as **08:15**" |
| Timeline current marker | Same dot style but gray instead of blue |
| No last-known available | No change — same blank state as today |

---

## Testing Strategy

### Unit tests (Vitest)

1. `useRoutes` hook passes `includeLastKnown=true` in fetch URL
2. `useRouteDetail` hook passes `includeLastKnown=true` in fetch URL
3. `RouteCard` renders last-known label when `nextStopMode === "last_known"`
4. `RouteCard` does NOT render ETA when `nextStopMode === "last_known"`
5. `ScheduleTimeline` shows passed stops when `nextStopMode === "last_known"` and route is not running
6. `HeroCard` shows last-known line when `nextStopMode === "last_known"`
7. All components render identically for running routes (no regression)

### Manual verification

1. Start a route, advance past 2 stops, end the shift
2. Verify route card shows "Ultima posicao: Stop C" with progress "Parada 2 de 5"
3. Verify timeline shows first 2 stops passed, 3rd as last-known, rest as future
4. Verify no ETA displayed
5. Start a new shift — verify everything switches back to live mode instantly

---

## Effort Estimate

| Area | Files | Complexity |
|------|-------|------------|
| Hook params | 2 | Trivial (add query string) |
| ScheduleTimeline | 1 | Low (add branch to existing derivation) |
| RouteCard | 1 | Low (conditional label) |
| HeroCard | 1 | Low (conditional secondary line) |
| Type plumbing | 1 | Trivial (props already available) |
| Tests | 2-3 | Medium (new test cases) |
| **Total** | **~8 files** | **Small PR** |

---

## Open Questions

1. **Should last-known show for `completed` routes?** Currently yes — the backend returns it for all non-running states. Could restrict to `idle` only if completed routes should show "Encerrada" with no progress trail.

2. **Polling frequency for non-running routes?** Currently 5s for all routes. Could reduce to 30s when `!isRunning` since progress won't change. Separate concern but related optimization.

3. **Driver route card?** `src/components/driver/route-card.tsx` exists separately. Should it also show last-known? Drivers have more context, so possibly lower priority.
