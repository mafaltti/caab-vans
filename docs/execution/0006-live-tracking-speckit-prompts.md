# Live Tracking — Spec Kit Prompts

Here are the three prompts, ready to copy-paste after `/speckit.specify`:

---

## 016 — Tracking Ingestion

Live tracking ingestion: add database migration (`supabase/migrations/00002_live_tracking.sql`) creating `van_location_pings` table, `route_runs` table, `route_run_stops` table, geofence columns on `schedule_entries` (`stop_lat`, `stop_lng`, `geofence_radius_m`), and latest-location columns on `vans` (`last_lat`, `last_lng`, `last_accuracy_m`, `last_speed_mps`, `last_heading_deg`). Implement `POST /api/tracking/[vanId]` endpoint with `x-ingestion-token` auth, Zod validation (`src/lib/validators/tracking.ts`), rate limit at 25 req/min, insert into `van_location_pings`, and update `vans` latest fields + `location_updated_at`. Enable RLS on new tables with no anon policies. Follow existing patterns from `src/app/api/ingest/[vanId]/route.ts`. See `docs/android-app+tracking/live-tracking-spec.md` sections A and B for full details.

---

## 017 — Stop Inference, ETA & UI

Stop inference, ETA computation, and tracking UI: implement stop inference V1 module (`src/lib/tracking/infer-stop-progress.ts`) using simple proximity detection — mark stops as passed when van is within `geofence_radius_m`, no hysteresis or dwell timer. Implement haversine distance helper (`src/lib/tracking/haversine.ts`). Implement schedule-shifted ETA computation (`src/lib/tracking/eta.ts`). Wire inference as best-effort side effect in the `POST /api/tracking/[vanId]` handler. Extend `GET /api/routes` and `GET /api/routes/[routeId]` responses with `van.lastLat`, `van.lastLng`, and a nullable `progress` object (`serviceDate`, `nextStopId`, `passedStopIds`, `etaNextStopISO`, `etaNextStopMinutes`, `delayMinutes`). Update admin schedule editor to accept `stop_lat`/`stop_lng` per entry. Update public UI: `schedule-timeline.tsx` (accept `passedStopIds`/`inferredNextStopId`), `hero-card.tsx` (show ETA when available), `route-card.tsx` (show ETA line). Add vitest unit tests for haversine, inference transitions, and ETA calculation. See `docs/android-app+tracking/live-tracking-spec.md` sections C, D, E, F, G, and I for full details.

---

## 018 — Expo Tracker App

Expo Android tracker app: create a new Expo + TypeScript project in `apps/van-tracker/` that sends device geolocation to `POST /api/tracking/{vanId}` with `x-ingestion-token` auth, working with screen locked on Android. Use `expo-location` + `expo-task-manager` as a foreground service. Settings screen with API Base URL, Van ID (UUID), and Ingestion Token fields persisted in `AsyncStorage`. Home screen with Start/Stop tracking, status display (tracking on/off, last sent time, last lat/lng, last error). Client-side throttle: 5m distance OR 3s interval, whichever comes later; drop points with accuracy > 50m. Offline buffering: up to 50 unsent points in `AsyncStorage` FIFO queue, flush oldest first on reconnect. Include persisted `deviceId` (UUID) in every POST body. Must use EAS Development Build (not Expo Go). Provide README with install, EAS setup, build, run, and locked-screen test instructions. See `docs/android-app+tracking/expo-background-geolocation-app.md` for full spec and API contract.

---

**Run order:** 016 first → merge to `dev` → then 017 and 018 can run in parallel.
