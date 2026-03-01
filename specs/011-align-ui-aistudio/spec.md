# Feature Specification: Align UI with AI Studio Prototype

**Feature Branch**: `011-align-ui-aistudio`
**Created**: 2026-02-28
**Status**: Draft
**Input**: User description: "Align the CAAB Vans UI with the Google AI Studio prototype for 4 specific visual differences: route card badge position, route card chevron position, urgent notice accent bar, and schedule previous-stops button position."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Route Card Layout Matches Prototype (Priority: P1)

A user browsing the routes list sees each route card with the status badge ("Em operacao" / "Fora de operacao") positioned in the top-right corner of the card header row -- separated from the route name -- and the navigation chevron icon positioned inside the next-stop info bar (bottom section) rather than at the top of the card.

**Why this priority**: The route listing is the primary screen users see first. Consistent card layout improves scannability and matches the approved prototype design.

**Independent Test**: Can be tested by loading the routes list page and visually comparing card layout against the AI Studio prototype.

**Acceptance Scenarios**:

1. **Given** a route card on the listing page, **When** the user views it, **Then** the status badge appears in the top-right corner of the card on a separate row from the route name (not inline with the title).
2. **Given** a route card with a next-stop info bar, **When** the user views it, **Then** the chevron icon appears inside the next-stop info bar, right-aligned after the time -- not at the top-right of the card.
3. **Given** a route card without a next-stop info bar (inactive route), **When** the user views it, **Then** no chevron icon is visible (since there is no info bar to contain it).

---

### User Story 2 - Urgent Notice Accent Bar (Priority: P2)

A user viewing the announcements ("Avisos") page sees urgent notices with a prominent rose-colored left accent bar that visually distinguishes them from informational notices at a glance.

**Why this priority**: Urgent notices need immediate visual differentiation. The left accent bar is a strong visual affordance present in the prototype that the current implementation lacks.

**Independent Test**: Can be tested by viewing the Avisos page with at least one urgent and one non-urgent announcement, comparing visual treatment.

**Acceptance Scenarios**:

1. **Given** an urgent announcement card, **When** the user views the Avisos page, **Then** a vertical rose-colored accent bar is visible along the entire left edge of the card.
2. **Given** a non-urgent (informational) announcement card, **When** the user views the Avisos page, **Then** no left accent bar is present.

---

### User Story 3 - Schedule Previous-Stops Toggle (Priority: P3)

A user viewing a route's schedule ("Horarios") can toggle past stops on and off using a button positioned inline with the "Horarios" header, right-aligned -- matching the prototype layout instead of appearing as a standalone button above the timeline.

**Why this priority**: Improves visual hierarchy by keeping the toggle action contextually attached to the section header. Adding a hide action gives users control to collapse past stops after reviewing them.

**Independent Test**: Can be tested by opening a route detail page with past stops and interacting with the toggle button.

**Acceptance Scenarios**:

1. **Given** a route schedule with past stops, **When** the user views it with past stops hidden, **Then** a "Ver N paradas anteriores" button appears right-aligned on the same row as the "Horarios" title.
2. **Given** the user has clicked the button to reveal past stops, **When** past stops are visible, **Then** the button text changes to indicate a hide action (e.g., "Ocultar paradas anteriores") and allows hiding them again.
3. **Given** a route schedule with no past stops, **When** the user views it, **Then** no toggle button appears in the header row.

---

### Edge Cases

- Route card with a very long route name: badge must not overlap or wrap awkwardly in the top-right layout.
- Route card without a next-stop section (inactive/ended): chevron should not appear floating without context.
- Urgent notice card with long content: left accent bar must extend the full height of the card.
- Schedule with only 1 past stop: toggle button text should use singular form ("Ver 1 parada anterior").

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Route card MUST display the status badge in the top-right corner of the card, on a separate row from the route name, using a horizontal layout with the bus icon + route name on the left and badge on the right.
- **FR-002**: Route card MUST display the chevron icon inside the next-stop info bar, right-aligned after the scheduled time.
- **FR-003**: Route card MUST NOT show a chevron icon when there is no next-stop info bar.
- **FR-004**: Urgent announcement cards MUST display a vertical rose-colored accent bar along the full left edge of the card.
- **FR-005**: Non-urgent announcement cards MUST NOT have a left accent bar.
- **FR-006**: The "Ver paradas anteriores" button MUST be positioned inline with the "Horarios" section title, right-aligned.
- **FR-007**: The previous-stops button MUST toggle between showing and hiding past stops (not one-way only).
- **FR-008**: When past stops are visible, the button text MUST change to indicate a hide action (e.g., "Ocultar paradas anteriores").

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 4 UI elements (badge position, chevron position, accent bar, toggle position) visually match the AI Studio prototype when compared side-by-side.
- **SC-002**: The previous-stops toggle works bidirectionally -- users can show and hide past stops without page reload.
- **SC-003**: No visual regressions on existing card, notice, or timeline functionality (responsive layout, animations, touch targets remain intact).
