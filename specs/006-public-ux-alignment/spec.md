# Feature Specification: Public UX Alignment

**Feature Branch**: `006-public-ux-alignment`
**Created**: 2026-02-28
**Status**: Draft
**Input**: Align the public-facing UX to match the reference design built in the Google AI Studio project. Visual and component-level changes only — no new functionality.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Polished Route List View (Priority: P1)

A user opens the app and sees the route list. Each route card displays the route name, status, progress, and next stop information using consistent design components and proper visual hierarchy. The page title is large and bold, route names are prominent, and the next stop area highlights on hover to invite interaction.

**Why this priority**: The route list is the first screen users see. Consistent component usage and typography hierarchy here sets the visual tone for the entire app.

**Independent Test**: Can be tested by opening the home page and verifying that route cards use the standard card component, typography matches the reference scale, the active indicator uses icon color (not a left border bar), and the next stop area shows a hover highlight effect.

**Acceptance Scenarios**:

1. **Given** the home page is loaded with routes, **When** the user views the route list, **Then** the page title uses `text-2xl font-bold` sizing, and each route card uses the standard card component with rounded corners and shadow.
2. **Given** a route is active (running), **When** the user views the route card, **Then** the bus icon area shows a blue background tint (not a left emerald border bar).
3. **Given** the user hovers over a route card's next stop area, **When** the hover state activates, **Then** the next stop background transitions to a subtle blue tint.
4. **Given** the next stop time is displayed, **When** the user views it, **Then** the time appears in a darker, medium-weight font (not muted/gray with a clock icon).

---

### User Story 2 - Refined Route Detail View (Priority: P1)

A user taps a route card and navigates to the detail view. The sticky header uses the standard ghost button for the back action. The hero card's location button is a prominent full-width white button. The schedule timeline uses properly sized nodes with borders and shadows to clearly distinguish past, current, and future stops.

**Why this priority**: The route detail is the primary content view — users spend most of their time here. The hero card CTA and timeline are core interaction elements.

**Independent Test**: Can be tested by navigating to any route detail page and verifying the back button component, hero card button style, and timeline node styling all match the reference.

**Acceptance Scenarios**:

1. **Given** the route detail page is loaded, **When** the user views the sticky header, **Then** the back button uses the standard ghost icon button component with a round shape.
2. **Given** the route is running with a location URL, **When** the user views the hero card, **Then** the location button is full-width, white solid background with blue text, large padding, and a shadow.
3. **Given** the hero card shows a navigation icon, **When** the page loads, **Then** the icon has a bounce animation.
4. **Given** the hero card has a timestamp, **When** the user views it, **Then** the timestamp is centered below the location button with reduced opacity.
5. **Given** the schedule timeline is displayed, **When** the user views the current stop node, **Then** the node has a size-6 circle with a blue border, inner pulsing dot (size-2), and a subtle blue shadow.
6. **Given** the timeline shows future stops, **When** the user views them, **Then** each future node is size-6 with a white background and light border, and text darkens on hover.
7. **Given** the timeline shows past stops, **When** the user views them, **Then** each past node has a light background with a white border.
8. **Given** the timeline section title "Horarios", **When** displayed, **Then** it uses `text-lg font-bold` in dark color (not small muted text).
9. **Given** past stops are hidden, **When** the "Ver paradas anteriores" button is shown, **Then** it uses the standard small button component with blue background tint.
10. **Given** the timeline rows, **When** displayed, **Then** a subtle bottom border separates each row, and the vertical connector line uses a lighter shade.

---

### User Story 3 - Consistent Announcements View (Priority: P2)

A user navigates to the announcements page and sees announcement cards. Each card uses the standard card component and badge components for type labels. Urgent announcements have a colored border and shadow to stand out.

**Why this priority**: Announcements are a secondary screen but still need visual consistency with the rest of the app.

**Independent Test**: Can be tested by navigating to the avisos page and verifying card components, badge components, typography scale, and urgent card styling.

**Acceptance Scenarios**:

1. **Given** the announcements page is loaded, **When** the user views it, **Then** the page title uses `text-2xl font-bold` sizing.
2. **Given** an announcement card is displayed, **When** the user views it, **Then** the card uses the standard card component.
3. **Given** an announcement is urgent, **When** displayed, **Then** the card has a rose-colored border and a subtle rose shadow, and the type badge uses the standard badge component with a subtle rounded shape (not pill/full-round).
4. **Given** an announcement is informational, **When** displayed, **Then** the type badge uses the standard badge component with a subtle rounded shape.
5. **Given** announcement card text, **When** displayed, **Then** the title uses `text-lg font-bold`, the body text has relaxed line spacing, and the date has medium font weight.

---

### User Story 4 - Updated Bottom Navigation (Priority: P2)

The bottom navigation bar uses the correct icon for announcements, proper icon sizing, and accommodates safe areas on mobile devices.

**Why this priority**: The bottom nav is persistent across all screens and needs to match the reference for overall polish.

**Independent Test**: Can be tested by viewing the bottom nav on any public page and verifying icon choice, sizing, container shape, and layout.

**Acceptance Scenarios**:

1. **Given** the bottom navigation is visible, **When** the user views the Avisos tab, **Then** the icon is a bell (not a megaphone).
2. **Given** the bottom navigation icons, **When** displayed, **Then** icons use 24px sizing (not 20px) and icon containers use rounded-xl shape.
3. **Given** the bottom navigation layout, **When** viewed on a device with a home indicator (safe area), **Then** the nav respects safe area padding at the bottom.
4. **Given** nav items, **When** displayed, **Then** each item uses a fixed width (not flex-stretch) and items are centered with space distributed around them.

---

### User Story 5 - Status Badge Typography (Priority: P3)

The route status badge ("Em operacao" / "Fora de operacao") uses updated typography to match the reference.

**Why this priority**: Minor typography refinement that completes the visual consistency.

**Independent Test**: Can be tested by viewing any route card or detail header and checking badge font weight and letter spacing.

**Acceptance Scenarios**:

1. **Given** any status badge, **When** displayed, **Then** the text uses semibold weight and wide letter spacing (not medium weight with default spacing).

---

### Edge Cases

- What happens when the route name is very long and truncates in the sticky header? The back button and status badge must remain visible.
- What happens on devices without safe area support? The `pb-safe` padding should degrade gracefully to zero.
- What happens when reduced motion is preferred? Bounce animation on the navigation icon should be suppressed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Route cards MUST use the standard card and card-content component wrappers instead of plain div elements.
- **FR-002**: The active route indicator MUST use an icon background color change (blue-tinted icon area) and MUST NOT use a left border bar.
- **FR-003**: The next stop area in route cards MUST show a hover color transition to a subtle blue tint.
- **FR-004**: The next stop time in route cards MUST display in dark, medium-weight font without a clock icon prefix.
- **FR-005**: The route detail back button MUST use the standard ghost icon button component with round shape.
- **FR-006**: The hero card location button MUST be full-width, white background, blue text, large vertical padding, rounded corners, and a subtle shadow.
- **FR-007**: The hero card navigation icon MUST include a bounce animation.
- **FR-008**: The hero card timestamp MUST be centered below the location button with reduced opacity.
- **FR-009**: Timeline current-stop nodes MUST show a size-6 circle with blue border, inner size-2 pulsing dot, and subtle blue shadow.
- **FR-010**: Timeline future-stop nodes MUST show a size-6 circle with white background, light border, and a hover effect that tints the border blue.
- **FR-011**: Timeline past-stop nodes MUST show a size-6 circle with light background and white border.
- **FR-012**: The timeline section title MUST use `text-lg font-bold` in dark color.
- **FR-013**: The "Ver paradas anteriores" toggle MUST use the standard small button component with a blue background tint.
- **FR-014**: Timeline rows MUST be separated by subtle bottom borders, and the vertical connector line MUST use a lighter shade.
- **FR-015**: Timeline future stop text MUST darken on hover with a color transition.
- **FR-016**: Announcement cards MUST use the standard card and card-content component wrappers.
- **FR-017**: Announcement type badges MUST use the standard badge component with subtle rounded corners (not pill shape).
- **FR-018**: Urgent announcement cards MUST show a rose-colored border and subtle rose shadow.
- **FR-019**: Announcement body text MUST use relaxed line spacing; date text MUST use medium font weight.
- **FR-020**: Page titles ("Rotas", "Avisos") MUST use `text-2xl font-bold` sizing.
- **FR-021**: Route card names MUST use `text-lg` sizing.
- **FR-022**: Announcement titles MUST use `text-lg font-bold` sizing.
- **FR-023**: Status badges MUST use semibold weight and wide letter spacing.
- **FR-024**: The bottom navigation Avisos icon MUST be a bell icon.
- **FR-025**: Bottom navigation icons MUST use 24px sizing and icon containers MUST use rounded-xl shape.
- **FR-026**: The bottom navigation MUST include safe-area bottom padding.
- **FR-027**: Bottom navigation items MUST use fixed width (not flex-stretch) centered within the bar.
- **FR-028**: All color references MUST use the zinc palette (not slate), consistent with the project constitution's Zinc base decision.

### Assumptions

- The standard card, badge, and button components already exist in the codebase (shadcn/ui) and are available for use.
- No data model, API, routing, or state management changes are needed.
- Admin-facing components and pages are out of scope.
- The bounce animation on the navigation icon should respect `prefers-reduced-motion`.
- Safe-area padding (`pb-safe`) is supported via standard CSS `env(safe-area-inset-bottom)` or equivalent Tailwind utility.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of public-facing components (route card, hero card, schedule timeline, announcement card, status badge, bottom nav) visually match the reference design when compared side-by-side.
- **SC-002**: All interactive elements (buttons, cards, timeline nodes) use the project's standard component library instead of plain HTML elements.
- **SC-003**: Typography scale across all public pages matches the reference (titles at 2xl, card names at lg, section headings at lg bold).
- **SC-004**: All hover and animation effects described in the reference (card hover, timeline hover, bounce icon, node pulse) are present and functional.
- **SC-005**: The app renders correctly on mobile devices with safe-area insets (no content hidden behind home indicators).
- **SC-006**: Zero visual regressions in existing functionality — all pages remain fully functional after changes.
