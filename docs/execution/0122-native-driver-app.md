# Native Driver App Plan

## Summary
- Make `apps/van-tracker` the primary driver surface on shared, van-bound phones; keep the existing `/driver` web flow as rollout fallback.
- Keep tracking auth device-bound and support-provisioned; add native driver sign-in separately.
- Reuse the existing Next.js driver APIs for route/shift/exception flows, but add native bearer-token auth and bound-van enforcement so the app is not a thin `WebView`.

## Implementation Changes
### Auth and API contract
- Native app must not use `/api/admin/auth/login`. Authenticate directly with Supabase Auth in Expo using email/password and persist the driver session locally.
- Add a native Supabase client in Expo with persisted session storage; reject non-`driver` or inactive users immediately after sign-in.
- Change server auth helpers so protected route handlers accept either:
  - existing cookie-backed web sessions, or
  - `Authorization: Bearer <supabase_access_token>` from the native app.
- Introduce a server helper for native device binding using `x-bound-van-id` plus `x-ingestion-token`.
- Apply that helper to `GET /api/driver/routes`, `GET /api/driver/routes/[routeId]`, and the driver mutation endpoints for `start`, `confirm-start-stop`, `end`, `skip-stop`, and `detour`.
- For native callers, filter `/api/driver/routes` to the bound van and reject detail/mutation requests if the route’s `van_id` does not match the bound van. Web callers remain unchanged.
- Keep tracking ingestion endpoints and request bodies unchanged. No DB migration is required for this plan.

### Expo app structure
- Split current `Settings` into device provisioning and driver session concerns.
- Device provisioning stays support-managed and stores `apiBaseUrl`, `vanId`, and `ingestionToken`; remove it from the primary driver flow and expose it only via a support/device-setup entry.
- Replace the current home screen with a bootstrap gate:
  - if device is not provisioned, show device setup
  - if provisioned but no driver session, show login
  - if signed in, show bound-van route list or active route
- Keep Diagnostics available from the support/profile area.
- Add local app state for `activeRouteId` and `shiftActive`; persist both normally and in device-protected storage.

### Native driver workflow
- Rebuild the driver experience natively in Expo using the existing route APIs:
  - route list
  - active-route screen
  - cold-start confirmation
  - skip-stop
  - detour
  - end shift
- Port the existing web behavior, not the web components: 5-second polling, next-stop hero, tracker health, stop timeline, navigation handoff, detour banner, and exception actions.
- Route list should auto-open the active route when there is exactly one in-progress route for the bound van.
- Starting a shift should:
  - ensure tracking permissions are granted
  - collect a one-shot current GPS fix when available
  - call the existing start endpoint with optional `lat/lng`
  - render the existing cold-start confirmation flow if returned
  - start the existing foreground tracking service
- Refactor tracking lifecycle code so permission checks and service start/stop can be called independently from the UI orchestration.
- If shift creation succeeds but tracking start fails, do not auto-rollback the shift. Show a blocking recovery state with `Retry tracking` and `End shift`.
- Ending a shift should call the server first, then stop local tracking. If local stop fails, keep the user in a recovery state until tracking is stopped.

### Tracking coupling and resilience
- Normal driver UX must treat shift state and tracking as coupled; remove the manual tracking toggle from the main driver flow.
- Keep a support-only override for diagnostics/recovery, not as a primary driver control.
- Preserve boot/app-restart resilience by extending device-protected storage to mirror the minimum data needed for restart gating.
- Auto-resume tracking after reboot only when device provisioning exists and local `shiftActive` is true.
- On app foreground/bootstrap, reconcile local state with the server:
  - if there is no valid driver session or no active shift on the bound van, stop tracking and clear local shift state
  - if there is an active shift, restore the active-route experience

## Public APIs and Type Changes
- `requireAuth` / `requireRole` become dual-mode auth helpers: cookie session or bearer token.
- Driver endpoints accept optional native headers `Authorization`, `x-bound-van-id`, and `x-ingestion-token`; response shapes stay compatible unless a native-only convenience field is truly needed.
- Expo app types should split current `Settings` into `DeviceProvisioning` and driver-session/bootstrap state. Tracking payload types remain unchanged.

## Test Plan
- Server tests:
  - bearer auth succeeds for driver endpoints
  - cookie auth still works for the existing web flow
  - native bound-van filtering/rejection works on route list, detail, and mutations
  - web callers without provisioning headers are unaffected
- Expo logic tests:
  - bootstrap routing for unprovisioned, signed-out, signed-in, and active-shift states
  - session persistence and role rejection
  - shift start/end orchestration and recovery states
  - local `shiftActive` reconciliation after restart
- Manual Android acceptance:
  - provision device, sign in, start shift, confirm cold start, view active route, skip stop, enter/exit detour, end shift, log out
  - reboot during an active shift resumes tracking
  - reboot with no active shift does not resume tracking
  - wrong-phone or wrong-van usage is blocked
  - expired session and invalid ingestion token produce recoverable errors

## Assumptions
- V1 uses the existing Supabase email/password credentials for drivers; no PIN, magic link, or pairing-code auth.
- Device provisioning remains support-managed with the current ingestion-token model.
- Native becomes the primary driver surface, but the web driver area remains available during rollout.
- Bound-van enforcement is required for native requests and is additive; existing web behavior is preserved.
