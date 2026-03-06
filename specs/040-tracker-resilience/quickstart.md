# Quickstart: Tracker Resilience

**Feature**: 040-tracker-resilience | **Date**: 2026-03-05

## Prerequisites

- Node.js 18+
- Expo CLI (`npx expo`)
- Access to the development Supabase instance
- Android device or emulator (for background task testing)

## Development Setup

### 1. Install new dependencies (Phase 2+)

```bash
cd apps/van-tracker
npx expo install expo-battery expo-secure-store sentry-expo
```

Phase 1 (P0) requires no new packages.

### 2. Database migration

```bash
# Apply new columns to van_location_pings
cd supabase
supabase migration new tracker_resilience
# Copy migration content from data-model.md
supabase db push
```

### 3. Run the tracker app

```bash
cd apps/van-tracker
npx expo start
```

## Testing Scenarios

### Story 1: Data Loss Prevention

1. **5xx buffering**: Start tracking, then stop the API server. Verify points are buffered (check AsyncStorage `@locationBuffer`). Restart server, verify buffered points are delivered.

2. **Send order**: Buffer 10+ points offline. Reconnect. Verify the first request sent is the current point (not buffered history).

3. **Buffer capacity**: Fill buffer to 100 points. Verify oldest are evicted, newest preserved.

4. **Timeout**: Simulate slow server (delay > 10s). Verify request is aborted and point is buffered.

5. **Batch flush**: Buffer points offline. Reconnect. Verify a single batch POST is made instead of N individual requests.

### Story 2: Graceful Degradation

1. **Backoff**: Cause 5+ consecutive failures. Verify retry intervals increase (check logs). Verify current points are buffered during backoff. Verify reset on success.

2. **TTL**: Manually insert a point with `ts` > 24h ago into buffer. Trigger flush. Verify it's discarded before sending.

3. **401 escalation**: Configure invalid token. Start tracking. Verify alert appears after 3 consecutive 401s.

### Story 3: Task Kill Detection

1. Start tracking on Android. Force-kill the app via system settings. Reopen app. Verify "tracking may have stopped" warning appears within 60 seconds.

### Story 4: Observability

1. Start tracking. Check server logs for incoming pings. Verify `buffer_size`, `failure_count`, `battery_level`, `network_type` fields are present.

### Story 5: Battery + Sequence

1. Simulate low battery (< 20%). Verify GPS accuracy switches to balanced mode. Charge above 25%. Verify high accuracy resumes.

2. Start a route. Verify each ping has incrementing `seq`. Start a new route. Verify `seq` resets.

## Key Files to Modify

### Tracker App (apps/van-tracker/)

| File | Changes |
|------|---------|
| `src/storage/buffer.ts` | MAX_BUFFER_SIZE 50->100, TTL filter, mutex |
| `src/api/client.ts` | REQUEST_TIMEOUT 15s->10s, new `sendBatchPing()` |
| `src/location/task.ts` | 5xx buffering, send order swap, backoff, seq, health metadata, task kill timestamp |
| `src/location/tracking.ts` | Battery-adaptive accuracy |
| `src/storage/settings.ts` | SecureStore migration for token |
| `src/types.ts` | LocationPoint new fields |
| `app/index.tsx` | Task kill warning, 401 alert, restart action |

### Server (src/)

| File | Changes |
|------|---------|
| `src/app/api/tracking-batch/[vanId]/route.ts` | New batch endpoint |
| `src/app/api/tracking/[vanId]/route.ts` | Accept new optional fields |
| `src/lib/validators/tracking.ts` | Extend Zod schema with optional fields |
| `supabase/migrations/00007_tracker_resilience.sql` | New columns on van_location_pings |

## Implementation Order

1. **Phase 1 (P0)**: FR-001 (5xx buffer), FR-002 (send order), FR-003 (buffer size), FR-004 (timeout), FR-005 (batch endpoint) -- server + tracker deployed together
2. **Phase 2 (P1)**: FR-006 (backoff), FR-007 (TTL), FR-008 (401 alert), FR-009/010 (task kill)
3. **Phase 3 (P2)**: FR-011-013 (health metadata), FR-014-015 (battery GPS), FR-016-017 (sequence)
4. **Phase 4 (P3)**: FR-018 (Sentry), FR-019 (SecureStore), FR-020 (buffer mutex)
