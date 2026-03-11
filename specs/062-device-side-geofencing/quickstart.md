# Quickstart: Device-Side Geofencing

**Feature**: 062-device-side-geofencing

---

## Prerequisites

- Node.js 20+, npm
- Supabase running locally (Docker Compose)
- Expo CLI (`npx expo`)
- Android device or emulator (geofencing requires Play Services)

---

## Server Setup

1. **Apply migration**:
   ```bash
   # From project root
   psql "$DATABASE_URL" -f supabase/migrations/00015_device_side_geofencing.sql
   ```

2. **Verify migration**:
   ```sql
   -- Check new table exists
   SELECT * FROM tracking_geofence_events LIMIT 0;

   -- Check pass_source constraint updated
   SELECT conname, consrc FROM pg_constraint
   WHERE conrelid = 'route_run_stops'::regclass AND conname LIKE '%pass_source%';

   -- Check new columns on schedule_entries
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'schedule_entries' AND column_name IN ('device_geofence_radius_m', 'updated_at');
   ```

3. **Run dev server**: `npm run dev`

4. **Test config endpoint**:
   ```bash
   curl -H "x-ingestion-token: <van-token>" \
     http://localhost:3000/api/tracker-config/<van-id>
   ```

---

## Tracker Setup

1. **Build tracker**: `cd apps/van-tracker && npx expo run:android`

2. **Configure**: Enter API URL, Van ID, and ingestion token in Settings screen.

3. **Start tracking**: Tap "Start" — geofence regions are fetched and registered automatically.

4. **Verify geofencing**: Check diagnostic logs for `geofence_register` event.

---

## Testing Geofence Events

1. **Mock a geofence enter** (dev only):
   ```bash
   curl -X POST http://localhost:3000/api/tracking/<van-id> \
     -H "x-ingestion-token: <token>" \
     -H "Content-Type: application/json" \
     -d '{
       "deviceId": "test-device",
       "lat": -12.978, "lng": -38.461,
       "accuracy": 10, "speed": 0, "heading": 0,
       "ts": '$(date +%s000)',
       "geofenceEvents": [{
         "placeId": "mundo_plaza",
         "enteredAt": '$(date +%s000)',
         "eventId": "'$(uuidgen)'"
       }]
     }'
   ```

2. **Expected response** includes `processedEventIds` with the submitted eventId (if matched to a pending stop during an active shift).

3. **Verify in DB**:
   ```sql
   SELECT * FROM tracking_geofence_events WHERE van_id = '<van-id>' ORDER BY received_at DESC;
   SELECT * FROM route_run_stops WHERE pass_source = 'device_geofence';
   ```

---

## Key Files

### Server
| File | Purpose |
| ---- | ------- |
| `supabase/migrations/00015_device_side_geofencing.sql` | DB migration |
| `src/app/api/tracker-config/[vanId]/route.ts` | Config endpoint (new) |
| `src/lib/tracking/process-device-geofence-events.ts` | Event processing helper (new) |
| `src/app/api/tracking/[vanId]/route.ts` | Extended tracking endpoint |
| `src/lib/validators/tracking.ts` | Extended Zod schema |
| `src/types/index.ts` | PassSource type update |

### Tracker
| File | Purpose |
| ---- | ------- |
| `apps/van-tracker/src/location/geofence-task.ts` | Geofence task definition (new) |
| `apps/van-tracker/src/api/config.ts` | Config fetch module (new) |
| `apps/van-tracker/src/location/tracking.ts` | Geofence lifecycle (modified) |
| `apps/van-tracker/src/api/client.ts` | Event piggyback + selective ack (modified) |
| `apps/van-tracker/src/storage/tracking-state.ts` | New AsyncStorage keys (modified) |
