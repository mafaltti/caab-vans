# Feature Specification: Fix Map Staleness

**Feature Branch**: `060-fix-map-staleness`
**Created**: 2026-03-10
**Status**: Draft
**Input**: User description: "Fix vans appearing stuck on map — reduce tracker ping throttle, relax stale GPS guard, improve staleness UX"
**Reference**: `docs/execution/0101-vans-stuck-on-map-rca.md`

## User Scenarios & Testing

### User Story 1 - Commuters See Van Moving Smoothly on Map (Priority: P1)

A CAAB commuter opens the route page and watches a van's live position on the map. Today, when the van stops at a traffic light or in slow traffic, the blue dot freezes for up to 60 seconds because the tracker suppresses "stationary" pings. After this fix, the van sends a heartbeat at least every 20 seconds even when GPS coordinates haven't changed, so the commuter sees consistent freshness and trusts the system.

**Why this priority**: This is the most common cause of short "stuck" episodes (30–60 seconds) experienced by all users on every route, every day.

**Independent Test**: Can be tested by running the tracker app on a stationary phone and verifying pings arrive every ~20 seconds instead of every 60 seconds.

**Acceptance Scenarios**:

1. **Given** the van is stopped (GPS returns identical coordinates), **When** 20 seconds elapse since the last sent ping, **Then** a heartbeat ping is sent to the server.
2. **Given** the van is moving and GPS coordinates change, **When** minimum distance and time thresholds are met, **Then** pings are sent at the same rate as today (no regression).
3. **Given** the van is stopped and a heartbeat ping is sent, **When** the frontend polls the API, **Then** the `location_updated_at` timestamp reflects the recent heartbeat.

---

### User Story 2 - Van Recovers Position After Android Doze (Priority: P1)

When Android delays a GPS callback (common during doze mode or battery optimization), the tracker currently drops the delayed point as "stale," creating a vicious cycle: the longer the gap, the staler the next point, the more likely it is dropped. After this fix, the tracker sends delayed GPS points during cold gaps instead of silently discarding them, so the van's position recovers as soon as Android delivers any location data.

**Why this priority**: This is the root cause of extended "stuck" periods (2–10+ minutes) and directly compounds with Android battery optimization issues (Root Cause #1 from RCA).

**Independent Test**: Can be tested by simulating a stale GPS fix (timestamp >60 seconds old) after a cold gap and verifying the tracker sends it instead of dropping it.

**Acceptance Scenarios**:

1. **Given** the tracker has not sent a ping for over 2 minutes (cold gap), **When** Android delivers a GPS point that is 90 seconds old, **Then** the tracker sends the point to the server (instead of dropping it as stale).
2. **Given** the tracker is in a cold gap and receives a stale point, **When** the point is sent to the server, **Then** the server updates the van's position with the best-available data.
3. **Given** the tracker is operating normally (no gap), **When** a GPS point older than 60 seconds is received, **Then** the tracker still applies the stale guard and drops it (preserving existing quality filtering for non-gap scenarios).

---

### User Story 3 - Commuters See Staleness Warning Sooner (Priority: P2)

When a van's location data stops updating, commuters currently see a normal-looking blue dot for up to 10 minutes before any "outdated location" warning appears. After this fix, the warning appears within 3 minutes, so commuters know sooner that something is wrong and can plan accordingly.

**Why this priority**: Improves user experience when data is inevitably stale, but doesn't fix the root cause of staleness itself.

**Independent Test**: Can be tested by stopping GPS pings and measuring the time until the "Localização desatualizada" warning appears on the route page.

**Acceptance Scenarios**:

1. **Given** a van's location was last updated 3 minutes ago, **When** the commuter views the route page, **Then** the amber "Localização desatualizada" warning is visible and the van marker is dimmed.
2. **Given** a van's location was last updated 1 minute ago, **When** the commuter views the route page, **Then** no staleness warning is shown and the marker appears normal.
3. **Given** a van's location was stale and then a new ping arrives, **When** the frontend polls the API, **Then** the warning disappears and the marker returns to full opacity.

---

### User Story 4 - Commuters See When Location Was Last Updated (Priority: P2)

Even when the staleness warning hasn't triggered yet, commuters want to see how recent the van's position data is. After this fix, the map UI shows a "last updated" timestamp so users can gauge data freshness at a glance.

**Why this priority**: Complementary UX improvement that builds trust — users understand the dot is delayed, not broken.

**Independent Test**: Can be tested by viewing the route page and verifying a relative timestamp ("Última atualização há X min") appears alongside the van's position.

**Acceptance Scenarios**:

1. **Given** a van has an active location, **When** the commuter views the route page, **Then** a "last updated" timestamp is visible near the van info on the map.
2. **Given** the van's location was updated 30 seconds ago, **When** the commuter reads the timestamp, **Then** it shows a human-readable relative time (e.g., "há menos de 1 min" or "há 30s").
3. **Given** the van's location was updated 5 minutes ago, **When** the commuter reads the timestamp, **Then** it shows the elapsed time (e.g., "há 5 min").

---

### Edge Cases

- What happens when GPS returns coordinates that differ by less than 1 meter (floating-point jitter)? The haversine distance rounds to 0, triggering the stationary heartbeat logic instead of the distance throttle.
- What happens when Android delivers a burst of stale points after exiting doze? Each point is evaluated independently. During a cold gap, points up to 5 minutes old pass the relaxed stale guard; older cached fixes are still dropped to avoid rewinding the marker. The accuracy filter (>50m) remains active to reject low-quality fixes.
- What happens if the van marker has never had a location update (new van just added)? The "last updated" timestamp should not render; the existing "no location" state is preserved.
- What happens when the server clock and device clock are significantly out of sync? The stale guard uses device-side timestamps, so server clock drift does not affect filtering. Device clock drift could cause false stale drops, but this is an existing limitation.

## Requirements

### Functional Requirements

- **FR-001**: The tracker MUST send a heartbeat ping at least every 20 seconds when GPS coordinates have not changed (stationary van).
- **FR-002**: During a cold gap (>2 minutes since last sent ping), the tracker MUST accept delayed GPS points up to 5 minutes old. Older cached fixes may still be dropped as stale to prevent marker rewind. The accuracy filter remains active.
- **FR-003**: The tracker MUST continue to drop GPS points older than 60 seconds during normal operation (no cold gap), preserving existing quality filtering.
- **FR-004**: The web app MUST show the "Localização desatualizada" warning when location data is older than 3 minutes (reduced from 10 minutes).
- **FR-005**: The web app MUST display a human-readable "last updated" relative timestamp for each van's position on the route map view.
- **FR-006**: The "last updated" timestamp MUST update on each frontend poll cycle (every 5 seconds) to reflect the current elapsed time.
- **FR-007**: The "last updated" timestamp MUST NOT be shown when the van has no location data at all.

### Key Entities

- **GPS Ping**: A location data point with latitude, longitude, timestamp, speed, and accuracy. Sent from tracker to server.
- **Van Location State**: The server-side record of a van's most recent position, including `location_updated_at` used to determine staleness.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Stationary vans send at least 3 pings per minute (up from ~1 per minute today).
- **SC-002**: After an Android doze gap of 2+ minutes, the van's map position recovers within one GPS callback delivery (no multi-cycle recovery delay).
- **SC-003**: Users see a staleness warning within 3 minutes of the last location update (down from 10 minutes).
- **SC-004**: Users can determine data freshness at a glance via the "last updated" timestamp on the map view.
- **SC-005**: No regression in ping delivery rate or position accuracy for moving vans.

## Assumptions

- The existing tracker app's GPS collection interval (every 5 seconds) remains unchanged.
- The server API contract (`POST /api/tracking/[vanId]`) does not need schema changes — heartbeat pings carry the same payload as regular pings.
- The "last updated" timestamp uses the existing `lastGpsFixAt` field already returned by the route detail API.
- The staleness threshold change (10 min → 3 min) applies globally to all vans and routes.
- Fix #1 from the RCA (battery optimization whitelist for drivers) is out of scope — it's an operational/training task, not a code change.
- Fix #6 from the RCA (Kong keepalive timeout) is excluded per user request.

## Out of Scope

- Battery optimization whitelist guidance for drivers (operational task, not code).
- Kong/PostgREST timeout configuration changes.
- Changes to the GPS collection interval or accuracy threshold.
- Gradient opacity animation for the van marker (listed as an option in the RCA but not prioritized).
- Changes to the ingestion API schema or server-side processing logic.
