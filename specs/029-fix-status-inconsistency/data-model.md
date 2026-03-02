# Data Model: Fix Status Inconsistency

**Branch**: `029-fix-status-inconsistency` | **Date**: 2026-03-02

## No Schema Changes Required

This feature is a frontend presentation fix. No database schema, migration, or data model changes are needed.

## Existing Entities Used

### RunStatus (enum, computed)

Derived from `route_shifts` table via `deriveRunStatus()`:

| Value | Condition |
|-------|-----------|
| `"waiting"` | route_run exists, no shifts |
| `"in_progress"` | Active shift (ended_at is null) |
| `"idle"` | All shifts ended, within schedule window |
| `"completed"` | All shifts ended, past schedule window |
| _(undefined)_ | No route_run for today |

### ScheduleStatus (enum, computed)

| Value | Condition |
|-------|-----------|
| `"active"` | Current time within schedule window |
| `"ended"` | Current time past last scheduled stop |
| `"not_started"` | Current time before first scheduled stop |

### isRunning (boolean, computed)

`true` when BOTH conditions are met:
- Current time is within the schedule window (`isWithinScheduleWindow`)
- GPS location was received within the last 10 minutes (`isLocationFresh`)

Note: `isRunning = true` always implies `scheduleStatus === "active"`.

## State → Badge Mapping (consolidated)

The badge depends on three variables: `runStatus`, `isRunning`, and `scheduleStatus`.

Priority order for badge determination:

1. `runStatus === "in_progress"` → "Em operação" (green, pulsing dot)
2. `runStatus === "idle" && isRunning` → "Em operação" (green, pulsing dot) — between shifts, van still tracked
3. `(runStatus === "waiting" || runStatus === "idle") && scheduleStatus === "ended"` → "Fora de operação" (zinc) — missed window
4. `runStatus === "waiting" || runStatus === "idle"` → "Aguardando início" (amber)
5. `runStatus === "completed"` → "Encerrada" (muted emerald)
6. `scheduleStatus === "active"` (no runStatus) → "Aguardando início" (amber)
7. Fallback → "Fora de operação" (zinc)

## State → HeroCard Mapping (consolidated)

The hero card follows the same priority but with richer presentation:

1. `completed` → "Rota encerrada por hoje" (emerald card)
2. `in_progress && !isRunning` → "Em operação" + "Localização desatualizada" warning (blue card)
3. `waiting || (idle && !isRunning)` + `scheduleStatus === "ended"` → "Programação encerrada por hoje" (zinc card)
4. `waiting || (idle && !isRunning)` → "Aguardando início da rota" (amber card)
5. `scheduleStatus === "ended"` → "Programação encerrada por hoje" (zinc card)
6. `!isRunning && scheduleStatus === "active"` → "Aguardando início da rota" (amber card)
7. `!isRunning` → "Fora de operação" (zinc card)
8. `!nextStop` → "Nenhum horário disponível" (zinc card)
9. Full blue gradient card with next stop, ETA, location button

## Full State Matrix

All reachable combinations with expected badge and hero card output:

| # | runStatus | isRunning | scheduleStatus | Badge | Hero Card |
|---|-----------|-----------|----------------|-------|-----------|
| 1 | undefined | false | not_started | Fora de operação (zinc) | Fora de operação (zinc) |
| 2 | undefined | false | active | Aguardando início (amber) | Aguardando início da rota (amber) |
| 3 | undefined | false | ended | Fora de operação (zinc) | Programação encerrada (zinc) |
| 4 | undefined | true | active | Aguardando início (amber) | Blue card (next stop) |
| 5 | waiting | false | not_started | Aguardando início (amber) | Aguardando início da rota (amber) |
| 6 | waiting | false | active | Aguardando início (amber) | Aguardando início da rota (amber) |
| 7 | waiting | false | ended | Fora de operação (zinc) | Programação encerrada (zinc) |
| 8 | waiting | true | active | Aguardando início (amber) | Aguardando início da rota (amber) |
| 9 | in_progress | false | active | Em operação (green) | Em operação + GPS warning (blue) |
| 10 | in_progress | true | active | Em operação (green) | Blue card (next stop + ETA) |
| 12 | idle | false | active | Aguardando início (amber) | Aguardando início da rota (amber) |
| 13 | idle | true | active | Em operação (green) | Blue card (next stop) |
| 15 | completed | false | ended | Encerrada (emerald) | Rota encerrada por hoje (emerald) |
