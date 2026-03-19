# Feature Specification: Driver UX Improvements

**Feature Branch**: `078-driver-ux-improvements`
**Created**: 2026-03-19
**Status**: Draft
**Input**: Driver UX improvements covering navigation flow fixes, active route enrichments, PIN-based login, and operational awareness features for the driver mobile experience.

## Clarifications

### Session 2026-03-19

- Q: With variable-length PINs (4-6 digits), how should the login screen handle submission — auto-submit or manual button? → A: Fixed 6-digit PINs only; auto-submit after 6th digit entered.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seamless Shift Navigation (Priority: P1)

When a driver starts a shift, the app should automatically take them to the active route view without requiring manual navigation. This eliminates the most common friction point: drivers starting a shift and then having to find and tap into their route.

**Why this priority**: Drivers start shifts multiple times daily. Every unnecessary tap adds friction and increases the chance of confusion, especially for less tech-savvy drivers. This is the single highest-impact improvement.

**Independent Test**: Start a shift from the route list; verify the app navigates to the active route page automatically.

**Acceptance Scenarios**:

1. **Given** a driver is on the route list and taps "Start Shift" (normal start), **When** the shift starts successfully, **Then** the app navigates to the active route detail page automatically.
2. **Given** a driver starts a shift that triggers a cold-start dialog (mid-route pickup), **When** the driver selects a starting stop and confirms, **Then** the app navigates to the active route detail page automatically.
3. **Given** a driver starts a shift that triggers a cold-start dialog, **When** the dialog is displayed, **Then** the driver cannot dismiss the dialog without selecting a stop and confirming (no skip button, no backdrop/escape close).

---

### User Story 2 - Auto-Redirect to Active Shift (Priority: P1)

When a driver opens the app or refreshes the browser while they have an active shift, the app should redirect them to their active route automatically. This covers browser refreshes mid-shift, login redirects, and navigating back from the active route.

**Why this priority**: Drivers frequently lose their place due to browser refreshes, accidental navigation, or phone restarts. Automatic redirect eliminates confusion about where to go next.

**Independent Test**: Log in as a driver with an active shift; verify the app redirects to the active route page without manual navigation.

**Acceptance Scenarios**:

1. **Given** a driver logs in and has an active shift, **When** the route list page loads, **Then** the app redirects to the active route detail page.
2. **Given** a driver refreshes the browser mid-shift, **When** the page reloads, **Then** the app redirects to the active route detail page.
3. **Given** a driver navigates back to the route list while a shift is active, **When** the route list loads, **Then** the app redirects to the active route detail page.
4. **Given** a driver has no active shift, **When** the route list loads, **Then** the driver stays on the route list page normally.

---

### User Story 3 - Header Home Link (Priority: P1)

The app header title ("CAAB Vans") should act as a navigation link back to the driver home page, giving drivers a consistent way to return to the main screen.

**Why this priority**: Standard mobile web convention; zero-effort improvement that eliminates a navigation dead-end.

**Independent Test**: Tap the header title from any driver page; verify navigation to the driver home page.

**Acceptance Scenarios**:

1. **Given** a driver is on any page within the driver area, **When** they tap the "CAAB Vans" header title, **Then** the app navigates to the driver home page.

---

### User Story 4 - Route List Auto-Refresh (Priority: P1)

The route list should automatically refresh periodically so drivers see up-to-date route assignments without manually refreshing the page.

**Why this priority**: Drivers currently see stale data unless they manually refresh. Auto-refresh ensures route changes (new assignments, schedule updates) appear without driver action.

**Independent Test**: Open the route list; wait for the refresh interval; verify the list updates without manual action.

**Acceptance Scenarios**:

1. **Given** a driver is viewing the route list, **When** 30 seconds elapse, **Then** the route list data refreshes automatically.
2. **Given** a route assignment changes while a driver is viewing the list, **When** the next auto-refresh occurs, **Then** the updated data appears without manual refresh.
3. **Given** a driver starts or ends a shift, **When** the action succeeds, **Then** the route list updates immediately (optimistically) without waiting for the next refresh cycle.

---

### User Story 5 - Route Progress Indicator (Priority: P2)

While on an active route, the driver should see a visual indicator showing how many stops have been completed (passed or skipped) out of the total, giving them a sense of progress through the route.

**Why this priority**: Drivers currently have no at-a-glance sense of route completion. A progress indicator provides motivation and situational awareness.

**Independent Test**: View an active route with some stops passed; verify the progress count and bar reflect the correct completion status.

**Acceptance Scenarios**:

1. **Given** a driver is viewing an active route, **When** the page loads, **Then** a progress indicator shows "{completed} de {total} paradas" with a visual progress bar.
2. **Given** stops are passed or skipped during the route, **When** the data refreshes, **Then** the progress indicator updates to reflect the new count.
3. **Given** no stops have been completed yet, **When** the driver views the route, **Then** the progress shows "0 de {total} paradas" with an empty progress bar.

---

### User Story 6 - Shift Duration Timer (Priority: P2)

While on an active route, the driver should see how long they have been on shift, displayed as elapsed time since the shift started.

**Why this priority**: Drivers need awareness of their shift duration for scheduling and personal time management. This is a lightweight but valuable informational element.

**Independent Test**: Start a shift; verify the timer appears and increments correctly.

**Acceptance Scenarios**:

1. **Given** a driver is viewing an active route, **When** the shift has been active for less than 1 hour, **Then** the timer displays "{X} min em turno".
2. **Given** a driver is viewing an active route, **When** the shift has been active for 1 hour or more, **Then** the timer displays "{X}h {Y}min em turno".
3. **Given** the driver navigates away and returns, **When** the active route page loads, **Then** the timer shows the correct elapsed time (not reset).

---

### User Story 7 - Connection Awareness (Priority: P2)

The driver should be notified when their device loses connectivity or when data becomes stale, so they know the information on screen may not be current.

**Why this priority**: Drivers operate in areas with variable connectivity. Without an explicit signal, they may make decisions based on outdated information.

**Independent Test**: Disable network connectivity while viewing an active route; verify a warning banner appears.

**Acceptance Scenarios**:

1. **Given** a driver is viewing an active route and the device loses network connectivity, **When** the offline event fires, **Then** a warning banner appears indicating data may be outdated.
2. **Given** a driver is viewing an active route and data has not refreshed for more than 20 seconds, **When** the staleness threshold is reached, **Then** a warning banner appears.
3. **Given** a warning banner is showing and connectivity is restored, **When** data successfully refreshes, **Then** the banner dismisses automatically.

---

### User Story 8 - Stop Advancement Feedback (Priority: P2)

When the next stop advances (a stop is passed via geofence), the driver should receive tactile and visual feedback so they notice the change even if they are not actively looking at the screen.

**Why this priority**: Stop advancement happens automatically via geofence. Without feedback, drivers may not notice the stop changed, leading to confusion.

**Independent Test**: Trigger a stop advancement while viewing the active route; verify vibration and visual highlight occur.

**Acceptance Scenarios**:

1. **Given** a driver is viewing the active route, **When** the next stop advances (detected via data refresh), **Then** the device vibrates briefly (if supported) and the next stop display highlights momentarily.
2. **Given** the device does not support vibration, **When** a stop advances, **Then** the visual highlight still appears (vibration degrades gracefully).
3. **Given** the stop advanced while the driver was not on the active route page, **When** they navigate back, **Then** no retroactive feedback occurs (feedback is real-time only).

---

### User Story 9 - Shift-End Summary (Priority: P2)

When a driver taps "End Shift", the confirmation dialog should show a summary of the shift (duration, stops passed, stops skipped) so the driver can review before confirming.

**Why this priority**: Gives drivers closure on their shift and a chance to catch issues (e.g., stops that should have been marked as passed) before ending.

**Independent Test**: Tap "End Shift"; verify the confirmation dialog shows duration, passed count, and skipped count.

**Acceptance Scenarios**:

1. **Given** a driver taps "End Shift", **When** the confirmation dialog appears, **Then** it shows the shift duration, number of stops passed during the shift, and number of stops skipped during the shift.
2. **Given** a driver reviews the summary and confirms, **When** they confirm, **Then** the shift ends normally.
3. **Given** a driver reviews the summary and cancels, **When** they cancel, **Then** the shift continues and the dialog closes.

---

### User Story 10 - PIN Login (Priority: P3)

Drivers should be able to log in using a short numeric PIN instead of email/password, making authentication faster and easier on mobile devices. An admin sets or generates the PIN for each driver.

**Why this priority**: Important quality-of-life improvement but lower priority than navigation and in-shift experience fixes. Requires backend changes.

**Independent Test**: Set a PIN for a driver via admin; log in using the PIN pad; verify successful authentication and redirect.

**Acceptance Scenarios**:

1. **Given** a driver has a PIN assigned, **When** they enter the 6th digit on the PIN pad, **Then** the PIN auto-submits and the driver is authenticated and redirected to the driver home page.
2. **Given** a driver enters an incorrect PIN, **When** they submit, **Then** a generic error message is shown without revealing whether the PIN exists.
3. **Given** a driver does not have a PIN, **When** they need to log in, **Then** they can use the email/password fallback login.
4. **Given** an admin wants to set a driver's PIN, **When** they use the PIN management interface, **Then** they can generate a random PIN or enter a specific one, and the PIN is shown once for the driver to note.
5. **Given** an admin tries to assign a PIN that is already in use by another driver, **When** they submit, **Then** the system rejects the assignment with an appropriate message.
6. **Given** multiple failed PIN attempts from the same source, **When** the rate limit threshold is reached (5 failures per minute), **Then** further attempts are temporarily blocked.

---

### Edge Cases

- What happens if a driver has multiple routes with active shifts? The system defaults to the first active route found (this scenario should not occur under normal operation).
- What happens if the cold-start dialog data fails to load? The dialog shows an error state but remains non-dismissible, allowing the driver to retry.
- What happens if the shift timer drifts due to device sleep? The timer recomputes elapsed time from the shift start timestamp on each tick, not by accumulating increments.
- What happens if PIN login is attempted while the driver account is deactivated? The system rejects with a generic error (same as invalid PIN).
- What happens if the browser does not support the vibration API? Stop advancement feedback degrades gracefully to visual-only feedback.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically navigate the driver to the active route page after a successful shift start (both normal and cold-start flows).
- **FR-002**: The cold-start dialog MUST be non-dismissible — the driver must select a starting stop and confirm before proceeding.
- **FR-003**: System MUST redirect drivers with an active shift to the active route page on login, page load, or navigation to the route list.
- **FR-004**: The header title MUST function as a navigation link to the driver home page from any driver-area page.
- **FR-005**: The route list MUST refresh automatically every 30 seconds while the driver is viewing it.
- **FR-006**: The route list MUST update optimistically after shift start/end actions without waiting for the next refresh cycle.
- **FR-007**: The active route page MUST display a progress indicator showing completed stops out of total stops with a visual bar.
- **FR-008**: The active route page MUST display elapsed shift time, updating every second, formatted as relative duration in Portuguese.
- **FR-009**: The active route page MUST display a warning banner when data has not refreshed for more than 20 seconds or when the device is offline.
- **FR-010**: The connection warning banner MUST auto-dismiss when connectivity is restored and data refreshes successfully.
- **FR-011**: The system MUST provide tactile feedback (vibration, if supported) and visual highlight when the next stop advances.
- **FR-012**: The shift-end confirmation dialog MUST display a summary including shift duration, stops passed, and stops skipped during the shift.
- **FR-013**: Drivers MUST be able to authenticate using a fixed 6-digit numeric PIN that auto-submits after the 6th digit is entered.
- **FR-014**: The login screen MUST provide a fallback to email/password authentication.
- **FR-015**: Each PIN MUST be globally unique across all drivers.
- **FR-016**: PIN authentication MUST be rate-limited to a maximum of 5 failed attempts per source per minute.
- **FR-017**: Admins MUST be able to set, generate, or reset a driver's PIN through the admin interface.
- **FR-018**: The actual PIN MUST only be displayed once at creation time and never shown again.
- **FR-019**: PIN authentication failure messages MUST be generic and not reveal whether a PIN exists.

### Key Entities

- **Driver PIN**: A fixed 6-digit numeric credential assigned to a driver by an admin, used for quick mobile authentication. Each PIN is unique across all drivers. The login screen auto-submits after the 6th digit is entered.
- **Shift Summary**: A computed view of a shift's duration, number of stops passed, and number of stops skipped, calculated from existing route run data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After starting a shift, the driver reaches the active route page in zero additional taps (automatic navigation).
- **SC-002**: Drivers returning to the app mid-shift (browser refresh, login) reach the active route page in zero additional taps.
- **SC-003**: Route list data is never more than 30 seconds stale while the driver is actively viewing the list.
- **SC-004**: Drivers can see their route completion progress (stops completed vs. total) at a glance on the active route page.
- **SC-005**: Drivers are informed of connectivity issues within 20 seconds of data becoming stale.
- **SC-006**: Drivers receive immediate feedback (within 1 second) when a stop advances.
- **SC-007**: PIN login allows drivers to authenticate in under 10 seconds (compared to typing email/password).
- **SC-008**: The shift-end dialog provides a complete shift summary before the driver confirms, reducing accidental early shift endings.

## Assumptions

- Drivers use modern mobile browsers that support standard web APIs (vibration API support varies and is handled gracefully).
- The 30-second polling interval for route list refresh balances data freshness with bandwidth usage.
- The 20-second staleness threshold for connectivity warnings is appropriate for the operating environment.
- A fixed 6-digit PIN provides sufficient uniqueness (1,000,000 combinations) for the current driver pool size.
- Rate limiting PIN attempts at 5 per minute per source is sufficient to prevent brute-force attacks while not impacting legitimate users.
- The shift timer computes elapsed time from the stored start timestamp, ensuring accuracy regardless of device sleep or page lifecycle.
