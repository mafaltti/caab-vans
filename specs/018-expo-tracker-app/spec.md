# Feature Specification: Expo Van Tracker App

**Feature Branch**: `018-expo-tracker-app`
**Created**: 2026-03-01
**Status**: Draft
**Input**: User description: "Expo Android tracker app: create a new Expo + TypeScript project in apps/van-tracker/ that sends device geolocation to POST /api/tracking/{vanId} with x-ingestion-token auth, working with screen locked on Android."

## Clarifications

### Session 2026-03-01

- Q: Should the app auto-resume tracking on app restart/reboot if it was previously active? → A: Yes — auto-resume. If the persisted tracking-enabled flag is true on launch, automatically restart the foreground service and resume tracking without driver intervention.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure Tracker App (Priority: P1)

A van driver opens the tracker app for the first time. They navigate to the Settings screen and enter the API Base URL, Van ID (UUID), and Ingestion Token provided by the CAAB administrator. These values are saved persistently so they don't need to re-enter them after closing the app.

**Why this priority**: Without proper configuration, no tracking can occur. This is the first action any driver must perform.

**Independent Test**: Can be fully tested by opening the app, navigating to Settings, entering values, closing and reopening the app, and verifying values persist. Delivers configuration readiness.

**Acceptance Scenarios**:

1. **Given** the app is freshly installed, **When** the driver opens Settings, **Then** all three fields (API Base URL, Van ID, Ingestion Token) are empty.
2. **Given** the driver enters a valid UUID for Van ID and fills all fields, **When** they save, **Then** the values persist across app restarts.
3. **Given** the driver enters an invalid (non-UUID) Van ID, **When** they attempt to save, **Then** the app shows a validation error and does not save.
4. **Given** any required field is empty, **When** the driver returns to the Home screen, **Then** tracking cannot be started and a message indicates settings are incomplete.

---

### User Story 2 - Start and Monitor Live Tracking (Priority: P1)

A van driver with completed settings taps "Start Tracking" on the Home screen. The app requests location permissions (foreground, then background on Android), starts a foreground service with a persistent notification, and begins sending GPS coordinates to the backend. The Home screen displays real-time status: tracking on/off, last sent time, last latitude/longitude, and any errors.

**Why this priority**: This is the core function of the app — sending live location data to the backend.

**Independent Test**: Can be tested by starting tracking, observing the persistent notification, verifying POST requests reach the server, and confirming the status display updates on the Home screen.

**Acceptance Scenarios**:

1. **Given** settings are complete and permissions are granted, **When** the driver taps "Start Tracking", **Then** a foreground service starts with a persistent notification and the Home screen shows "Tracking: ON".
2. **Given** tracking is active, **When** a new location is sent successfully, **Then** the Home screen updates with the last sent timestamp and last lat/lng coordinates.
3. **Given** tracking is active, **When** a send fails (network error), **Then** the Home screen displays the last error message and the point is buffered.
4. **Given** tracking is active, **When** the driver locks the screen, **Then** location updates continue to be sent in the background.
5. **Given** tracking is active, **When** the driver taps "Stop Tracking", **Then** the foreground service stops, the notification disappears, and the Home screen shows "Tracking: OFF".

---

### User Story 3 - Background Tracking with Screen Locked (Priority: P1)

A van driver starts tracking and locks their phone screen. The app continues to capture and send GPS coordinates via the Android foreground service. When the driver unlocks the screen, the Home screen reflects the latest successfully sent location.

**Why this priority**: Background operation is a hard requirement — without it, tracking only works while the driver actively holds the phone, which is unsafe and impractical.

**Independent Test**: Start tracking, lock screen, wait several minutes, unlock, and verify that multiple location points were sent to the server during the locked period.

**Acceptance Scenarios**:

1. **Given** tracking is active and the screen is locked, **When** 30 seconds pass, **Then** at least several location points have been sent to the server.
2. **Given** tracking is active and the screen is locked, **When** the driver unlocks the phone, **Then** the Home screen shows the most recent sent coordinates and timestamp.
3. **Given** tracking is active and the screen is locked, **When** Android Doze mode is active and the device is stationary, **Then** location updates may be delayed (best-effort) but resume when the device moves.

---

### User Story 4 - Smart Throttle and Accuracy Filtering (Priority: P2)

The app applies client-side filtering to avoid sending excessive or inaccurate data. Points are only sent when the device has moved at least 5 meters OR 3 seconds have elapsed (whichever comes later). Points with accuracy worse than 50 meters are dropped entirely.

**Why this priority**: Battery efficiency and data quality are important but secondary to core tracking functionality.

**Independent Test**: Can be tested by monitoring sent requests — verify no requests are sent faster than 3s apart, and that low-accuracy points are dropped.

**Acceptance Scenarios**:

1. **Given** tracking is active and the device hasn't moved 5m, **When** less than 3 seconds have passed since last send, **Then** no new point is sent.
2. **Given** tracking is active, **When** a location update has accuracy > 50m, **Then** the point is dropped and not sent or buffered.
3. **Given** tracking is active and the device moves 5m+, **When** at least 3 seconds have passed since last send, **Then** a new point is sent.

---

### User Story 5 - Offline Buffering and Reconnection (Priority: P2)

When the device has no network connectivity, the app buffers unsent location points locally (up to 50 points). When connectivity returns, the buffer is flushed oldest-first before new points are sent. If the buffer is full, the oldest point is dropped to make room for a new one.

**Why this priority**: Vans travel through areas with spotty coverage. Buffering prevents data loss during brief connectivity gaps.

**Independent Test**: Disable network, start tracking, verify points accumulate in storage. Re-enable network and verify buffered points are sent to the server oldest-first.

**Acceptance Scenarios**:

1. **Given** tracking is active and the network is unavailable, **When** a new location point is captured, **Then** it is stored in the local buffer.
2. **Given** the buffer contains 50 points and the network is unavailable, **When** a new point is captured, **Then** the oldest point is dropped and the new one is added.
3. **Given** the buffer contains unsent points and the network becomes available, **Then** buffered points are sent oldest-first before new points.
4. **Given** a buffered point is sent successfully, **Then** it is removed from the buffer and each sent point retains its original capture timestamp.

---

### User Story 6 - Permission Handling (Priority: P2)

The app guides the driver through Android's location permission flow: first requesting foreground location, then background location. On Android 13+, it also handles notification permission. If permissions are denied, the app explains why they are needed and prevents tracking from starting.

**Why this priority**: Without correct permissions, background tracking cannot work. Proper UX for permission requests avoids user confusion.

**Independent Test**: Can be tested by denying various permissions and verifying the app responds correctly (does not crash, shows explanatory messages, prevents tracking start).

**Acceptance Scenarios**:

1. **Given** the app has no location permissions, **When** the driver taps "Start Tracking", **Then** the app requests foreground location permission first.
2. **Given** foreground permission is granted, **When** the app needs background tracking, **Then** it requests background location permission.
3. **Given** any required permission is denied, **When** the driver tries to start tracking, **Then** the app shows a clear message explaining why the permission is needed and does not start tracking.
4. **Given** Android 13+ device, **When** tracking starts, **Then** the app requests notification permission for the foreground service notification.

---

### Edge Cases

- What happens when the device GPS is turned off mid-tracking? The app shows an error status and resumes tracking when GPS is re-enabled.
- What happens when the server returns 401 (Unauthorized)? The app displays the error on the Home screen and continues attempting on subsequent points (the driver may need to update the token in Settings).
- What happens when the server returns 429 (Rate Limited)? The app backs off and retries on the next location update cycle.
- What happens when the server returns 404 (Van Not Found)? The app displays the error so the driver can verify the Van ID in Settings.
- What happens when the app is killed by the Android OS? The foreground service keeps it alive; if truly killed, tracking auto-resumes on next app launch (via persisted tracking-enabled flag).
- What happens when the device clock is significantly wrong? The server falls back to its own timestamp if the device timestamp is > 24h in the future.
- What happens when the app is updated while tracking? Tracking stops and must be manually restarted after the update.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST be an Expo + TypeScript project located in `apps/van-tracker/`.
- **FR-002**: The app MUST provide a Settings screen with fields for API Base URL, Van ID (UUID), and Ingestion Token, all persisted locally.
- **FR-003**: The app MUST validate that Van ID is a valid UUID format before saving.
- **FR-004**: The app MUST provide a Home screen with Start/Stop tracking controls and real-time status display (tracking on/off, last sent time, last lat/lng, last error).
- **FR-005**: The app MUST send location data via `POST {API_BASE_URL}/api/tracking/{vanId}` with `x-ingestion-token` header authentication.
- **FR-006**: The POST body MUST include `deviceId` (a UUID generated once and persisted), `lat`, `lng`, `accuracy`, `speed`, `heading`, and `ts` (Unix milliseconds UTC).
- **FR-007**: The app MUST use a foreground service (expo-location + expo-task-manager) to continue tracking with the screen locked on Android.
- **FR-008**: The app MUST display a persistent Android notification while tracking is active.
- **FR-009**: The app MUST throttle location sends: only send when distance >= 5m OR 3 seconds have elapsed, whichever comes later.
- **FR-010**: The app MUST drop location points with accuracy > 50m.
- **FR-011**: The app MUST buffer up to 50 unsent points locally (FIFO queue) when the network is unavailable.
- **FR-012**: When the buffer is full (50 points), the app MUST drop the oldest point to make room for new ones.
- **FR-013**: When connectivity returns, the app MUST flush buffered points oldest-first before sending new points.
- **FR-014**: Each buffered point MUST retain its original capture timestamp when sent.
- **FR-015**: The app MUST handle Android permission flow correctly: foreground location first, then background location, then notification permission (Android 13+).
- **FR-016**: The app MUST NOT crash on network errors; errors are displayed in the status area and the point is buffered.
- **FR-017**: The app MUST handle server error responses (401, 404, 429) gracefully with user-visible messages.
- **FR-018**: The app MUST persist the tracking-enabled flag and last-sent timestamp locally.
- **FR-023**: On app launch, if the persisted tracking-enabled flag is true and settings are complete, the app MUST automatically resume tracking (restart the foreground service) without requiring the driver to tap "Start Tracking".
- **FR-019**: The app MUST use EAS Development Build (not Expo Go) and the README must document the build process.
- **FR-020**: The app MUST provide a README with install, EAS setup, build, run, and locked-screen test instructions.
- **FR-021**: The app MUST use minimal dependencies — no heavy state management frameworks.
- **FR-022**: The app MUST use simple navigation (Expo Router or React Navigation) with two screens: Home and Settings.

### Key Entities

- **Device Settings**: Configuration data (API Base URL, Van ID, Ingestion Token) persisted on the device. Required before tracking can start.
- **Device Identity**: A unique device UUID generated once on first launch and persisted permanently. Included in every tracking request for diagnostic/audit purposes.
- **Location Point**: A single GPS reading with latitude, longitude, accuracy, speed, heading, and UTC timestamp. May be sent immediately or buffered.
- **Offline Buffer**: A local FIFO queue of up to 50 unsent location points, persisted on device. Flushed oldest-first when connectivity returns.
- **Tracking Session**: The active state between Start and Stop. Maintains a foreground service, sends points, and updates the Home screen status display.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A driver can configure the app and start tracking within 2 minutes of first launch.
- **SC-002**: With the screen locked, the app sends location updates at least every 5 seconds under normal conditions (not in Doze mode).
- **SC-003**: 100% of location points with accuracy <= 50m are either sent to the server or buffered locally — no silent drops.
- **SC-004**: After a 5-minute network outage, all buffered points (up to 50) are delivered to the server within 30 seconds of reconnection.
- **SC-005**: The app does not crash during a 4-hour continuous tracking session (typical round-trip duration).
- **SC-006**: Battery consumption for continuous tracking is comparable to standard navigation apps (no excessive drain from polling).
- **SC-007**: The foreground service keeps the app alive through screen lock, app switch, and device idle — tracking resumes without driver intervention.
- **SC-008**: The README enables a developer to set up, build, and run the app on an Android device within 15 minutes.

## Assumptions

- The backend tracking endpoint (`POST /api/tracking/{vanId}`) is already implemented and functional.
- The van's `ingestion_token` is provided to the driver by a CAAB administrator out-of-band (e.g., verbally or via message).
- The target devices are Android phones (iOS support is not required for this spec).
- The app will be distributed to drivers via direct APK install or internal testing tracks, not the public Play Store (for MVP).
- Drivers have basic familiarity with granting app permissions on their Android devices.
- The EAS build environment (Expo Application Services) is available and the developer has an Expo account configured.
