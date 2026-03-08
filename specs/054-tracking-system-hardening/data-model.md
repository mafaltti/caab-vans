# Data Model: Tracking System Hardening

**Date**: 2026-03-08

## No Schema Changes Required

All changes in this feature are application-level. No database migrations needed.

## Type Changes

### EtaResult (internal, `src/lib/tracking/eta.ts`)

```
EtaResult
├── etaNextStopISO: string | null
├── etaNextStopMinutes: number | null
├── delayMinutes: number | null
├── nextStopId: string | null
├── passedStopIds: string[]
├── etaSource: "gps" | "gps_osrm" | "segment" | "schedule" | null
└── etaStatus: "estimated" | "overdue" | "none"          ← NEW
```

### RouteProgress (`src/types/index.ts` + `src/lib/tracking/resolve-route-progress.ts`)

```
RouteProgress
├── serviceDate: string
├── runStatus?: RunStatus
├── shiftStartedAt?: string | null
├── nextStopId: string | null
├── passedStopIds: string[]
├── etaNextStopISO: string | null
├── etaNextStopMinutes: number | null
├── delayMinutes: number | null
├── etaSource: "gps" | "gps_osrm" | "segment" | "schedule" | null
└── etaStatus: "estimated" | "overdue" | "none"          ← NEW
```

### Route API Response (both list and detail endpoints)

```
RouteResponse
├── id: string
├── name: string
├── isRunning: boolean
├── trackingStatus: "live" | "stale" | "missing"
├── isTrackingFresh: boolean
├── nextStop: NextStop | null
├── nextStopMode: "live" | "last_known" | null            ← NEW
├── scheduleStatus: "active" | "ended" | "not_started"
├── totalStops: number
├── currentStopIndex: number | null
├── van: { ... }
└── progress: RouteProgress | null
```

## Confidence Score Table

Replaces the current 4-branch `if/else` in `infer-stop-progress.ts`:

```
Match Type          | Base  | +2 pings | +disp ≤15m | Max
--------------------|-------|----------|------------|-----
Raw, <2 pings       | 0.70  | —        | —          | 0.70
Raw, 2+ pings       | 0.90  | —        | —          | 0.90
Snapped, raw outside| 0.65  | +0.10    | +0.05      | 0.95
Snapped, raw inside | 0.85  | +0.10    | +0.05      | 0.95
```

Backfill gate: `pass_confidence > 0.7` (unchanged).

## Reconciliation Data Flow

```
Inputs:
  route_shifts  → ended_at IS NULL (orphaned candidates)
  route_runs    → service_date, progress_updated_at
  routes        → id (join key)
  schedule_entries → MAX(time) per route (scheduled end)
  vans          → last_gps_fix_at (activity signal)

Derived:
  scheduledEnd  = service_date + MAX(schedule_entries.time) in America/Bahia
  lastActivity  = GREATEST(vans.last_gps_fix_at, route_runs.progress_updated_at, route_shifts.started_at)

Closure criteria (all must be true):
  now > scheduledEnd + 90 minutes
  now > lastActivity + 30 minutes

Output:
  UPDATE route_shifts SET ended_at = now() WHERE <criteria>
```

## Behavioral Contract Changes

| Field | Before | After |
|-------|--------|-------|
| `etaNextStopMinutes` | Always `number \| null`; 0 when overdue | May be `null` when `etaStatus = "overdue"` even if `nextStopId` is set |
| `nextStop` (top-level) | Always `null` when `!isRunning` | Populated from progress when `includeLastKnown=true` and `nextStopMode = "last_known"` |
| `currentStopIndex` (top-level) | Always `null` when `!isRunning` | Same as `nextStop` |
