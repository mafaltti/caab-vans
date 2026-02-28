# Feature Specification: Route Detail Header Redesign

**Feature Branch**: `004-route-header-redesign`
**Created**: 2026-02-28
**Status**: Draft
**Input**: Redesign the route detail page header to integrate the back button inline with the route title, replacing the current sticky header bar layout with a streamlined single-row approach.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate Back from Route Details (Priority: P1)

A user viewing a route's detail page sees the back arrow, route name, and status badge together in a single cohesive row at the top of the content area. The back arrow is a clear, icon-only touch target (no text label) placed immediately to the left of the route title. Tapping it navigates the user back to the route list.

**Why this priority**: Navigation is the core interaction on this page. Users must always be able to return to the route list easily and intuitively.

**Independent Test**: Open any route detail page, verify the header row displays correctly with the back arrow, route name, and status badge in a single line. Tap the back arrow and confirm it returns to the route list.

**Acceptance Scenarios**:

1. **Given** a user is on a route detail page, **When** the page loads, **Then** the top of the content area shows a single row containing: a back arrow icon (no text), the route name, and the status badge.
2. **Given** a user is on a route detail page, **When** they tap the back arrow, **Then** they are navigated back to the route list.
3. **Given** a user is on a route detail page, **When** screen readers focus on the back arrow, **Then** an accessible label (e.g., "Voltar") is announced.

---

### User Story 2 - View Header with Long Route Names (Priority: P2)

A user viewing a route with a long name sees the title truncated gracefully without breaking the header layout. The back arrow and status badge remain fully visible and functional regardless of the route name length.

**Why this priority**: Route names vary in length. The layout must remain usable and visually consistent for all name lengths.

**Independent Test**: Open a route with a long name (20+ characters), verify the back arrow and status badge are fully visible, and the route name truncates with an ellipsis if needed.

**Acceptance Scenarios**:

1. **Given** a route has a name longer than the available header width, **When** the page loads, **Then** the route name is truncated with an ellipsis and the back arrow and status badge remain fully visible.
2. **Given** a route has a short name, **When** the page loads, **Then** the full name is displayed without truncation.

---

### Edge Cases

- What happens when the page is in a loading state? The header skeleton should reflect the new inline layout (back area + title placeholder + badge placeholder in one row).
- What happens when the page shows an error? The back button should still be displayed inline without a sticky header, maintaining consistency with the success state.
- What happens when the user scrolls down a long timeline? The back button is no longer sticky, so the user scrolls to the top or uses the browser back gesture to navigate.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The route detail page MUST display the back button, route name, and status badge in a single inline row at the top of the content area.
- **FR-002**: The sticky header bar (with backdrop blur and bottom border) MUST be removed from the route detail page.
- **FR-003**: The back button MUST be icon-only (arrow icon) without a visible text label such as "Voltar".
- **FR-004**: The back button MUST have an accessible label so screen readers announce its purpose (e.g., "Voltar").
- **FR-005**: The back button MUST have a minimum touch target of 44x44 pixels for mobile usability.
- **FR-006**: The back button icon MUST be visually larger than the current size to serve as a clear standalone navigation affordance without accompanying text.
- **FR-007**: The header row MUST display the route name with truncation (ellipsis) when the name exceeds the available width.
- **FR-008**: The status badge MUST be aligned to the right end of the header row.
- **FR-009**: The loading state skeleton MUST reflect the new inline header layout.
- **FR-010**: The error state MUST display the back button in the same inline style, consistent with the success state layout.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of route detail page views display the back button inline with the route title — no sticky header bar is present.
- **SC-002**: The back button touch target meets the 44x44px minimum size on all supported mobile viewports.
- **SC-003**: Screen readers correctly announce the back button's purpose without visible text being present.
- **SC-004**: Route names of any length display without breaking the header layout; truncation applies when needed.
- **SC-005**: Loading and error states are visually consistent with the new inline header pattern.

## Assumptions

- The back arrow icon size of approximately 24px provides sufficient visual clarity as a standalone navigation element without a text label.
- The removal of the sticky header is intentional — the hero card and timeline content are the primary focus, and the back button at the top of the scrollable content is sufficient for navigation.
- Users on mobile can also use the browser's native back gesture or the bottom navigation as alternative ways to leave the route detail page.
- The existing page transition animations remain unchanged; only the header layout within the route detail page is affected.
- The bottom navigation bar remains unaffected by this change.
