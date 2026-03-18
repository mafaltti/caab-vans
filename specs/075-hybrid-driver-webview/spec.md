# Feature Specification: Hybrid Driver WebView in Tracker App

**Feature Branch**: `075-hybrid-driver-webview`
**Created**: 2026-03-17
**Status**: Implemented
**Input**: User description: "Add a dedicated Driver screen to the Expo tracker app that embeds the existing web /driver flow in a WebView, with app-wide keep-awake, dedicated /driver/login auth page, and native back navigation support"

## Clarifications

### Session 2026-03-17

- Q: Should driver logout redirect to `/driver/login` instead of `/admin/login`? → A: Yes. Driver logout redirects to `/driver/login`; admin logout continues to `/admin/login`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Driver accesses web workflow from within the tracker app (Priority: P1)

A driver who already has the tracker app installed and configured opens the app, taps "Open Driver" on the home screen, and is taken to the embedded web driver flow. If the driver has no active web session, the embedded view shows a driver-branded login page. After authenticating, the driver can start shifts, view active routes, skip stops, toggle detours, and end shifts — all inside the app without switching to a browser.

**Why this priority**: This is the core feature. Without the embedded WebView, the driver must juggle between the native tracker and a separate browser tab for shift management.

**Independent Test**: Can be tested by installing the updated tracker app, verifying the "Open Driver" button appears, tapping it, logging in at `/driver/login`, and completing a full shift cycle inside the WebView.

**Acceptance Scenarios**:

1. **Given** the tracker app is fully provisioned (apiBaseUrl, vanId, ingestionToken), **When** the driver opens the home screen, **Then** an "Open Driver" button is visible alongside the existing tracking controls.
2. **Given** the driver taps "Open Driver" with no active web session, **When** the WebView loads, **Then** it shows `/driver/login` (not `/admin/login`).
3. **Given** the driver submits valid credentials on `/driver/login`, **When** authentication succeeds, **Then** the WebView navigates to `/driver` showing the driver's route list.
4. **Given** the driver is authenticated in the WebView, **When** the driver starts a shift, views the active route, skips a stop, or ends a shift, **Then** each action completes successfully inside the WebView without opening external pages.

---

### User Story 2 - Dedicated driver login page on the web (Priority: P1)

Drivers logging in — whether from the embedded WebView or a standalone browser — see a driver-branded login page at `/driver/login` instead of the admin-branded page. After successful login, drivers land on `/driver` and non-drivers land on `/admin`. Expired sessions or 401 responses from driver pages redirect back to `/driver/login`, while admin pages continue redirecting to `/admin/login`.

**Why this priority**: Without a dedicated login page, the embedded WebView shows an admin-branded page that confuses drivers and creates a disjointed experience.

**Independent Test**: Can be tested entirely in a browser by visiting `/driver`, verifying redirect to `/driver/login`, logging in with driver credentials, and confirming the landing page is `/driver`.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user visits any `/driver/*` page, **When** the middleware intercepts the request, **Then** the user is redirected to `/driver/login`.
2. **Given** a driver submits valid credentials on `/driver/login`, **When** login succeeds, **Then** the browser navigates to `/driver`.
3. **Given** a non-driver (admin/superuser) submits valid credentials on `/driver/login`, **When** login succeeds, **Then** the browser navigates to `/admin`.
4. **Given** a driver's session expires while using a driver page, **When** the next request returns 401, **Then** the page redirects to `/driver/login`.
5. **Given** an admin's session expires while using an admin page, **When** the next request returns 401, **Then** the page redirects to `/admin/login` (unchanged behavior).
6. **Given** a driver is authenticated and taps the logout button on a driver page, **When** logout completes, **Then** the browser redirects to `/driver/login`.

---

### User Story 3 - App-wide keep-awake to reduce Android kill pressure (Priority: P2)

While the tracker app is in the foreground, the device screen stays on — across all screens (Home, Settings, Diagnostics, Driver). When the app is backgrounded or closed, keep-awake deactivates and the screen is allowed to sleep normally. This reduces Android sleep/kill pressure on the background tracking task.

**Why this priority**: Android aggressively kills background processes. Keeping the screen awake while the app is open is a resilience measure that complements the existing foreground service and health-check mechanisms.

**Independent Test**: Can be tested by opening the app, leaving it idle on any screen, and confirming the screen does not turn off. Then backgrounding the app and confirming the screen sleeps normally.

**Acceptance Scenarios**:

1. **Given** the app is open on any screen (Home, Settings, Diagnostics, or Driver), **When** the device idle timeout elapses, **Then** the screen remains on.
2. **Given** the app is open with keep-awake active, **When** the user backgrounds the app or switches to another app, **Then** keep-awake deactivates and the screen can sleep normally.
3. **Given** the app was backgrounded, **When** the user returns to the app, **Then** keep-awake reactivates.

---

### User Story 4 - External navigation opens natively (Priority: P2)

When the driver taps a navigation link (e.g., Google Maps directions to the next stop) inside the embedded WebView, the link opens in the native maps app or system browser instead of loading inside the WebView. Same-origin pages stay inside the WebView.

**Why this priority**: Without native handoff, tapping a maps link would load Google Maps inside the small WebView, providing a poor navigation experience.

**Independent Test**: Can be tested by starting a shift in the WebView, opening the exception drawer, tapping the "Navigate to stop" link, and confirming the native Maps app opens.

**Acceptance Scenarios**:

1. **Given** the driver is on the active route page in the WebView, **When** the driver taps a Google Maps navigation link, **Then** the link opens in the native Maps app or system browser.
2. **Given** the driver taps any same-origin link (e.g., `/driver/routes/123`), **When** the navigation occurs, **Then** the page loads inside the WebView.
3. **Given** the driver encounters a `geo:`, `waze:`, or `comgooglemaps:` URL, **When** the navigation occurs, **Then** the link opens via the device's native URL handler.

---

### User Story 5 - Native back navigation through WebView history (Priority: P2)

When the driver presses the Android hardware back button or the stack back navigation while on the Driver screen, the WebView navigates backward through its own history first. Only when the WebView history is exhausted does pressing back leave the Driver screen and return to the tracker home.

**Why this priority**: Without this, pressing back would immediately exit the Driver screen, losing the driver's position in the web workflow.

**Independent Test**: Can be tested by navigating through several pages in the WebView (login > route list > route detail), then pressing back repeatedly and confirming the WebView goes back through each page before returning to the home screen.

**Acceptance Scenarios**:

1. **Given** the driver has navigated through multiple pages inside the WebView (e.g., login > route list > route detail), **When** the driver presses the Android back button, **Then** the WebView navigates to the previous page in its history.
2. **Given** the WebView is showing the first page loaded (no history to go back to), **When** the driver presses the Android back button, **Then** the Driver screen closes and the tracker home screen appears.

---

### Edge Cases

- What happens when the device has no internet connection and the driver opens the Driver screen? The WebView shows a loading/error state with a retry action.
- What happens when the web session cookie is cleared by the OS or WebView engine? The driver must re-authenticate at `/driver/login` inside the WebView.
- What happens when tracker settings are incomplete? The "Open Driver" button is hidden; only the settings prompt is shown.
- What happens when the driver starts a shift in the WebView — does native tracking start? No. Shift management and native GPS tracking are completely separate controls.
- What happens when an admin user visits `/driver/login` in a browser? They can log in, and are redirected to `/admin` (role-based post-login redirect).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: App MUST display an "Open Driver" button on the home screen when the tracker is fully provisioned (apiBaseUrl, vanId, and ingestionToken all set).
- **FR-002**: App MUST NOT display the "Open Driver" button when any provisioning setting is missing.
- **FR-003**: Tapping "Open Driver" MUST open a full-screen embedded view of the web driver flow, loading the configured API base URL's `/driver` path.
- **FR-004**: The embedded view MUST support cookie-based session persistence so the driver does not need to re-authenticate on every visit.
- **FR-005**: The embedded view MUST show a loading indicator while the web content is being fetched.
- **FR-006**: The embedded view MUST show an error state with a retry action if the web content fails to load.
- **FR-007**: Same-origin web pages MUST load inside the embedded view without opening an external browser.
- **FR-008**: External URLs (different origin) and non-HTTP schemes (geo:, waze:, comgooglemaps:) MUST open via the device's native URL handler.
- **FR-009**: The Android back button MUST navigate backward through the embedded view's history before exiting the screen.
- **FR-010**: The device screen MUST stay awake while the app is open in the foreground, on any screen.
- **FR-011**: Keep-awake MUST deactivate when the app is backgrounded or closed.
- **FR-012**: Starting or ending a shift in the embedded web view MUST NOT start or stop native GPS tracking.
- **FR-013**: Native GPS tracking MUST continue to be controlled only by the existing Start/Stop Tracking buttons.
- **FR-014**: A dedicated driver login page MUST exist at `/driver/login` with driver-appropriate branding.
- **FR-015**: Unauthenticated requests to any `/driver/*` page (except `/driver/login`) MUST redirect to `/driver/login`.
- **FR-016**: Successful driver login from `/driver/login` MUST redirect to `/driver`.
- **FR-017**: Successful non-driver login from `/driver/login` MUST redirect to `/admin`.
- **FR-018**: Driver pages receiving a 401 response MUST redirect to `/driver/login`.
- **FR-019**: Admin pages receiving a 401 response MUST continue redirecting to `/admin/login` (unchanged).
- **FR-020**: Driver logout MUST redirect to `/driver/login`; admin logout MUST continue redirecting to `/admin/login`.
- **FR-021**: The existing browser-based `/driver` experience MUST remain functional and unchanged.
- **FR-022**: No backend API contracts, database schema, or driver workflow APIs MUST be modified.
- **FR-023**: The external navigation link in the active route exception actions MUST use standard navigation (not popup/new-window behavior) so that the embedded view's URL interception can handle it.
- **FR-024**: Existing foreground-service, health-check, boot-restart, and battery-optimization mechanisms MUST remain unchanged and functional.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A driver can complete a full shift cycle (login, start shift, view active route, end shift) entirely within the tracker app without switching to a browser.
- **SC-002**: External navigation links (maps directions) open in the native maps application 100% of the time when used from the embedded view.
- **SC-003**: The device screen remains on for at least 30 minutes of idle foreground time without user interaction.
- **SC-004**: Background GPS tracking continues to send location pings normally while the app is left open with keep-awake active for an extended period.
- **SC-005**: All existing driver web flows (start shift, active route polling, skip stop, detour, end shift) work identically in both the embedded view and a standalone browser.
- **SC-006**: Admin login, admin redirects, and admin 401 handling behave identically to before the change.
- **SC-007**: The Android back button correctly navigates through at least 3 levels of embedded view history before exiting the screen.

## Assumptions & Defaults

- Full tracker provisioning (apiBaseUrl + vanId + ingestionToken) is required before the Driver screen is accessible. No partial-settings refactor in v1.
- No native-to-web SSO or session bridge in v1. Session persistence relies on the embedded view's cookie store. If cookies are cleared, the driver must re-login.
- Keep-awake is app-wide in the foreground to reduce Android sleep/kill pressure on tracking, not a true kiosk/lock-task implementation.
- The configured `apiBaseUrl` is the same origin used for both tracker APIs and the web `/driver` pages.
- Shift management (web) and native GPS tracking remain separate controls by design.
- The driver login page reuses the existing login API endpoint and auth model. No new auth backend is needed.
- Removing popup/new-window behavior from the maps link may slightly degrade the standalone browser experience (user navigates away instead of opening a new tab). This is an accepted trade-off for clean embedded view integration.
