# Contract: inferStopProgress

**Feature**: `023-fix-geofence-dedup`

## Function Signature (Unchanged)

```typescript
export async function inferStopProgress(
  supabase: SupabaseClient,
  vanId: string,
  lat: number,
  lng: number,
): Promise<StopProgress>
```

## Return Type (Unchanged)

```typescript
interface StopProgress {
  passedStopIds: string[];
  nextStopId: string | null;
  lastPassedStopId: string | null;
}
```

## Behavioral Contract Changes

### Geofence Matching — Before

For each pending stop with coordinates:
- If `haversineDistance(vanLat, vanLng, stopLat, stopLng) <= geofence_radius_m` → mark as `passed`

**Problem**: Marks ALL matching stops, not just the first by schedule order.

### Geofence Matching — After

For each pending stop with coordinates (ordered by schedule time ascending):
1. Compute coordinate key: `(stopLat, stopLng)`
2. **Skip** if this coordinate key was already matched in this invocation
3. **Skip** if the stop's scheduled time is more than 30 minutes after the current time
4. If `haversineDistance(vanLat, vanLng, stopLat, stopLng) <= geofence_radius_m` → mark as `passed` and record the coordinate key as matched

### Invariants

- A single invocation marks **at most 1** stop per unique coordinate pair
- Stops are evaluated in schedule-time-ascending order (already the case)
- The return type and callers (`POST /api/tracking/[vanId]`) are unaffected
- The `nextStopId` logic is unaffected (it already filters by time)

## External API Impact

**None.** The `POST /api/tracking/[vanId]` endpoint signature and response are unchanged. The `GET /api/routes` endpoint behavior improves (fewer incorrectly marked stops) but its contract is unchanged.
