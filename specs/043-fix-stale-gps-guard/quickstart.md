# Quickstart: Fix Stale GPS Guard

**Branch**: `043-fix-stale-gps-guard`

## Prerequisites

- Node.js, Expo CLI installed
- Android device or emulator for testing

## Setup

```bash
cd apps/van-tracker
npm install
```

## Files to Modify

1. **`src/storage/diag-log.ts`** — Extend `MinuteSummary`, update `logFiltered()`
2. **`src/location/task.ts`** — Update stale fix guard, pass filter reasons
3. **`app/diagnostics.tsx`** — Update display format strings

## Testing

### Manual Testing (primary)

1. Build and install on a test device:
   ```bash
   npx expo run:android
   ```

2. **Cold-start test**: Kill the app, wait 2+ minutes, relaunch. Verify pings appear in the database within 2 minutes.

3. **Diagnostic display test**: Open Diagnostics screen, observe per-reason filter counters in summary rows.

4. **Steady-state test**: While tracking normally, verify GPS fixes older than 60s are still rejected.

### Type Check

```bash
cd apps/van-tracker
npx tsc --noEmit
```

### Lint

```bash
cd apps/van-tracker
npx eslint .
```

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| Normal stale threshold | 60,000 ms | Reject GPS fixes older than 60s during steady state |
| Relaxed stale threshold | 120,000 ms | Accept older fixes during cold gap + stationary |
| Cold gap threshold | 120,000 ms | Time since last send to trigger relaxed mode |
| Stationary speed limit | 1 m/s | Speed at or below which van is considered stationary |
