# Quickstart: Fix Rate-Limit 429 Cascade

## Phase 1: Server-Side (deploy immediately, no app update)

### Changes

Two files, one line each:

1. `src/app/api/tracking/[vanId]/route.ts` line 11:
   - `maxRequests: 25` → `maxRequests: 40`

2. `src/app/api/tracking-batch/[vanId]/route.ts` line 11:
   - `maxRequests: 25` → `maxRequests: 40`

### Verify

```bash
npm run lint && npx tsc --noEmit && npm run build && npx vitest run
```

### Deploy

Merge to `dev` → verify in DEV environment → promotion PR to `main`.

---

## Phase 2: Tracker App (next EAS build)

### Changes

One file: `apps/van-tracker/src/location/task.ts`

**Single-ping 429 handler** (~line 355): Change from "skip, don't buffer" to "buffer, don't backoff":
- Add `await addToBuffer(point)`
- Keep existing behavior of NOT calling `onSendFailure()`

**Batch-flush 429 handler** (~line 130): Remove `onSendFailure()` call:
- Remove `await onSendFailure()` — buffer is already kept intact

### Verify

```bash
cd apps/van-tracker && npm run lint && npm run typecheck
```

### Deploy

EAS build → deploy to devices.

---

## Documentation Updates

Update rate limit references from "25" to "40" in:
- `docs/OPERATIONS.md` line 191
- `docs/android-app+tracking/live-tracking-spec.md` lines 78, 182
- `docs/android-app+tracking/expo-background-geolocation-app.md` lines 167, 185
- `specs/018-expo-tracker-app/contracts/tracking-api.md` lines 121, 181
- `specs/040-tracker-resilience/contracts/batch-tracking-api.md` line 102
