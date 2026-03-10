# Contract: inferStopProgress

## Current Signature (to be replaced)

```typescript
inferStopProgress(supabase, vanId, lat, lng, snappedLat?, snappedLng?): Promise<StopProgress>
```

## New Signature

```typescript
inferStopProgress(args: {
  supabase: SupabaseClient;
  vanId: string;
  rawLat: number;
  rawLng: number;
  snappedLat?: number | null;
  snappedLng?: number | null;
  eventTs: string; // ISO 8601
}): Promise<StopProgress>
```

## Behavioral Changes

1. **Service date**: Derived from `eventTs` calendar date in America/Bahia (not wall-clock).
2. **Shift gate**: Finds shift active at `eventTs` (not just `ended_at IS NULL`).
3. **Time comparisons**: Uses `eventTime` derived from `eventTs` for early-arrival window and closest-in-time matching.
4. **passed_at**: Set to `eventTs` (not `new Date().toISOString()`).
5. **progress_updated_at**: Remains server processing time.
6. **Canonical write**: Only contiguous passed prefix persisted; non-contiguous rows reverted to pending.

## Callers to Update

- `src/app/api/tracking/[vanId]/route.ts` — single ping route
- `src/app/api/tracking-batch/[vanId]/route.ts` — batch route (now calls per-ping)
