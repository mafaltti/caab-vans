# Feature Specification: Sticky Page Headers

**Feature Branch**: `009-sticky-page-headers`
**Created**: 2026-02-28
**Status**: Draft
**Input**: User description: "Add sticky headers with backdrop blur to Rotas and Avisos pages, matching the reference design from caab-vans-aistudio"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Page title stays visible while scrolling routes (Priority: P1)

As a user browsing the routes list, I want the "Rotas" page title to remain visible at the top of the screen as I scroll through the route cards, so I always know which section I'm viewing.

**Why this priority**: The routes page is the primary screen users land on. With multiple route cards, the title scrolls out of view and the user loses page context — especially problematic when switching back from a route detail view.

**Independent Test**: Can be tested by loading the routes page with enough cards to require scrolling, then scrolling down and verifying the title remains pinned at the top with a frosted glass effect.

**Acceptance Scenarios**:

1. **Given** the Rotas page is loaded with route cards that exceed the viewport height, **When** the user scrolls down, **Then** the "Rotas" title remains fixed at the top of the content area.
2. **Given** the user has scrolled down on the Rotas page, **When** content passes behind the header, **Then** a semi-transparent background with blur effect is visible, creating a frosted glass appearance.
3. **Given** the user has scrolled down on the Rotas page, **When** the header is visible, **Then** a subtle bottom border separates the header from the content below.

---

### User Story 2 - Page title stays visible while scrolling announcements (Priority: P1)

As a user browsing announcements, I want the "Avisos" page title to remain visible at the top of the screen as I scroll, so I always know which section I'm viewing.

**Why this priority**: Same rationale as the routes page — the announcements list can grow long, and users should retain page context while scrolling. Both pages should behave consistently.

**Independent Test**: Can be tested by loading the announcements page with enough cards to require scrolling, then scrolling down and verifying the title remains pinned.

**Acceptance Scenarios**:

1. **Given** the Avisos page is loaded with announcements that exceed the viewport height, **When** the user scrolls down, **Then** the "Avisos" title remains fixed at the top of the content area.
2. **Given** the user has scrolled down on the Avisos page, **When** content passes behind the header, **Then** a semi-transparent background with blur effect is visible, matching the Rotas page behavior.

---

### Edge Cases

- What happens when the page has very few items (no scroll needed)? The header should render normally without any visual artifacts — it simply stays in place since no scrolling occurs.
- What happens on pages that show loading skeletons or error states? The sticky header must be visible in all page states (loading, error, empty, populated) so the user always sees the page title.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The "Rotas" page MUST display a sticky header containing the page title that remains pinned to the top of the scroll container when the user scrolls.
- **FR-002**: The "Avisos" page MUST display a sticky header containing the page title that remains pinned to the top of the scroll container when the user scrolls.
- **FR-003**: Both sticky headers MUST have a semi-transparent background with a backdrop blur effect (frosted glass appearance) so that content scrolling beneath is softly visible.
- **FR-004**: Both sticky headers MUST display a subtle bottom border to visually separate the header from the scrollable content.
- **FR-005**: The sticky header MUST be visible across all page states: loading, error, empty list, and populated list.
- **FR-006**: The sticky header MUST span the full width of the content area without visible gaps on the sides when content scrolls beneath it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On both Rotas and Avisos pages, the page title remains visible at all scroll positions without the user needing to scroll back up.
- **SC-002**: The sticky header visual treatment (blur, transparency, border) is consistent between the Rotas and Avisos pages.
- **SC-003**: No visual regression on either page when content is shorter than the viewport (no-scroll scenario).

## Assumptions

- The sticky header only applies to the two public listing pages (Rotas and Avisos). The route detail page header is out of scope.
- The header contains only the page title text — no additional controls, filters, or actions are added.
- The frosted glass effect follows the existing project color palette (zinc tones) rather than the reference design's slate tones.
