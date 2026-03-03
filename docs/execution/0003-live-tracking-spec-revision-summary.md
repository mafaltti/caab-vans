# Live Tracking Spec — Revision Summary

Both documents are clean and consistent. Here's a summary of what was done:

---

## Two-Document Structure

### `expo-background-geolocation-app.md` (revised)

**Purpose:** Self-contained Expo app build guide. Feed this to ChatGPT or a developer to build the Android tracker app.

**Changes made:**

- `device_locations` → `van_location_pings` (3 references updated)
- Replaced the 70-line Backend Contract section (route handler, Zod schema, SQL, DDL) with a 9-line Backend Implementation cross-reference to the live-tracking spec
- Keeps: REST API contract (client perspective), server responses, settings, throttle, offline buffering, quality bar

### `live-tracking-spec.md` (full rewrite)

**Purpose:** Full-stack system spec — DB, backend, inference, ETA, frontend, operational.

**Key fixes from the ChatGPT original:**

| Issue | ChatGPT Original | Revised |
|---|---|---|
| Endpoint | `/api/ingest/:vanId/location` | `/api/tracking/[vanId]` |
| Auth | Generic Bearer mention | `x-ingestion-token` (matches codebase) |
| Table name | `van_location_pings` (no `device_id`) | `van_location_pings` WITH `device_id` |
| Rate limit | 120 req/min | 25 req/min (~1,500/hour) |
| JSON body | `"<number>"` placeholders | Actual number values |
| Response shape | `{ ok, receivedAt, run }` | `{ received: true, ts }` |
| State machine | 3 states + hysteresis + dwell | 2 states (`pending` → `passed`), simple proximity V1 |
| Geofence | enter=50m, exit=80m, dwell=12s | Single radius 50m |
| `route_run_stops` | 3 columns for state tracking | Just `status` + `passed_at` |
| `vans` ALTER | 7 new columns + new timestamp | 5 new columns, reuses `location_updated_at` |
| Map reference | Google Maps URL | Leaflet/OpenStreetMap |
| PR strategy | Single monolith PR | 6 phased PRs |
| Data retention | Not mentioned | 30-day cleanup policy |
| Rollback plan | Not mentioned | `progress` is nullable, fallback automatic |
| Android caveats | Not mentioned | Doze mode, battery optimization documented |
