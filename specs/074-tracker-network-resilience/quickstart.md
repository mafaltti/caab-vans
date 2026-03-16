# Quickstart: Tracker Network Resilience

**Feature**: 074-tracker-network-resilience

## Prerequisites

- Node.js and npm installed
- Android device or emulator with developer options enabled
- EAS CLI installed (`npm install -g eas-cli`)
- Access to the CAAB Vans repository

## Setup

```bash
# Clone and checkout feature branch
git checkout 074-tracker-network-resilience

# Install dependencies (from repo root)
cd apps/van-tracker
npm install

# Phase 2 only: install expo-background-fetch (native dependency)
npx expo install expo-background-fetch
```

## Development

```bash
# Start Expo dev server
npx expo start

# Type-check
npm run typecheck

# Lint
npm run lint

# Both
npm run check
```

## Build (After Phase 2)

Phase 2 introduces `expo-background-fetch` (native dependency), requiring a new EAS build:

```bash
# Prebuild to update native projects
npx expo prebuild

# Build for Android
eas build --platform android --profile development
```

## Testing

### Manual Test: Network Recovery (Phase 1)

1. Install dev build on Android device
2. Configure van settings (API URL + ingestion token)
3. Start tracking
4. Enable airplane mode — wait 2 minutes
5. Watch diagnostics screen: `consecutiveFailures` should increment, `buffer_size` should grow
6. Disable airplane mode
7. **Expected**: Buffer flushes within 10 seconds, `buffer_size` drops to 0, backoff resets

### Manual Test: Failure Notification (Phase 2)

1. Start tracking with a deliberately wrong API URL
2. Wait for 10+ consecutive failures (~1-2 minutes)
3. **Expected**: Android notification "Rastreamento com problemas de conexão. Toque para verificar."
4. Fix API URL, restart tracking
5. **Expected**: No further notifications until next failure episode

### Manual Test: Health Check (Phase 2)

1. Start tracking
2. Force-stop the app via Android Settings → Apps → CAAB Tracker → Force Stop
3. Wait up to 15 minutes
4. **Expected**: Tracking resumes automatically (check diagnostics for `health_recovery` event)

## File Map

All paths relative to `apps/van-tracker/`:

| File | Changes | Phase |
|------|---------|-------|
| `src/storage/diag-log.ts` | +3 event types | Pre-req |
| `src/location/task.ts` | NetInfo listener, flush-on-fail, backoff cap, chunked flush, notification, GPS restart | 1, 2, 3 |
| `src/storage/buffer.ts` | `MAX_BUFFER_SIZE = 500` | 3 |
| `src/location/tracking.ts` | Teardown call, health check register/unregister | 1, 2 |
| `src/location/health-check-task.ts` | **NEW** — background fetch health check | 2 |
| `app/_layout.tsx` | +1 import line | 2 |
| `app.json` | +expo-background-fetch plugin | 2 |
| `package.json` | +expo-background-fetch dependency | 2 |

## Production Monitoring

After deploy, verify with:

```sql
-- Vans with sustained high buffer (indicates unresolved connectivity issues)
SELECT v.name, COUNT(*) as high_buffer_pings
FROM van_location_pings vlp
JOIN vans v ON v.id = vlp.van_id
WHERE vlp.device_ts > NOW() - INTERVAL '10 minutes'
AND vlp.buffer_size >= 100
GROUP BY v.name
HAVING COUNT(*) >= 5;
```

Target: No van should show sustained `buffer_size >= 100` after deployment.
