# Status Inconsistency Analysis — List vs Detail Page

## The Problem

> Van 1 has route started and is during shift, so it correctly shows “Em operação” with ETA. But Van 2 didn’t have the route started and is **also** showing “Em operação”.

- **Route list page:** All vans show “Em operação” (including Van 2 which hasn’t started)
- **Van 2 detail page:** Correctly shows “Aguardando início da rota” (waiting for route start)

The status logic is different between the list and detail views.

---

## The Bug

| Page | Status source | Result for Van 2 |
|---|---|---|
| List page (`RouteStatusBadge`) | `isRunning` = schedule window + fresh GPS | Shows “Em operação” (**WRONG**) |
| Detail page (`HeroCard`) | `progress.runStatus` = actual shift lifecycle | Shows “Aguardando início da rota” (**CORRECT**) |

## How `isRunning` is computed (both APIs)

```
isRunning = isWithinScheduleWindow(now) AND isLocationFresh(location_updated_at)
```

This completely ignores whether a driver has actually started a shift. So if it’s within schedule hours and the GPS was recently updated, it says “Em operação” — even if no shift was started.

## How `runStatus` is computed (correctly)

- No shifts → `"waiting"`
- Active shift (`ended_at` null) → `"in_progress"`
- Past schedule window → `"completed"`
- Shift ended, still in window → `"idle"`

## What’s happening with Van 2

- Current time (15:03) is within Van 2’s schedule window (00:00–23:40)
- Van 2 has recent GPS data (location is “fresh”)
- So `isRunning = true` → list shows “Em operação”
- But no shift has been started → `runStatus = "waiting"` → detail page correctly shows “Aguardando início da rota”

## The Fix

The `RouteStatusBadge` on the list page needs to also consider `progress.runStatus`. When `runStatus === "waiting"`, it should **NOT** show “Em operação” — it should show something like “Aguardando início” instead.
