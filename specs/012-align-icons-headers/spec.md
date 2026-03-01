# Feature Specification: Align Stop Icons & Fixed Headers with AI Studio

**Feature Branch**: `012-align-icons-headers`
**Created**: 2026-03-01
**Status**: Draft
**Input**: User description: "Align stop icons and header scroll behavior with AI Studio prototype"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visually Distinct Stop States in Timeline (Priority: P1)

A passenger viewing a route's schedule timeline can immediately distinguish between stops already passed, the current/next stop, and upcoming stops by their icon shape — without reading labels or relying on color alone.

**Why this priority**: The timeline is the core navigation element. Correct visual differentiation prevents confusion about which stop the van is at and where it's heading.

**Independent Test**: Can be fully tested by opening any active route's detail page and verifying each stop icon matches its expected shape for past/current/future states.

**Acceptance Scenarios**:

1. **Given** a route is in operation with a known next stop, **When** the user views the schedule timeline, **Then** past stops show a filled checkmark icon, the current stop shows a concentric circle (outer ring + solid inner circle), and future stops show an empty (hollow) circle with no inner content.
2. **Given** a route is out of operation (not running), **When** the user views the schedule timeline, **Then** all stops display as empty (hollow) circles, matching the future stop appearance.
3. **Given** a route has completed its schedule (all stops passed), **When** the user views the timeline, **Then** all stops show the past (checkmark) icon.

---

### User Story 2 - Fixed Page Headers That Never Move (Priority: P1)

A passenger scrolling through content on any page sees the page title/header always pinned at the top of the screen — it never scrolls away or shifts position. Content flows underneath the header from the very first scroll pixel.

**Why this priority**: Consistent fixed positioning matches the AI Studio prototype and gives the app a polished, native-app feel. The current sticky behavior causes a visible "jump" when the header transitions from scrolling to fixed, which feels unfinished.

**Independent Test**: Can be fully tested by scrolling on each public page (Rotas, Avisos, Route Detail) and confirming the header remains motionless while content scrolls beneath it.

**Acceptance Scenarios**:

1. **Given** the user is on the Routes list page, **When** they scroll down, **Then** the "Rotas" title stays fixed at the top and content scrolls underneath from the very beginning — no initial scroll-with-content behavior.
2. **Given** the user is on the Announcements page, **When** they scroll down, **Then** the "Avisos" title stays fixed at the top with the same behavior.
3. **Given** the user is on a Route Detail page, **When** they scroll down, **Then** the route name header (with back button and status badge) stays fixed at the top.
4. **Given** any page with a fixed header, **When** the page loads, **Then** no content is hidden behind the header — there is appropriate spacing so the first content item is fully visible below the header.

---

### Edge Cases

- What happens when a route has only one stop? The single stop should display the correct icon for its state (current if running, neutral/empty if not).
- What happens on pages with content shorter than the viewport? The header remains at its fixed position; no visual artifacts or extra spacing issues appear.
- What happens when loading skeletons display? Loading state headers must also be fixed (not sticky), maintaining visual consistency during data fetching.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The timeline current/next stop icon MUST display as a concentric circle — an outer circular border with a solid filled inner circle, using the active accent color (blue).
- **FR-002**: The timeline future stop icon MUST display as an empty (hollow) circle — only the circular border, with no inner dot or fill.
- **FR-003**: The timeline neutral stop icon (for inactive/non-running routes) MUST display as an empty (hollow) circle, visually identical to the future stop icon.
- **FR-004**: The timeline past stop icon MUST remain unchanged — a checkmark inside a circle.
- **FR-005**: Page headers on all public pages (Routes list, Announcements, Route Detail) MUST be fixed at the top of the viewport and never move during scrolling.
- **FR-006**: Content below fixed headers MUST have sufficient top spacing/padding so that the first content item is not obscured by the header.
- **FR-007**: Fixed headers MUST maintain the existing frosted glass visual effect (semi-transparent background with backdrop blur).
- **FR-008**: Loading/skeleton states MUST also use fixed (not sticky) headers for visual consistency.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of stop icons match their expected visual state — past (checkmark), current (concentric circles), future (empty circle), neutral (empty circle) — across all route conditions.
- **SC-002**: Page headers remain visually motionless during scrolling on all three public pages, with zero visible position shift from the first scroll event.
- **SC-003**: No content is clipped or hidden behind fixed headers on any page, in both loaded and loading states.
- **SC-004**: Visual appearance of stop icons and header positioning matches the AI Studio prototype reference.
