# Contract: chooseEffectivePosition

## Signature

```typescript
chooseEffectivePosition(args: {
  rawLat: number;
  rawLng: number;
  snappedLat: number | null | undefined;
  snappedLng: number | null | undefined;
  targetLat: number;
  targetLng: number;
  snapDisplacementThreshold: number;
}): { lat: number; lng: number; source: "raw" | "snapped" }
```

## Behavior

1. If snapped coordinates are null/undefined, return raw + source "raw".
2. Compute snap displacement = haversine(raw, snapped).
3. If displacement > threshold, return raw + source "raw" (snap too far from raw = unreliable).
4. Compute rawDist = haversine(raw, target), snappedDist = haversine(snapped, target).
5. Return whichever is closer to target, with corresponding source.

## Consumers

- `infer-stop-progress.ts` — per-stop geofence check
- `eta.ts` — GPS ETA computation for active target stop
