# Data Model: Cold-Start Stop Confirmation

**Date**: 2026-03-10 | **Branch**: `059-cold-start-confirm`

## Existing Entities (No Changes)

### route_run_stops

| Field | Type | Notes |
|-------|------|-------|
| run_id | uuid (PK) | FK → route_runs |
| schedule_entry_id | uuid (PK) | FK → schedule_entries |
| status | text | `'pending'` or `'passed'` |
| passed_at | timestamptz | When the stop was marked passed |
| pass_source | text | `'geofence_raw'`, `'geofence_snapped'`, `'backfill'`, `'manual'` |
| pass_confidence | numeric | 0.0–1.0 |

**Cold-start confirmation writes**: `status='passed'`, `pass_source='manual'`, `pass_confidence=0.85`, `passed_at=now()` for all stops chronologically before the confirmed stop.

### route_runs

| Field | Type | Notes |
|-------|------|-------|
| next_stop_id | text (nullable) | Updated to confirmed stop on confirm |
| last_passed_stop_id | text (nullable) | Updated to stop immediately before confirmed stop |
| progress_updated_at | timestamptz | Updated on confirm |

### schedule_entries

| Field | Type | Used by suggestion algorithm |
|-------|------|-----|
| stop_lat | numeric (nullable) | Proximity filter (2km gate) |
| stop_lng | numeric (nullable) | Proximity filter (2km gate) |
| scheduled_departure | text | Time ranking (`HH:mm` format) |
| stop_name | text | Display in modal |
| geofence_radius_m | integer | Not used by suggestion (only by geofence matching) |

## New Data Shapes (Runtime Only — Not Persisted)

### ColdStartSuggestion (API response shape)

```typescript
type ColdStartSuggestion = {
  suggestedStop: {
    id: string;          // schedule_entry_id
    name: string;        // stop_name
    time: string;        // scheduled_departure (HH:mm)
  } | null;              // null when no GPS → time-only list
  alternatives: Array<{
    id: string;
    name: string;
    time: string;
  }>;                    // up to 4 items (or up to 5 when no suggestion)
};
```

### ConfirmStartStopRequest (API request body)

```typescript
type ConfirmStartStopRequest = {
  stopId: string;        // schedule_entry_id of the confirmed stop
};
```

### StartShiftRequest (enriched API request body)

```typescript
type StartShiftRequest = {
  lat?: number;          // browser geolocation latitude
  lng?: number;          // browser geolocation longitude
};
```

## State Transitions

### Cold-Start Confirmation Flow

```
[Shift Started]
    → cold-start detected?
        → YES: return ColdStartSuggestion in response
            → Driver confirms stop X
                → stops 1..X-1: pending → passed (manual, 0.85)
                → route_run: next_stop_id = X, last_passed_stop_id = X-1
            → Driver dismisses
                → no changes, geofence flow takes over
        → NO: normal flow (no suggestion)
```

### Confirmation Endpoint State Machine

```
[Request received]
    → validate stopId belongs to route         → 400 if not
    → validate driver has active shift         → 403 if not
    → seed route_run_stops if missing          → (internal)
    → check idempotency (same stopId already?) → 200 no-op
    → check cold-start invariant (zero passed) → 409 if violated
    → check geofence guard (no geofence passes)→ 409 if violated
    → bulk mark prior stops as passed          → (internal)
    → enforce canonical prefix                 → (internal)
    → persist pointers on route_run            → (internal)
    → return updated progress                  → 200
```
