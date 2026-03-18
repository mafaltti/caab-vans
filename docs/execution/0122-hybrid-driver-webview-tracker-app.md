## Hybrid Driver WebView in Tracker App

### Summary
Add a dedicated `Driver` screen to the Expo tracker app that embeds the existing web `/driver` experience in a `WebView`, while keeping native GPS tracking as a separate, unchanged control path. Pair that with a web auth cleanup so driver users authenticate through `/driver/login` instead of being bounced to the admin login flow.

### Implementation Changes
#### Native tracker app
- Add `react-native-webview` and `expo-keep-awake` to the tracker app, and create a new Expo route at `apps/van-tracker/app/driver.tsx`.
- The new screen loads `${apiBaseUrl}/driver` in a full-height `WebView`, with:
  - `sharedCookiesEnabled`, `thirdPartyCookiesEnabled`, JS + DOM storage enabled
  - a loading state and a retry action when the page fails to load
  - `useKeepAwake()` active only while this screen is focused
- Keep the native tracker home as the default screen. Add an `Open Driver` CTA from the home screen instead of replacing the home flow.
- Decouple driver access from full tracker provisioning:
  - If `apiBaseUrl` exists, allow opening the Driver screen
  - Keep native `Start/Stop Tracking` gated behind full tracker settings (`apiBaseUrl`, `vanId`, `ingestionToken`)
- Do not auto-sync shift start with native tracking:
  - starting/ending a shift in the webview changes only the web workflow
  - native GPS tracking remains controlled by the existing native Start/Stop button
- Handle external navigation in native:
  - keep same-origin `/driver` and related auth pages inside the webview
  - open Google Maps, Waze, `geo:` links, and any non-app-origin URL with `Linking.openURL`
  - inject a small bridge script so `window.open` and `target="_blank"` links are forwarded to native and do not break inside the webview

#### Web auth and routing cleanup
- Introduce a dedicated `/driver/login` page for driver-facing authentication.
- Restructure the Next.js driver routes so protected driver pages sit under a protected route group and `/driver/login` stays outside the auth-guarded layout. Keep public URLs unchanged.
- Update all driver auth redirects to use `/driver/login`:
  - middleware unauthenticated `/driver/*` redirect
  - protected driver layout redirect
  - driver-side client fetch helper on `401`
- Keep the existing server login endpoint and auth model unchanged for v1:
  - `/driver/login` can still post to the current credentials endpoint
  - on success, redirect drivers to `/driver`; non-driver users still land on `/admin`
- Reuse the existing login form behavior, but with driver-specific copy and branding.

#### Existing driver web flow reuse
- Reuse the current `/driver` pages and APIs as-is for shift start, active route, detour, skip stop, and end shift.
- Do not change backend route contracts, database schema, or driver workflow APIs for this feature.
- Preserve the current browser-based `/driver` experience; the webview should be an additional shell, not a fork.

### Interfaces and Behavioral Changes
- New native route: Expo `Driver` screen available from the tracker app home.
- New web route: `/driver/login`.
- Internal helper change: make the client auth fetch helper accept an unauthorized redirect target, defaulting to `/admin/login`, with driver pages using `/driver/login`.
- No API contract or schema changes:
  - keep existing `/driver`, `/api/driver/*`, `/api/routes/:routeId/start`, `/api/routes/:routeId/end`
  - keep existing session-cookie auth for driver pages
  - keep existing ingestion-token auth for tracker endpoints

### Test Plan
- Native app navigation:
  - home shows `Open Driver` when `apiBaseUrl` is configured, even if tracking is not fully provisioned
  - native tracking controls stay hidden or disabled until full tracking settings are present
- Driver login flow:
  - opening the Driver screen with no session shows `/driver/login`, not the admin login page
  - successful driver login lands on `/driver`
  - expired session or `401` from driver pages returns to `/driver/login`
- Embedded driver workflow:
  - start shift works inside the webview
  - active route page loads and keeps polling normally
  - end shift returns to the driver route list
- External handoff:
  - tapping navigation opens the native maps app or system browser, not inside the webview
  - popup/new-window links do not silently fail
- Device behavior:
  - screen stays awake while the Driver screen is visible
  - leaving the Driver screen removes keep-awake behavior
  - native background tracking still works exactly as before
  - opening the Driver screen does not start or stop native tracking automatically
- Regression checks:
  - browser `/driver` flow still works unchanged outside the app
  - admin login and admin redirects still behave as before

### Assumptions and Defaults
- Chosen UX: keep the tracker home/settings flow and add a separate Driver screen.
- Chosen auth UX: dedicated `/driver/login` route; do not reuse the admin-branded login page in the embedded flow.
- Chosen tracking behavior: shift management and native GPS tracking remain separate controls.
- Keep-awake applies only to the native Driver screen, not globally.
- The configured `apiBaseUrl` is the same origin used for both tracker APIs and the web `/driver` pages.
- No native-to-web SSO/session bridge is included in v1; session persistence relies on the webview cookie store.
