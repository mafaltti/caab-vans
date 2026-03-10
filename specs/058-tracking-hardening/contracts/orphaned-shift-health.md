# Contract: isOrphanedShift

## Signature

```typescript
isOrphanedShift(args: {
  scheduledEnd: DateTime;
  lastActivity: DateTime;
  now: DateTime;
  scheduleOverdueMinutes?: number;  // default: 90
  inactivityMinutes?: number;       // default: 30
}): boolean
```

## Behavior

Returns `true` when both conditions are met:
1. `now > scheduledEnd + scheduleOverdueMinutes`
2. `now > lastActivity + inactivityMinutes`

## Consumers

- `scripts/reconcile-orphaned-shifts.ts` — replaces inline criteria
- `src/lib/tracking/resolve-route-progress.ts` — sets `runHealth` field
