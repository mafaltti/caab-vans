# Quickstart: Tracker Diagnostic Log

**Feature**: 041-tracker-diag-log
**Date**: 2026-03-06

## Prerequisites

- Node.js and npm/yarn installed
- Expo CLI available
- Android device or emulator for testing

## Project Location

```text
apps/van-tracker/
```

## Key Files to Create

| File                              | Purpose                              |
|-----------------------------------|--------------------------------------|
| `src/storage/diag-log.ts`        | Two-tier log module (core logic)     |
| `app/diagnostics.tsx`            | Diagnostics screen UI                |

## Key Files to Modify

| File                              | Purpose                              |
|-----------------------------------|--------------------------------------|
| `src/location/task.ts`           | Add log calls at integration points  |
| `src/location/tracking.ts`      | Add start/stop log events + flush    |
| `app/_layout.tsx`                | Register diagnostics route in Stack  |
| `app/settings.tsx`               | Add navigation link to diagnostics   |

## Dependencies to Verify/Add

```bash
cd apps/van-tracker
npx expo install expo-file-system expo-sharing
```

Both are part of Expo managed workflow — no native rebuild needed.

## Development Workflow

```bash
# Start dev server
cd apps/van-tracker
npx expo start

# Run on Android device
npx expo run:android

# Type check
npm run typecheck

# Lint
npm run lint
```

## Testing the Feature

1. **Log recording**: Start tracking, wait 2-3 minutes, open diagnostics screen. Verify minute summaries appear.
2. **Event logging**: Start/stop tracking, toggle airplane mode. Verify events appear in timeline.
3. **15-hour capacity**: Simulate by creating 1,100+ entries programmatically. Verify oldest entries are pruned.
4. **Share flow**: Tap "Share Log", verify native share sheet opens with JSON file.
5. **Clear flow**: Tap "Clear Log", verify all entries are removed.
6. **Gap detection**: Kill the app process, wait a few minutes, reopen. Verify the gap is visible in the timeline.

## Architecture Notes

- Counter increments (`logOk`, `logFail`, etc.) are **synchronous, zero I/O** — safe to call in the GPS callback hot path.
- Disk flushes happen on **minute rollover**, **after error events**, and on **tracking stop** — ~1 write/minute.
- The diagnostics screen is a **lazy-loaded route** — no impact on app startup or tracking performance.
