# Research: Fix Status Inconsistency

**Branch**: `029-fix-status-inconsistency` | **Date**: 2026-03-02

## Research Summary

### R1: Is `runStatus` already available in the list API?

- **Decision**: Yes — no new API field needed.
- **Rationale**: Both `/api/routes` (list) and `/api/routes/[routeId]` (detail) already compute `progress.runStatus` via `deriveRunStatus()` and include it in the response under `progress.runStatus`.
- **Alternatives considered**: Adding a top-level `runStatus` field — unnecessary since `progress` already contains it.

### R2: Why does the badge ignore `runStatus`?

- **Decision**: The `RouteStatusBadge` component was written before the shift lifecycle was implemented. It only accepts `isRunning: boolean` and maps to two labels: "Em operação" / "Fora de operação".
- **Rationale**: Historical — the badge predates the route_runs/route_shifts tables.
- **Fix**: Expand `RouteStatusBadge` to accept `runStatus` and `scheduleStatus`, then use a priority-based mapping.

### R3: Can the "completed" state reach the frontend?

- **Decision**: No — currently broken. Both API endpoints set `progress = null` when `runStatus === "completed"`, so the frontend never receives `runStatus: "completed"`.
- **Rationale**: This was originally done to suppress stale ETA/stop data after route completion. But it also hides the runStatus.
- **Fix**: Stop nullifying the entire `progress` object when completed. Instead, return a minimal progress object with `runStatus: "completed"` and null ETA fields.
- **Alternatives considered**:
  - Infer "completed" from `scheduleStatus === "ended"` on the client → rejected because it can't distinguish "schedule ended with no shifts" from "schedule ended after shifts completed".
  - Add a separate `isCompleted` boolean → rejected for unnecessary complexity.

### R4: Is the detail page header badge also affected?

- **Decision**: Yes — the detail page header uses the same `RouteStatusBadge` component with only `isRunning`, so the badge at the top of the detail page also shows incorrect status.
- **Rationale**: The HeroCard below it correctly uses `runStatus`, but the header badge contradicts it.
- **Fix**: Pass `runStatus` and `scheduleStatus` to `RouteStatusBadge` in both the list card and detail header.

### R5: Dead code in HeroCard

- **Decision**: The `runStatus === "completed"` branch in HeroCard (showing "Rota encerrada por hoje") is effectively dead code because `progress` is always `null` when completed, making `runStatus` undefined.
- **Fix**: Once the API stops nullifying progress on completed, this branch will activate correctly.

### R6: HeroCard decision tree has inconsistencies with badge (discovered during implementation)

- **Decision**: The HeroCard's decision tree needed a full rewrite — it was not just a matter of fixing the `completed` branch.
- **Rationale**: The HeroCard didn't handle `runStatus === "idle"` at all and relied on a `!isRunning` catch-all that overrode meaningful `runStatus` information. This caused 3 of 13 reachable state combinations to show conflicting badge/hero information:
  - Case #2: No route_run + schedule active → badge "Aguardando início" vs hero "Fora de operação"
  - Case #9: Active shift + GPS stale → badge "Em operação" vs hero "Fora de operação"
  - Case #12: Idle + no GPS + schedule active → badge "Aguardando início" vs hero "Fora de operação"
- **Fix**: Rewrite the HeroCard with explicit handling for all state combinations, matching the badge mapping. Added a new "Em operação + Localização desatualizada" hero state for active shift with stale GPS.

### R7: Badge mapping needs `isRunning` dimension (discovered during implementation)

- **Decision**: The badge mapping cannot use `runStatus` alone — `isRunning` (GPS freshness) is needed to differentiate within the `idle` state.
- **Rationale**: `idle` (between shifts) means different things depending on GPS:
  - `idle + isRunning` = van is still moving between shifts → "Em operação" for passengers
  - `idle + !isRunning` = van has stopped sending GPS → "Aguardando início"
- **Fix**: Added `idle && isRunning → "Em operação"` as step 2 in the badge priority chain.
- **Also**: `waiting`/`idle` + `scheduleStatus === "ended"` → "Fora de operação" — a van that never operated or stopped operating after the schedule ended shouldn't show "Aguardando início".

## Files Affected

| File | Change Type | Purpose |
|------|------------|---------|
| `src/components/public/route-status-badge.tsx` | Modify | Accept `runStatus` + `scheduleStatus`, implement 6-step badge mapping |
| `src/components/public/hero-card.tsx` | Modify | Rewrite decision tree to match badge for all 13 state combinations |
| `src/components/public/route-card.tsx` | Modify | Pass `runStatus` and `scheduleStatus` to badge |
| `src/app/(public)/routes/[routeId]/page.tsx` | Modify | Pass `runStatus` and `scheduleStatus` to badge in header |
| `src/app/api/routes/route.ts` | Modify | Stop nullifying progress when completed |
| `src/app/api/routes/[routeId]/route.ts` | Modify | Stop nullifying progress when completed |
