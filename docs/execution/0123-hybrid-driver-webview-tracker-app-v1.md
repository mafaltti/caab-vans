## Hybrid Driver WebView in Tracker App v1

### Summary
Add a dedicated `Driver` screen to the Expo tracker app that embeds the existing web `/driver` flow in a `WebView`. Keep native GPS tracking unchanged and separate from shift start/end. Clean up web auth so driver users log in through `/driver/login` instead of `/admin/login`. Keep the entire app awake while it is open in the foreground to reduce Android sleep/kill pressure on tracking.

### Key Changes
#### Native tracker app
- Add `react-native-webview` and `expo-keep-awake` to `apps/van-tracker`.
- Create `apps/van-tracker/app/driver.tsx` that loads `${apiBaseUrl}/driver` in a full-screen `WebView`.
- Register the new screen in `apps/van-tracker/app/_layout.tsx` and add an `Open Driver` CTA from the home screen.
- Keep the `Open Driver` CTA gated behind the current full tracker provisioning state.
  - Do not change `isSettingsComplete()`, `getSettings()`, or the settings save model in v1.
- Apply keep-awake app-wide while the app is in the foreground.
  - Put the awake behavior in the root app shell, not only on the Driver screen.
  - The screen should stay on across Home, Settings, Diagnostics, and Driver.
  - Deactivate automatically when the app is backgrounded or closed.
- Treat keep-awake as a resilience aid, not the primary lifecycle mechanism.
  - Do not remove or weaken the current foreground-service, health-check, boot-restart, or battery-optimization guidance.
- WebView navigation rules:
  - Allow any same-origin `http/https` URL to stay inside the WebView.
  - Open external `http/https` URLs and non-http schemes (`geo:`, `waze:`, `comgooglemaps:`) with native `Linking.openURL`.
- Native back behavior:
  - Track WebView `canGoBack`.
  - On Android hardware back and stack back navigation, go back inside the WebView first.
  - Only leave the native Driver screen when the WebView history is exhausted.
- Keep native tracking separate from web shift control.
  - Starting a shift in the WebView does not start native tracking.
  - Native tracking still uses the current `Start Tracking` / `Stop Tracking` controls only.

#### Web auth and routing
- Move the existing protected driver routes under a route group:
  - `src/app/driver/(protected)/layout.tsx`
  - `src/app/driver/(protected)/page.tsx`
  - `src/app/driver/(protected)/routes/[routeId]/page.tsx`
- Do not add a new root `src/app/driver/layout.tsx` in v1.
- Add `src/app/driver/login/page.tsx` as a driver-branded login page.
  - Reuse the current login behavior and API endpoint.
  - On success, redirect drivers to `/driver` and non-drivers to `/admin`.
- Update all driver auth redirects to `/driver/login`.
  - Middleware unauthenticated `/driver/*` redirect.
  - Protected driver layout redirect.
  - Driver-side client fetch redirect on `401`.
- Keep admin auth behavior unchanged.
- Introduce a driver-specific fetch helper instead of changing every call site to pass a redirect target.
  - Admin pages keep using the current helper behavior.
  - Driver pages/components use the driver-specific helper.

#### Small webview-integration cleanup
- Change the driver navigation link in `src/components/driver/active-route/exception-drawer.tsx` to stop using `target="_blank"`.
- Keep the same destination URL, but let normal top-level navigation occur.
- Rely on native WebView URL interception to open maps or other external targets.
- Do not add injected popup/window bridge code in v1.

### Test Plan
- Native app:
  - The screen stays awake on every app screen while the app is open in the foreground.
  - The screen is allowed to sleep again once the app is backgrounded or closed.
  - Home shows `Open Driver` once the existing tracker settings are complete.
  - Driver screen loads `/driver/login` when no session exists.
  - Same-origin pages stay inside the WebView.
  - External navigation opens natively instead of inside the WebView.
  - Android back goes through WebView history before exiting the Driver screen.
  - Native tracking start/stop behavior is unchanged.
- Web auth:
  - Unauthenticated `/driver` requests redirect to `/driver/login`.
  - Successful driver login lands on `/driver`.
  - Successful non-driver login from `/driver/login` lands on `/admin`.
  - Driver-side `401` responses return to `/driver/login`.
  - Admin-side `401` responses still return to `/admin/login`.
- Regression:
  - Browser `/driver` flow still works outside the app.
  - Active route, skip stop, detour, and end shift still work unchanged in the embedded flow.
  - No backend API contracts or DB schema are modified.
- Operational validation:
  - With tracking enabled and the app left open on screen for an extended period, confirm the background task continues to send pings normally.
  - Re-test existing battery optimization and boot-restart guidance after the app-wide keep-awake change.

### Assumptions and Defaults
- Full tracker setup remains required before opening the new Driver screen.
- No partial-settings refactor is included in v1.
- No native-to-web SSO/session bridge is included in v1; login happens inside the WebView.
- Native tracking and web shift lifecycle remain separate by design.
- Keep-awake is app-wide in the foreground because the primary goal is reducing Android sleep/kill pressure on tracking.
- This is not a true Android kiosk or lock-task implementation; it keeps the display on but does not pin the app as device-owner software.
