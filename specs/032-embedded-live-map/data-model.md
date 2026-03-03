# Data Model: Embedded Live Map

## Existing Entities (No Schema Changes)

### Van Position (from `vans` table)

| Field               | Type              | Notes                          |
|---------------------|-------------------|--------------------------------|
| last_lat            | double precision  | Nullable. Updated by tracking. |
| last_lng            | double precision  | Nullable. Updated by tracking. |
| location_updated_at | timestamptz       | Nullable. Last ping timestamp. |

### Stop Coordinates (from `schedule_entries` table)

| Field            | Type             | Notes                              |
|------------------|------------------|------------------------------------|
| stop_lat         | double precision | Nullable. Set per stop.            |
| stop_lng         | double precision | Nullable. Set per stop.            |
| geofence_radius_m| integer          | Default 50. Not used by map yet.   |

## API Response Changes

### Route Detail Response — Schedule Item Extension

**Current shape** (per item in `schedule[]`):
```
{
  id: string
  stopName: string
  time: string        // HH:mm
}
```

**New shape** (additive, non-breaking):
```
{
  id: string
  stopName: string
  time: string        // HH:mm
  stopLat: number | null    // NEW
  stopLng: number | null    // NEW
}
```

### Van Data (already in response, no changes)

```
van: {
  id: string
  locationUrl: string | null      // deprecated, to be removed later
  locationUpdatedAt: string | null
  isLocationOutdated: boolean
  lastLat: number | null
  lastLng: number | null
}
```

### Progress Data (already in response, no changes)

```
progress: {
  nextStopId: string | null
  passedStopIds: string[]
  runStatus: "waiting" | "in_progress" | "idle" | "completed"
  etaNextStopISO: string | null
  etaNextStopMinutes: number | null
}
```

## TypeScript Type Changes

### RouteDetail.schedule type (in `src/types/index.ts`)

Add `stopLat` and `stopLng` to the schedule item within `RouteDetail`:

```typescript
export type RouteDetail = RouteWithStatus & {
  schedule: {
    id: string;
    stopName: string;
    time: string;
    stopLat: number | null;    // NEW
    stopLng: number | null;    // NEW
  }[];
};
```

## State Derivation (Frontend)

The map component derives stop marker state from existing data:

| Stop Status | Condition                              | Visual   |
|-------------|----------------------------------------|----------|
| passed      | `id` is in `progress.passedStopIds`    | Dimmed   |
| next        | `id` equals `progress.nextStopId`      | Highlighted (blue) |
| future      | Not passed and not next                | Neutral  |

Van freshness derived from existing `van.isLocationOutdated` boolean.

## UI Constants

| Constant          | Value  | Notes                                    |
|-------------------|--------|------------------------------------------|
| Map card height   | 250px  | Fixed. Balances visibility with schedule |
| Tile error text   | "Mapa indisponível" | Shown as overlay when tiles fail |
