# Feature Specification: Embedded Live Map

**Feature Branch**: `032-embedded-live-map`
**Created**: 2026-03-03
**Status**: Draft
**Input**: Replace the deprecated Google Maps `location_url` link ("Abrir localização ao vivo") with an embedded live tracking map on the route detail page showing real-time van position and route stops.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Van Position on Map (Priority: P1)

As a passenger viewing an active route, I want to see the van's current position on an embedded map so I can visually confirm where the van is relative to my stop without leaving the app.

**Why this priority**: This is the core replacement for the deprecated Google Maps link. Without the map showing the van, the feature has no value.

**Independent Test**: Can be fully tested by opening a route detail page while a van is actively tracked and verifying the van marker appears at the correct position on the map.

**Acceptance Scenarios**:

1. **Given** a route with `isRunning === true` and the van has valid coordinates, **When** I open the route detail page, **Then** I see an embedded map card below the HeroCard showing the van's current position as a distinct marker.
2. **Given** a route that is not running or the van has no coordinates, **When** I open the route detail page, **Then** no map card is displayed (the page layout remains as it is today).
3. **Given** the map is visible, **When** the van position updates (every 15 seconds via existing polling), **Then** the van marker moves smoothly to the new position without the map resetting or jumping.

---

### User Story 2 - See Stop Markers on Map (Priority: P2)

As a passenger, I want to see all route stops displayed on the map so I can understand where the van is relative to my stop and upcoming stops along the route.

**Why this priority**: Stop markers provide spatial context. Without them, the van marker alone is less meaningful — passengers need reference points to judge proximity and progress.

**Independent Test**: Can be tested by verifying that stop markers appear on the map with visual differentiation based on their status (passed, next, future).

**Acceptance Scenarios**:

1. **Given** the map is displayed for an active route, **When** the map loads, **Then** all stops with valid coordinates are shown as markers on the map.
2. **Given** stops have different statuses (passed, next, future), **When** viewing the map, **Then** the next stop is visually highlighted, passed stops appear dimmed, and future stops appear in a neutral style.
3. **Given** the map is loaded, **When** the viewport auto-fits on load, **Then** the van marker and at least the next 2-3 stops are visible without manual zooming.

---

### User Story 3 - Navigate and Re-center Map (Priority: P3)

As a passenger, I want to pan and zoom the map freely and easily return to the van's position so I can explore the route area and quickly re-focus when needed.

**Why this priority**: Standard map interaction expectations. Users will instinctively try to pan/zoom; blocking these gestures creates frustration. The re-center button ensures they can always get back to the van.

**Independent Test**: Can be tested by panning the map away from the van, verifying a re-center button appears, and tapping it to return to the auto-following view.

**Acceptance Scenarios**:

1. **Given** the map is displayed, **When** I pinch-to-zoom or drag to pan, **Then** the map responds naturally to touch gestures.
2. **Given** I have panned the map away from the van, **When** the map is no longer centered on the van, **Then** a re-center button appears on the map.
3. **Given** the re-center button is visible, **When** I tap it, **Then** the map smoothly pans back to center on the van's current position and resumes auto-following.

---

### User Story 4 - Stale Location Warning (Priority: P3)

As a passenger, I want to know when the van's location data is outdated so I don't rely on stale position information.

**Why this priority**: Important for trust and accuracy, but secondary to displaying the map itself. The system already tracks location freshness.

**Independent Test**: Can be tested by simulating an outdated van position and verifying the visual warning appears.

**Acceptance Scenarios**:

1. **Given** the van's location is flagged as outdated (`isLocationOutdated === true`), **When** viewing the map, **Then** the van marker appears dimmed/faded and a warning indicator is shown (e.g., "Localização desatualizada").
2. **Given** the van's location becomes fresh again after a new ping, **When** the next polling update arrives, **Then** the warning disappears and the van marker returns to its normal appearance.

---

### Edge Cases

- What happens when only some stops have coordinates? Stops without `stop_lat`/`stop_lng` are excluded from the map but still shown in the ScheduleTimeline below.
- What happens when the van position is received but no stops have coordinates? The map shows only the van marker centered on the van's position.
- What happens on a slow network connection? A skeleton/loading placeholder is shown while the map library loads. The existing HeroCard and ScheduleTimeline (text-based) load first and are not blocked by the map.
- What happens if the map library fails to load? The map card is hidden gracefully; the page degrades to the current layout without a map.
- What happens when the route transitions from running to not-running while the user is on the page? The map card is removed from the layout on the next polling update.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display an embedded map card (~250px fixed height) on the route detail page when the route is actively running and the van has valid coordinates.
- **FR-002**: System MUST show the van's current position as a visually distinct, pulsing marker on the map.
- **FR-003**: System MUST update the van marker position every time the existing polling mechanism delivers new coordinates (15-second interval), with smooth animated movement.
- **FR-004**: System MUST display route stops as markers on the map, with visual differentiation: next stop highlighted, passed stops dimmed, future stops neutral.
- **FR-005**: System MUST auto-fit the map viewport on initial load to show the van and upcoming stops.
- **FR-006**: System MUST allow standard touch gestures (pinch-to-zoom, drag to pan) for map interaction.
- **FR-007**: System MUST show a re-center button when the user pans away from the van, and return to auto-following when tapped.
- **FR-008**: System MUST visually indicate stale location data (dimmed marker + warning text) when `isLocationOutdated` is true.
- **FR-009**: System MUST NOT display the map card when the route is not running or the van lacks coordinates.
- **FR-014**: System MUST remove the legacy "Abrir localização ao vivo" button from the HeroCard. The embedded map replaces this functionality entirely.
- **FR-010**: System MUST show a loading skeleton while the map initializes, matching the existing design system.
- **FR-011**: System MUST include stop coordinates (`stop_lat`, `stop_lng`) in the route detail data response so the map can render stop markers.
- **FR-012**: System MUST degrade gracefully if the map fails to load — the page layout remains functional without the map.
- **FR-013**: System MUST show a fallback text overlay ("Mapa indisponível") when the map loads but tile images fail to render (e.g., tile provider down or poor connectivity).

### Key Entities

- **Van Position**: The van's real-time geographic coordinates (`lastLat`, `lastLng`), freshness timestamp (`locationUpdatedAt`), and staleness flag (`isLocationOutdated`). Updated by the GPS tracking system.
- **Stop Marker**: A route stop's geographic coordinates (`stopLat`, `stopLng`), name, scheduled time, and progress status (passed, next, future). Derived from schedule entries and route run progress.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can see the van's live position on the map within 3 seconds of opening an active route's detail page (including map load time).
- **SC-002**: The van marker updates position visibly within 1 second of receiving new coordinates from the polling mechanism.
- **SC-003**: The map card renders correctly on mobile screens (320px to 430px width) without horizontal overflow or layout breakage.
- **SC-004**: The page remains fully functional (HeroCard, ScheduleTimeline) even when the map fails to load or is loading.
- **SC-005**: Users can identify the van's position relative to route stops at a glance — next stop is clearly distinguishable from passed and future stops.

## Assumptions

- The existing 15-second TanStack Query polling interval is sufficient for map updates; no additional real-time mechanism (WebSockets) is needed for Phase 1.
- Free map tile providers (e.g., OpenStreetMap-based) provide adequate coverage and detail for the Salvador/Bahia region where routes operate.
- The van marker does not need to show bearing/direction of travel in Phase 1 (deferred enhancement).
- Route polylines connecting stops are deferred to a later phase; Phase 1 shows only discrete markers.
- The "Abrir localização ao vivo" button in the HeroCard will be removed immediately as part of this feature — the embedded map fully replaces it.

## Clarifications

### Session 2026-03-03

- Q: What should the map card height be on mobile? → A: Fixed ~250px — balanced, shows van + nearby stops clearly without pushing schedule off-screen.
- Q: What happens when the map loads but tile images fail? → A: Show fallback text overlay ("Mapa indisponível") over the blank map area.
- Q: Should the "Abrir localização ao vivo" button be removed or kept alongside the map? → A: Remove immediately — the embedded map fully replaces it.

## Out of Scope (Deferred)

- Route polyline path drawn between stops.
- Bottom-sheet layout (map-as-background with draggable sheet overlay).
- Van marker bearing/rotation based on direction of travel.
- Tap-to-expand map to full screen.
- Geofence radius visualization around stops.
