# Feature Specification: Bottom Sheet Tracking UI

**Feature Branch**: `038-bottom-sheet-tracking`
**Created**: 2026-03-04
**Status**: Draft
**Input**: Implement Option B bottom sheet layout for the route detail page — a map-as-background + draggable bottom sheet pattern (Uber/Google Maps style) that replaces the current card layout when a route is actively running with GPS data.

## Clarifications

### Session 2026-03-04

- Q: Is a route polyline (passed + upcoming segments drawn on the map) in scope for this feature? → A: Out of scope. The fullscreen map displays only the existing stop markers and van marker. Route polyline can be added as a follow-up feature.
- Q: What should the peek section show when etaMinutes is null (ETA unavailable)? → A: Hide the ETA chip entirely. The peek section shows only the stop name, scheduled time, and progress bar. No placeholder or dash.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Glanceable ETA While Watching the Map (Priority: P1)

A passenger opens the route detail page for an actively running route. They see a full-screen map showing the van's live position and route stops, with a compact bottom sheet peeking from the bottom. At a glance, they can see the next stop name, scheduled time, and a prominent ETA chip showing minutes until arrival — all without scrolling or tapping.

**Why this priority**: This is the core value proposition of Option B. The current card layout forces users to scroll between map and schedule information. The peek state provides the most critical information (next stop + ETA) while maximizing map visibility for spatial awareness.

**Independent Test**: Can be fully tested by navigating to a running route with GPS coordinates and verifying the peek section displays next stop name, time, ETA chip, and progress bar over a full-screen map.

**Acceptance Scenarios**:

1. **Given** a route is in_progress with valid van GPS coordinates, **When** the user opens the route detail page, **Then** they see a full-screen map with the van marker and a bottom sheet in peek state (~25% height) showing next stop name, scheduled time, ETA chip, and a compact progress bar.
2. **Given** a route is in_progress with valid van GPS coordinates, **When** the user views the peek section, **Then** the ETA chip displays the estimated minutes until the next stop in a prominent, easily readable format.
3. **Given** a route is in_progress, **When** the van position updates, **Then** the map animates the van marker smoothly and the ETA updates without disrupting the bottom sheet state.
4. **Given** a route is in_progress with stale GPS data, **When** the user views the page, **Then** they see a stale data warning overlay on the map (existing behavior) and the van marker appears semi-transparent.
5. **Given** a route is in_progress but ETA is unavailable (etaMinutes is null), **When** the user views the peek section, **Then** the ETA chip is hidden and the peek section shows only the stop name, scheduled time, and progress bar.

---

### User Story 2 - Expanding the Sheet to View Schedule (Priority: P1)

A passenger wants to see upcoming stops beyond just the next one. They drag the bottom sheet upward to the half state, revealing the schedule timeline with current and upcoming stops. They can continue dragging to the full state to see the complete timeline including past stops.

**Why this priority**: The three-snap-point interaction (peek/half/full) is the defining UX pattern of Option B. Without smooth transitions between these states, the feature has no advantage over the current card layout.

**Independent Test**: Can be tested by dragging the sheet handle upward from peek state and verifying it snaps to half (showing upcoming timeline) and full (showing complete timeline with past stops toggle).

**Acceptance Scenarios**:

1. **Given** the sheet is in peek state, **When** the user drags the grab handle upward past the midpoint, **Then** the sheet snaps to half state (~55% height) showing the "Horarios" section with upcoming stops timeline.
2. **Given** the sheet is in half state, **When** the user drags upward further, **Then** the sheet snaps to full state (~92% height) showing the complete schedule timeline with a "Ver N paradas anteriores" toggle for past stops.
3. **Given** the sheet is in full state, **When** the user drags the handle downward, **Then** the sheet collapses back through half to peek state with smooth spring-physics animation.
4. **Given** the sheet is at full state, **When** the user scrolls within the sheet content, **Then** the content scrolls normally without collapsing the sheet, until they reach the top of the scroll and drag down.

---

### User Story 3 - Map Interaction with Sheet Awareness (Priority: P2)

A passenger wants to pan and zoom the map to explore the route while the bottom sheet is visible. The map remains interactive in the area above the sheet, and floating controls (re-center button) stay positioned above the sheet boundary.

**Why this priority**: Map interactivity is important but secondary to the core sheet + ETA experience. Users already have a working map in Option A; this story ensures the fullscreen map remains usable alongside the sheet.

**Independent Test**: Can be tested by panning the map while the sheet is at peek, verifying the re-center button appears, and confirming map gestures work in the visible map area above the sheet.

**Acceptance Scenarios**:

1. **Given** the sheet is at peek state, **When** the user pans or zooms the map in the area above the sheet, **Then** the map responds normally to touch gestures.
2. **Given** the user has panned the map away from the van, **When** they tap the re-center floating button, **Then** the map smoothly re-centers on the van position.
3. **Given** the sheet state changes (peek to half, or half to full), **When** the map visible area shrinks, **Then** the map adjusts its viewport padding so the van marker and next stop remain visible in the non-overlapped area.
4. **Given** the sheet is at any state, **When** the floating re-center button is displayed, **Then** it is positioned above the sheet's top edge with appropriate spacing.

---

### User Story 4 - Non-Running Route Fallback (Priority: P2)

A passenger opens the route detail page for a route that is not actively running (waiting, completed, or outside operating hours). Instead of the bottom sheet layout, they see the current card-based layout (Option A) with the hero card and schedule timeline as cards.

**Why this priority**: Not all route states benefit from a map-centric view. Waiting and completed routes have no live van position to track, so the bottom sheet adds no value. Preserving the existing layout for these states avoids regression and unnecessary complexity.

**Independent Test**: Can be tested by navigating to a route in "waiting" or "completed" state and verifying it shows the existing card layout without a bottom sheet or fullscreen map.

**Acceptance Scenarios**:

1. **Given** a route has runStatus "waiting" (no shift started), **When** the user opens the route detail page, **Then** they see the existing card layout with HeroCard and ScheduleTimeline (no bottom sheet, no fullscreen map).
2. **Given** a route has runStatus "completed", **When** the user opens the route detail page, **Then** they see the existing card layout showing the completed state.
3. **Given** a route is in_progress but has no GPS coordinates (lastLat/lastLng are null), **When** the user opens the route detail page, **Then** they see the existing card layout (Option A), not the bottom sheet layout.

---

### User Story 5 - Mobile Browser Compatibility (Priority: P3)

A passenger uses the app on various mobile browsers (iOS Safari, Android Chrome). The bottom sheet works correctly with proper safe area insets, no viewport bounce issues during drag, and no toolbar flickering.

**Why this priority**: Mobile browser quirks (especially iOS Safari) can break the sheet gesture experience. This is a polish concern but critical for production quality.

**Independent Test**: Can be tested on iOS Safari and Android Chrome by dragging the sheet, scrolling content, and verifying no rubber-banding, no toolbar flickering, and proper safe area padding.

**Acceptance Scenarios**:

1. **Given** the user is on iOS Safari with a device notch, **When** they view the bottom sheet, **Then** the sheet content respects the bottom safe area inset and the header respects the top safe area inset.
2. **Given** the user is on iOS Safari, **When** they drag the sheet up and down, **Then** there is no page-level rubber-banding or viewport bounce.
3. **Given** the user is on any mobile browser, **When** the sheet transitions between states, **Then** the browser toolbar does not flicker or shift.

---

### Edge Cases

- What happens when the route transitions from waiting to in_progress while the user is viewing the page? The layout should transition from card (Option A) to bottom sheet (Option B) when live GPS data becomes available on the next poll cycle.
- What happens when GPS coordinates become null during an in_progress route (van goes offline)? The layout should remain in bottom sheet mode with the stale data overlay, not switch back to card layout mid-session.
- What happens when the user navigates back from the route detail page? The back button in the header should work regardless of sheet state.
- What happens on very small screens (320px width)? The peek section should still be legible with truncated stop names via text ellipsis.
- What happens when the sheet is at full state and there are only 2 stops total? The sheet should still function correctly with minimal content, snapping normally.
- What happens when the user rotates their device? The sheet snap points (percentage-based) should adapt to the new viewport dimensions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a full-screen map as the background when a route is in_progress with valid GPS coordinates (lastLat and lastLng are not null). The map displays stop markers and the van marker only (no route polyline — out of scope).
- **FR-002**: System MUST display a persistent, non-dismissible bottom sheet over the map with three snap points: peek (~25% viewport height), half (~55%), and full (~92%).
- **FR-003**: The bottom sheet's peek section MUST show the next stop name, scheduled time, and a compact progress bar indicating route completion. The ETA chip (minutes) MUST be shown when available, and hidden entirely when ETA is unavailable (no placeholder).
- **FR-004**: The bottom sheet's half section MUST show the schedule timeline with current and upcoming stops.
- **FR-005**: The bottom sheet's full section MUST show the complete schedule timeline with a toggle to show/hide past stops.
- **FR-006**: The sheet MUST support drag gestures on the grab handle to transition between snap points with spring-physics animation.
- **FR-007**: Sheet content MUST be scrollable when at full snap point; dragging down from the scroll top position MUST collapse the sheet.
- **FR-008**: The map MUST remain interactive (pan, pinch-zoom) in the area above the sheet.
- **FR-009**: A floating re-center button MUST appear above the sheet when the user manually pans the map, and MUST reposition dynamically when the sheet state changes.
- **FR-010**: The map viewport padding MUST adjust dynamically based on the active sheet snap point so the van marker and next stop remain visible.
- **FR-011**: The route detail page MUST fall back to the existing card layout (Option A) when the route is not in_progress or has no GPS coordinates.
- **FR-012**: The fixed header (glassmorphism style with route name, back button, and status badge) MUST remain visible above the map and sheet at all times.
- **FR-013**: The bottom navigation bar MUST NOT be shown on the route detail page when the bottom sheet layout is active.
- **FR-014**: The progress bar MUST show one segment per stop, with filled segments for passed stops, a partially filled segment for the current stop, and empty segments for future stops.
- **FR-015**: The ETA chip and progress bar MUST update in real-time as new data arrives from polling.
- **FR-016**: The sheet and map MUST be loaded dynamically (client-side only) since they depend on browser APIs.

### Key Entities

- **Sheet State**: The current snap point of the bottom sheet (peek, half, or full) — controls which content sections are visible and how the map viewport is padded.
- **Route Progress**: Existing entity containing passed stop IDs, next stop ID, ETA, run status, and delay information — drives the peek section content and progress bar.
- **Map Viewport Padding**: Dynamic padding values (top, bottom, left, right) calculated from the header height and active sheet snap point to keep markers in the visible map area.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users viewing an actively running route can see the next stop name and ETA within 1 second of page load without any interaction (peek state is the default).
- **SC-002**: The bottom sheet transitions between snap points smoothly in under 400ms with spring-physics easing.
- **SC-003**: All three sheet states (peek, half, full) are reachable via drag gesture from any other state.
- **SC-004**: The map remains usable (pan and zoom) with at least 40% of the viewport visible when the sheet is at half state.
- **SC-005**: The existing card layout continues to work identically for non-running routes (zero regression).
- **SC-006**: The page works correctly on iOS Safari 15+ and Android Chrome without gesture conflicts, rubber-banding, or toolbar flickering.
- **SC-007**: The bottom sheet adds no more than 10 KB (gzipped) to the page bundle.

## Assumptions

- The existing 5-second polling interval (TanStack Query refetch) is sufficient for ETA updates; no change to data fetching is needed.
- The existing VanTrackingMap component can be modified to support a fullscreen variant without breaking the existing card usage (if card mode is still needed elsewhere).
- The ScheduleTimeline component can be reused inside the sheet with a `variant` prop: `"card"` (default, existing rounded/shadow/padding wrapper) or `"inline"` (no card wrapper, sticky "Horários" header that stays pinned while timeline items scroll).
- The design follows the mockup at `docs/mockups/option-b-bottom-sheet.html` for visual reference.
- The project uses zinc-* color tokens (not slate-*) per the shadcn base-color configuration.
