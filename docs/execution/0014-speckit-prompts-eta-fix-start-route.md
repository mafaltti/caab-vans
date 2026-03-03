# Speckit Prompts: ETA Fix & Start Route Feature

## QUESTION: Give me for both phase 1 and phase 2, complete prompt with necessary references.

---

## Phase 1 — ETA/Next Stop Bug Fix

```
/speckit.specify @docs/execution/0011-eta-next-stop-bug-analysis.md @docs/execution/0012-eta-next-stop-fix-plan.md @src/lib/tracking/eta.ts @src/lib/tracking/infer-stop-progress.ts @src/components/public/schedule-timeline.tsx @src/app/(public)/routes/[routeId]/page.tsx
```

Fix the ETA and next stop bug in the tracking system (Phase 1 from the fix plan). When a van starts sharing GPS location mid-route (e.g., at 22:00 on a route starting at 00:00), the system incorrectly picks the earliest pending stop (CAAB @ 00:00) as the next stop with ~0 min ETA, because neither `computeEta` nor `inferStopProgress` considers current time when selecting the next pending stop. The hero card shows the correct time-based next stop while the schedule timeline shows the wrong GPS-based one. Three changes needed: (1) `computeEta` must filter pending stops to only those with scheduled time >= current time before picking the next stop, (2) `inferStopProgress` must apply the same time-aware filter when determining `nextStopId` in its result-building loop, (3) `deriveTimelineStops` must classify un-geofenced past-time stops as "past" using a hybrid time+GPS approach — a stop is "past" if GPS confirmed it OR its scheduled time < now, "current" only if `inferredNextStopId` AND time >= now. This requires passing `serverTime` into the timeline component. Handle midnight wraparound defensively for routes that could span midnight. No database migration. No new features. Scope is strictly the three files listed plus the page that passes props to the timeline.

---

## Phase 2 — Start Route (Driver Route Lifecycle)

```
/speckit.specify @docs/execution/0012-eta-next-stop-fix-plan.md @docs/TECH.md @src/app/api/routes/[routeId]/route.ts @src/lib/tracking/infer-stop-progress.ts @src/app/api/tracking/[vanId]/route.ts
```

Add a "Start Route" feature that lets drivers explicitly start and end their route from the web app. The Expo tracker app stays single-purpose (GPS only) — all route management lives in the web app, which drivers open in the browser like any other user. Drivers authenticate with email and password using the existing Supabase Auth system, same as superusers and admins — just with a `driver` role. No new auth mechanisms (PIN, magic link, OTP) for now. When implemented, the system only considers stops from the start time onward for progress tracking and ETA computation. The Phase 1 time-aware filtering remains as a permanent fallback for when drivers forget to press start. Scope:

1. Add `started_at` and `ended_at` columns to the `route_runs` table
2. Create API endpoints `POST /api/routes/[routeId]/start` and `POST /api/routes/[routeId]/end`
3. Add a `driver` role to the existing auth system
4. Build a driver-facing web page to start/end their assigned route
5. Update `inferStopProgress` to only consider stops where `time >= started_at` when a route has been explicitly started
6. Update the public route page to show a "waiting to start" state when a `route_run` exists but `started_at` is `null`
