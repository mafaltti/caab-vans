# Feature Specification: Sticky Route Detail Header

**Feature Branch**: `005-sticky-route-header`
**Created**: 2026-02-28
**Status**: Ready
**Input**: User description: "Make route detail header sticky with frosted glass backdrop blur for persistent navigation context while scrolling"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Persistent Navigation While Scrolling Timeline (Priority: P1)

A user opens a route detail page to check upcoming stops. The route has many scheduled stops, requiring the user to scroll through the timeline. As the user scrolls down, the route header (back button, route name, and status badge) remains fixed at the top of the viewport, so they always know which route they are viewing and can navigate back without scrolling up.

**Why this priority**: This is the core value of the feature — users lose navigation context when the header scrolls away on routes with long timelines. Keeping the header visible eliminates the need to scroll back up just to go back or confirm which route is being viewed.

**Independent Test**: Can be fully tested by opening any route detail page, scrolling down past the header, and verifying the header remains pinned at the top with a frosted glass visual treatment.

**Acceptance Scenarios**:

1. **Given** the user is on a route detail page, **When** they scroll down past the header, **Then** the header (back button, route name, status badge) remains fixed at the top of the viewport.
2. **Given** the header is in its sticky (scrolled) state, **When** the user taps the back button, **Then** they are navigated back to the routes list.
3. **Given** the header is in its sticky state, **When** the user views it, **Then** it displays a semi-transparent frosted glass background so content scrolling beneath is subtly visible but does not distract from header readability.
4. **Given** the header is in its sticky state, **When** content scrolls beneath it, **Then** a subtle bottom border separates the header from the scrolling content.

---

### User Story 2 - Visual Continuity at Page Load (Priority: P2)

When the user first arrives on the route detail page (before any scrolling), the header appears in its natural inline position. The transition to the sticky state as the user begins scrolling should feel seamless — no visual jump, layout shift, or duplicate elements.

**Why this priority**: A jarring transition between inline and sticky states would degrade the polished feel of the UI. Smooth behavior builds trust.

**Independent Test**: Can be tested by loading a route detail page and slowly scrolling — verifying no layout shift occurs as the header transitions from inline to sticky.

**Acceptance Scenarios**:

1. **Given** the user has just opened the route detail page, **When** the page loads, **Then** the header is positioned at the top of the content area in its natural document flow.
2. **Given** the user begins scrolling, **When** the header reaches the top of the viewport, **Then** it sticks in place without any visible jump or content reflow.

---

### Edge Cases

- What happens when the route name is very long? The header must still truncate the text and remain on a single line without pushing the status badge off-screen.
- What happens on the loading skeleton state? The loading state should also reflect the sticky header structure for layout consistency.
- What happens on the error state? The back button should remain accessible at the top; sticky behavior is not required since there is no scrollable content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The route detail header (back button, route name, status badge) MUST remain fixed at the top of the viewport when the user scrolls down.
- **FR-002**: The sticky header MUST have a semi-transparent frosted glass background effect so that content scrolling beneath is subtly visible but the header text remains readable.
- **FR-003**: The sticky header MUST display a subtle bottom border to visually separate it from the content scrolling beneath.
- **FR-004**: The sticky header MUST appear above all other page content (appropriate stacking order).
- **FR-005**: The header MUST truncate long route names to a single line, preventing the status badge from being pushed off-screen.
- **FR-006**: The loading skeleton state MUST mirror the sticky header layout structure to prevent layout shift when data loads.
- **FR-007**: All interactive elements in the sticky header (back button) MUST remain fully functional regardless of scroll position.

## Assumptions

- The sticky behavior applies only to the route detail page header, not to the global app layout or bottom navigation.
- The frosted glass effect uses standard CSS backdrop-blur; no polyfill is needed for the target mobile browsers (modern iOS Safari and Android Chrome).
- The existing page transition animations (slide-from-right) remain unchanged.
- The header's sticky position is relative to the viewport (or the nearest scroll container), not a custom scroll wrapper.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The route name and back button are visible 100% of the time while the user is on the route detail page, regardless of scroll position.
- **SC-002**: No layout shift occurs when the header transitions from inline to sticky state (Cumulative Layout Shift contribution of 0).
- **SC-003**: The header background allows content scrolling beneath to be subtly visible while maintaining full text readability (contrast ratio of header text against background meets WCAG AA standards).
- **SC-004**: Users can navigate back from any scroll position in a single tap without needing to scroll up first.
