# Feature Specification: Native Driver App

**Feature Branch**: `075-native-driver-app`
**Created**: 2026-03-16
**Status**: Draft
**Input**: Build the primary driver experience natively in the Expo van-tracker app, replacing the web driver flow as the main surface for van-bound phones.

## Clarifications

### Session 2026-03-16

- Q: What happens to an active shift and tracking when a different driver signs in on the same device? → A: Auto-end the previous driver's shift (server call + stop local tracking) before the new session begins. This prevents orphaned shifts and aligns with the coupled shift-tracking model.
- Q: Can a driver log out during an active shift? → A: No. Logout is blocked while a shift is active; the driver must end the shift first. This avoids orphaned shifts and keeps the shift-tracking coupling intact.
- Q: How do support staff access the device-setup and diagnostics area? → A: Via a hidden gesture (e.g., long-press on app version text). This keeps it invisible to drivers while accessible to support staff who know the gesture.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Driver Signs In and Views Routes (Priority: P1)

A driver picks up the shared van-bound phone and signs in with their email and password. The app shows a list of routes assigned to the bound van for the current day. If exactly one route is in progress, it opens automatically.

**Why this priority**: Without authentication and route visibility, no other driver workflow is possible. This is the foundational entry point.

**Independent Test**: Can be fully tested by signing in on a provisioned device and verifying that only routes for the bound van appear. Delivers value by proving auth, session persistence, and van-bound filtering work end-to-end.

**Acceptance Scenarios**:

1. **Given** a provisioned device with no driver session, **When** the driver opens the app, **Then** the login screen is displayed.
2. **Given** valid driver credentials, **When** the driver signs in, **Then** the session is persisted and the route list for the bound van is displayed.
3. **Given** credentials for a non-driver or inactive user, **When** they attempt to sign in, **Then** the app rejects the login with a clear error message.
4. **Given** an expired session, **When** the driver opens the app, **Then** the session auto-refreshes transparently or prompts re-login if refresh fails.
5. **Given** exactly one in-progress route for the bound van, **When** the route list loads, **Then** the app automatically opens the active route screen.

---

### User Story 2 - Driver Starts a Shift (Priority: P1)

A signed-in driver selects a route and starts their shift. The app ensures location permissions are granted, collects a GPS fix, calls the server to start the route, handles cold-start confirmation if applicable, and begins foreground location tracking.

**Why this priority**: Starting a shift is the primary action that enables all subsequent driver workflows (stop progression, exceptions, tracking). Without this, the app has no operational value.

**Independent Test**: Can be tested by starting a shift on a provisioned device with a signed-in driver and verifying the route transitions to in-progress, cold-start flow appears when applicable, and location tracking begins.

**Acceptance Scenarios**:

1. **Given** a signed-in driver with a pending route, **When** they start the shift, **Then** location permissions are requested if not already granted.
2. **Given** permissions granted, **When** the shift start is confirmed, **Then** the app collects a GPS fix and sends it with the start request.
3. **Given** the server detects a cold start (30+ min late), **When** the start response includes cold-start data, **Then** the app displays the confirmation flow with suggested start stop.
4. **Given** a successful shift start, **When** the server responds, **Then** foreground location tracking begins automatically.
5. **Given** shift creation succeeds but tracking start fails, **When** the tracking error occurs, **Then** the app shows a blocking recovery screen with "Retry tracking" and "End shift" options (does not auto-rollback).

---

### User Story 3 - Driver Monitors Active Route (Priority: P1)

During an active shift, the driver views the active route screen showing the next stop, schedule timeline, tracker health, and real-time updates via polling.

**Why this priority**: Real-time route monitoring is the core value proposition for drivers during their shift, providing situational awareness and enabling exception handling.

**Independent Test**: Can be tested by viewing an active route with known stop data and verifying the next-stop display, timeline accuracy, polling updates, and tracker health indicators.

**Acceptance Scenarios**:

1. **Given** an active shift, **When** the active route screen loads, **Then** the next stop name, scheduled time, and ETA are prominently displayed.
2. **Given** an active route, **When** 5 seconds elapse, **Then** the screen polls for updated route data and refreshes the display.
3. **Given** an active route with tracker data, **When** the health panel is visible, **Then** it shows ping freshness, battery level, and network type.
4. **Given** an active route, **When** stops are completed, **Then** the schedule timeline updates to show past, current, and future stops with appropriate visual distinction.

---

### User Story 4 - Driver Handles Exceptions (Priority: P2)

A driver can skip a stop (with reason code and optional note), start or end a detour, and hand off to external navigation during their active shift.

**Why this priority**: Exception handling is essential for real-world operations where routes don't always go as planned, but it builds on the active route monitoring foundation.

**Independent Test**: Can be tested by triggering each exception action (skip, detour start/end, navigation handoff) during an active shift and verifying server state updates and UI feedback.

**Acceptance Scenarios**:

1. **Given** an active route, **When** the driver initiates a stop skip, **Then** a reason code selection and optional note input are presented.
2. **Given** a valid skip reason, **When** the driver confirms the skip, **Then** only the next stop in sequence is skipped and the timeline advances.
3. **Given** an active route, **When** the driver starts a detour, **Then** a detour banner appears on the active route screen.
4. **Given** an active detour, **When** the driver ends the detour, **Then** the banner is removed and the route resumes normal operation.
5. **Given** the active route screen, **When** the driver taps navigation handoff, **Then** the device opens the external navigation app with the next stop's coordinates.

---

### User Story 5 - Driver Ends a Shift (Priority: P2)

A driver ends their shift, which calls the server first and then stops local tracking. If tracking stop fails, the driver remains in a recovery state until resolved.

**Why this priority**: Clean shift termination is required for operational correctness and ensures tracking resources are properly released.

**Independent Test**: Can be tested by ending a shift and verifying the server marks the route as completed and local tracking stops.

**Acceptance Scenarios**:

1. **Given** an active shift, **When** the driver ends the shift, **Then** the server is called first to mark the route as completed.
2. **Given** a successful server response, **When** local tracking is stopped, **Then** the driver returns to the route list screen.
3. **Given** local tracking stop fails after a successful server call, **When** the error occurs, **Then** the driver sees a recovery screen with a "Retry stop tracking" option.
4. **Given** an active detour at shift end, **When** the shift ends, **Then** the detour is automatically deactivated.

---

### User Story 6 - Device Provisioning by Support (Priority: P2)

Support staff configure the device with the API base URL, van ID, and ingestion token. This provisioning step is separate from driver sign-in and gates all app functionality.

**Why this priority**: Device provisioning is the prerequisite for all app functionality, but it happens once per device and is managed by support, not drivers.

**Independent Test**: Can be tested by entering provisioning details and verifying the app transitions from the unprovisioned state to the login screen.

**Acceptance Scenarios**:

1. **Given** an unprovisioned device, **When** the app launches, **Then** the device setup screen is displayed.
2. **Given** the device setup screen, **When** support enters valid provisioning details (API base URL, van ID, ingestion token), **Then** the device is provisioned and the login screen appears.
3. **Given** a provisioned device, **When** the driver flow is active, **Then** the provisioning screen is not accessible from the main driver navigation — it requires a hidden gesture (e.g., long-press on version text).
4. **Given** a provisioned device, **When** support accesses the support/device-setup area, **Then** they can view and update provisioning details.

---

### User Story 7 - App Resilience After Reboot or Restart (Priority: P3)

When the device reboots or the app restarts during an active shift, tracking resumes automatically and the driver experience is restored by reconciling local state with the server.

**Why this priority**: Resilience ensures operational continuity during real-world events (battery dies, Android kills process), but it builds on all other workflows being functional.

**Independent Test**: Can be tested by force-killing or rebooting the app during an active shift and verifying tracking resumes and the active route screen is restored.

**Acceptance Scenarios**:

1. **Given** a device reboot during an active shift, **When** the app restarts, **Then** tracking resumes automatically because device provisioning exists and local shift state is active.
2. **Given** a device reboot with no active shift, **When** the app restarts, **Then** tracking does not resume.
3. **Given** an app restart during an active shift, **When** the app reconciles with the server, **Then** if the server shows an active shift for the bound van, the active route experience is restored.
4. **Given** an app restart, **When** the server shows no active shift for the bound van, **Then** local tracking stops and shift state is cleared.
5. **Given** an app restart, **When** there is no valid driver session, **Then** tracking stops and the login screen is displayed.

---

### User Story 8 - Diagnostics and Support Access (Priority: P3)

Support staff and drivers can access diagnostics information (tracking status, device health) from a support/profile area. A support-only override exists for manually controlling tracking in recovery scenarios.

**Why this priority**: Diagnostics support troubleshooting but are not part of the primary driver workflow.

**Independent Test**: Can be tested by navigating to the diagnostics screen and verifying tracking status and device health are displayed.

**Acceptance Scenarios**:

1. **Given** any app state, **When** the user navigates to the support/profile area, **Then** diagnostics information is displayed (tracking status, battery, network).
2. **Given** a recovery scenario, **When** support accesses the diagnostics area, **Then** a manual tracking toggle is available as an override (not visible in the main driver flow).

---

### Edge Cases

- What happens when the driver's session expires mid-shift? The session auto-refreshes; if refresh fails, tracking continues with buffered points and the driver sees a re-login prompt.
- What happens when location permissions are revoked mid-shift? The foreground detection mechanism detects the failure, and a recovery modal prompts the driver to re-grant permissions.
- What happens when a driver tries to start a shift on a route not assigned to the bound van? The server rejects the request and the app displays an error.
- What happens when network connectivity is lost during a shift? Location points are buffered locally (up to 500 points, 24h TTL) and flushed when connectivity returns. The driver sees a network status indicator.
- What happens when two drivers try to sign in on the same device? If the first driver has an active shift, the app auto-ends that shift (server call + stop tracking) before proceeding with the new sign-in. The new driver then starts fresh from the route list.
- What happens when a driver uses the wrong phone (different van)? The bound-van enforcement rejects route requests that don't match the device's provisioned van ID.
- What happens when an invalid ingestion token is used? The server returns an authentication error and the app displays a recoverable error prompting support intervention.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST authenticate drivers using email and password credentials, persisting the session locally on the device.
- **FR-002**: The app MUST reject sign-in attempts from users who are not drivers or whose accounts are inactive.
- **FR-003**: The app MUST present a bootstrap gate that routes users through three states: unprovisioned (device setup), signed out (login), and signed in (route list or active route).
- **FR-004**: The app MUST separate device provisioning (support-managed: API base URL, van ID, ingestion token) from driver authentication.
- **FR-005**: The server MUST accept authentication via either cookie-based web sessions (existing) or bearer tokens from the native app. Both methods MUST work simultaneously.
- **FR-006**: The server MUST enforce bound-van filtering on route list requests from native callers, returning only routes matching the device's provisioned van ID.
- **FR-007**: The server MUST reject route detail and mutation requests from native callers when the route's van does not match the device's bound van ID.
- **FR-008**: Existing web callers MUST remain unaffected by the addition of native auth and bound-van enforcement (headers are optional for web).
- **FR-009**: The app MUST display a route list showing all routes for the bound van on the current day.
- **FR-010**: The app MUST auto-open the active route screen when exactly one in-progress route exists for the bound van.
- **FR-011**: The app MUST support starting a shift, including: permission checks, GPS fix collection, server start call with optional coordinates, cold-start confirmation flow, and foreground tracking activation.
- **FR-012**: The app MUST display the active route screen with next-stop hero (name, scheduled time, ETA, delay badge), schedule timeline, tracker health, and 5-second polling.
- **FR-013**: The app MUST support skip-stop with reason code selection and optional note, enforcing head-of-line (only the next stop is skippable).
- **FR-014**: The app MUST support starting and ending detours, displaying a detour banner during active detours.
- **FR-015**: The app MUST support navigation handoff to external navigation apps.
- **FR-016**: The app MUST end shifts by calling the server first, then stopping local tracking. If local stop fails, a recovery state MUST be shown.
- **FR-017**: If shift creation succeeds but tracking start fails, the app MUST NOT auto-rollback the shift. It MUST show a recovery screen with "Retry tracking" and "End shift" options.
- **FR-018**: The app MUST persist shift state (active route ID, shift active flag) in device-protected storage for reboot resilience.
- **FR-019**: The app MUST auto-resume tracking after device reboot only when provisioning exists and local shift state indicates an active shift.
- **FR-020**: On app foreground or restart, the app MUST reconcile local state with the server: stop tracking if no valid session or no active shift exists; restore the active route experience if an active shift exists.
- **FR-021**: The manual tracking toggle MUST be removed from the main driver flow and available only in a support-only diagnostics area.
- **FR-022**: The app MUST keep the existing web driver flow functional as a rollout fallback.
- **FR-023**: No database migration is required. All changes MUST work with the existing database schema.
- **FR-024**: When a new driver signs in while a previous driver has an active shift, the app MUST auto-end the previous shift (server call + stop local tracking) before establishing the new session.
- **FR-025**: The app MUST block the logout action while a shift is active. The driver MUST end the shift before logging out.
- **FR-026**: The support/device-setup and diagnostics area MUST be accessible only via a hidden gesture (e.g., long-press on app version text), not through the main driver navigation.

### Key Entities

- **Device Provisioning**: Configuration data binding a device to a specific van (API base URL, van ID, ingestion token). Managed by support staff, persisted securely on device.
- **Driver Session**: Authenticated driver state (access token, refresh token, user profile). Persisted locally with auto-refresh capability.
- **Shift State**: Local representation of an active shift (active route ID, shift active flag). Persisted in device-protected storage for reboot resilience.
- **Route**: A scheduled van route with stops, assigned van, and current status (waiting, in-progress, completed).
- **Route Run**: A daily instance of a route with start/end timestamps and stop progression.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Drivers can sign in, view their routes, and start a shift within 60 seconds on a provisioned device.
- **SC-002**: The active route screen updates with fresh data every 5 seconds during an active shift.
- **SC-003**: All exception actions (skip stop, detour, navigation handoff) complete within 3 seconds of driver confirmation.
- **SC-004**: After a device reboot during an active shift, tracking resumes and the active route experience is restored within 30 seconds of app restart.
- **SC-005**: Existing web driver flows continue to work identically with no behavioral changes.
- **SC-006**: A driver on the wrong device (different van) is blocked from accessing routes not assigned to that van.
- **SC-007**: 100% of driver workflow steps (sign in, start shift, monitor route, handle exceptions, end shift) are available natively without requiring a web browser.
- **SC-008**: Drivers experience no data loss during network interruptions — all location points are buffered and delivered when connectivity returns.

## Assumptions

- V1 uses existing Supabase email/password credentials for drivers; no PIN, magic link, or pairing-code authentication.
- Device provisioning remains support-managed using the current ingestion-token model.
- The native app becomes the primary driver surface, but the web driver area remains available as a rollout fallback.
- Bound-van enforcement is additive for native requests; existing web behavior is fully preserved.
- One device is bound to one van. Multi-van-per-device is out of scope.
- Driver session tokens auto-refresh via the Supabase SDK; no custom refresh logic is needed.
- The existing tracking infrastructure (background tasks, battery optimization, network resilience, boot recovery) is reused with minimal refactoring.
- All business logic (cold-start detection, progress advancement, detour management) remains server-side; the native app only calls existing endpoints.
