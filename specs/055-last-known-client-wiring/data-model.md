# Data Model: Last-Known Client Wiring

**Date**: 2026-03-08
**Feature**: 055-last-known-client-wiring

## Entities

No new entities are introduced. This feature wires existing backend data into the client.

### Existing Entities (no changes)

#### RouteWithStatus

Already contains all fields needed for last-known display:

| Field | Type | Relevance |
|-------|------|-----------|
| `nextStop` | `NextStop \| null` | Populated by backend when `includeLastKnown=true` for non-running routes |
| `nextStopMode` | `"live" \| "last_known" \| null` | Discriminator for UI styling decisions |
| `currentStopIndex` | `number \| null` | Used by progress counter in RouteCard |
| `progress.passedStopIds` | `string[]` | Used by timeline to mark passed stops |
| `progress.nextStopId` | `string \| null` | Used by timeline for current position |
| `progress.etaNextStopMinutes` | `number \| null` | Nulled by backend for stale pointers; client also guards on `nextStopMode !== "last_known"` |

#### NextStop

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Schedule entry ID |
| `stopName` | `string` | Display name |
| `time` | `string` | Scheduled time (HH:mm) |

## State Transitions

No new state transitions. The `nextStopMode` field is computed server-side:

```text
Route running     → nextStopMode = "live"
Route not running → includeLastKnown=true → valid pointer → runStatus = "waiting" → nextStopMode = null (suppressed)
Route not running → includeLastKnown=true → valid pointer → runStatus ≠ "waiting" → nextStopMode = "last_known"
Route not running → includeLastKnown=true → expired/null  → nextStopMode = null, etaNextStopMinutes = null
Route not running → includeLastKnown=false                → nextStopMode = null
```

## Prop Flow (New)

```text
useRoutes() / useRouteDetail()
  └─ ?includeLastKnown=true (query param)
       └─ RouteWithStatus.nextStopMode populated
            ├─ RouteCard: reads route.nextStopMode for label
            ├─ HeroCard: receives nextStopMode as new prop
            └─ ScheduleTimeline: receives nextStopMode as new prop (rendering only)
```
