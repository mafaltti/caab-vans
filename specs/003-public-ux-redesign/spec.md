# Feature Specification: Public Screens UX Redesign

**Feature Branch**: `003-public-ux-redesign`
**Created**: 2026-02-28
**Status**: Draft
**Input**: User description: "Redesign the public screens following the AI Studio prototype UX"

## Clarifications

### Session 2026-02-28

- Q: Should tab switching change the URL (preserving deep linking and browser history) or use client-side state only? → A: Tabs change URL via client-side routing (e.g., `/` and `/avisos`), providing smooth in-place switching while preserving deep linking and browser back/forward behavior.
- Q: What triggers the notification dot on the Avisos tab? → A: The dot appears only when any non-expired urgent announcement exists. No time-based "recent" logic — urgency alone drives the indicator.
- Q: Should loading/error/empty states be redesigned to match the new visual language? → A: Loading skeletons must match the new component shapes (route cards, hero card, timeline). Error and empty states keep the existing patterns (alert with retry button).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Routes with Enhanced Cards (Priority: P1)

A passenger opens the app and sees a list of van routes displayed as visually rich cards. Each card shows the route name, an icon indicating the route type, the current operational status (with a pulsing indicator for active routes), a progress summary (e.g., "Parada 8 de 24"), and an inner section displaying the next stop name and time with map and clock icons. Tapping a card navigates to the route detail screen with a smooth transition animation. The cards provide tactile feedback when tapped (scale effect).

**Why this priority**: The routes list is the primary landing screen and the first impression of the app. Improving card design directly impacts how quickly users find and understand route information.

**Independent Test**: Can be fully tested by opening the app and verifying that route cards display all required information with correct visual styling, status indicators, and tap interactions.

**Acceptance Scenarios**:

1. **Given** the user opens the app, **When** routes are loaded, **Then** each route card displays: route name, status badge, progress text (stop X of Y), and an inner section with next stop name and scheduled time.
2. **Given** a route is active, **When** the user views the card, **Then** the route icon has a highlighted background, the status badge shows "Em operacao" with a pulsing dot, and the card has a colored left accent.
3. **Given** a route is inactive, **When** the user views the card, **Then** the status badge shows "Fora de operacao" without pulsing, the icon has a muted background, and no colored left accent appears.
4. **Given** the user taps a route card, **When** the tap is registered, **Then** the card shows a scale-down feedback effect and the app navigates to the route detail screen with a slide-in transition.
5. **Given** the user hovers or long-presses a card, **When** the interaction occurs, **Then** the card shadow elevates, and the chevron icon shifts to indicate interactivity.

---

### User Story 2 - View Route Detail with Gradient Hero and Timeline (Priority: P1)

A passenger taps a route and sees a detail screen with a prominent gradient hero card displaying the next scheduled stop, its time, and a button to open the live location. Below the hero card, a vertical timeline shows all schedule stops with visual differentiation between past stops (completed), the current/next stop (highlighted with animation), and future stops. The user can collapse past stops to reduce clutter.

**Why this priority**: The route detail screen is the core informational screen users rely on to know where the van is and when it arrives. The timeline visualization is the most significant UX improvement over the current flat list.

**Independent Test**: Can be fully tested by navigating to a route detail and verifying the hero card content, timeline node states, past stop collapsibility, and live location button.

**Acceptance Scenarios**:

1. **Given** the user navigates to a route detail, **When** the page loads, **Then** a gradient hero card displays: a "PROXIMA PARADA" label, the next stop name, the scheduled time, and a "last updated" timestamp.
2. **Given** the route is active and has a location link, **When** the detail page loads, **Then** the hero card includes a prominent button labeled "Abrir localizacao ao vivo" that opens the location link.
3. **Given** the route is inactive or has no location link, **When** the detail page loads, **Then** the location button is hidden.
4. **Given** the schedule has past stops, **When** the page loads, **Then** past stops are collapsed by default with a button showing "Ver X paradas anteriores" to expand them.
5. **Given** the user taps "Ver X paradas anteriores", **When** the action occurs, **Then** past stops become visible in the timeline with a completed visual state (muted colors, checkmark indicator).
6. **Given** the schedule has a current/next stop, **When** the timeline renders, **Then** that stop has a pulsing indicator node, bold text, and a "Parada atual / Proxima" label.
7. **Given** the user is on the detail screen, **When** they scroll down, **Then** the header (with back button and route name) remains sticky and visible with a frosted-glass background effect.

---

### User Story 3 - Switch Between Routes and Announcements via Tabs (Priority: P2)

A passenger uses a bottom navigation bar to switch between the routes list and the announcements list without full page reloads. The active tab is visually distinct with a highlighted icon container, bolder styling, and smooth content transitions. The announcements tab shows a notification dot when any non-expired urgent announcement exists.

**Why this priority**: Tab-based navigation with in-place content switching is faster and more app-like than navigating to separate pages. The notification dot draws attention to important announcements.

**Independent Test**: Can be fully tested by tapping between tabs and verifying content switches, active state styling, and notification dot presence.

**Acceptance Scenarios**:

1. **Given** the user is on the routes tab, **When** they tap "Avisos" in the bottom nav, **Then** the content area transitions to show announcements without a full page navigation.
2. **Given** the user is on the announcements tab, **When** they tap "Rotas" in the bottom nav, **Then** the content area transitions back to the routes list.
3. **Given** a tab is active, **When** the user views the bottom nav, **Then** the active tab has a highlighted icon container, a bolder icon stroke, and distinct text color.
4. **Given** there is at least one non-expired urgent announcement, **When** the user views the bottom nav, **Then** a small notification dot appears on the Avisos tab icon.
5. **Given** the user switches tabs, **When** the transition occurs, **Then** content fades and slides smoothly (not an abrupt swap).

---

### User Story 4 - View Announcements with Visual Urgency Levels (Priority: P2)

A passenger views announcements displayed as cards with clear visual differentiation based on type (informational vs. urgent). Urgent announcements have a colored accent bar and distinct color treatment. Pinned announcements show a pin indicator. Each card displays the announcement type as an uppercase badge, the title, description, and publication date.

**Why this priority**: Announcements communicate service disruptions and schedule changes. Visual urgency levels help users quickly identify critical information.

**Independent Test**: Can be fully tested by viewing the announcements list and verifying that each card renders the correct type badge, accent bar (for urgent), pin indicator (if pinned), and content.

**Acceptance Scenarios**:

1. **Given** the user views announcements, **When** an announcement is of type "urgent", **Then** the card displays a colored accent bar on the left side, an "URGENTE" badge with alert icon, and uses a distinct warm color scheme for title and description.
2. **Given** the user views announcements, **When** an announcement is of type "info", **Then** the card displays an "INFORMATIVO" badge with info icon and uses the standard neutral color scheme.
3. **Given** an announcement is pinned, **When** the user views it, **Then** a pin indicator icon appears in the card header.
4. **Given** announcements exist, **When** the list renders, **Then** each card shows: type badge, title, description text, and a "Publicado em DD/MM/YYYY" timestamp.

---

### User Story 5 - Experience Smooth Page Transitions and Micro-interactions (Priority: P3)

A passenger experiences fluid, app-like transitions when navigating between screens and interacting with elements. Route list and announcement list entries animate in with a fade-and-slide effect. Navigating to a route detail slides the content in from the right. Interactive elements provide visual feedback through scale changes and shadow elevation on touch.

**Why this priority**: Animations enhance perceived quality and make the app feel native rather than web-based. However, the app is fully functional without them, making this lower priority.

**Independent Test**: Can be fully tested by navigating through the app and verifying that transitions, hover effects, and tap feedback animations are present and smooth.

**Acceptance Scenarios**:

1. **Given** the routes list loads, **When** cards appear, **Then** each card fades in while sliding upward.
2. **Given** the user taps a route card, **When** the detail page appears, **Then** it slides in from the right with a fade effect.
3. **Given** the user taps "Voltar" on the detail page, **When** returning to the list, **Then** the detail page slides out to the right and the list fades back in.
4. **Given** the user interacts with a card, **When** they press/tap, **Then** the card scales down slightly (tactile feedback) and returns to normal on release.
5. **Given** the user has reduced motion preferences enabled in their device, **When** animations would normally play, **Then** animations are reduced or disabled to respect accessibility settings.

---

### Edge Cases

- What happens when a route has zero stops in its schedule? The timeline section should display an empty state message instead of an empty container.
- What happens when a route has no next stop (schedule completed for the day)? The hero card should display a "Programacao encerrada" message instead of stop details, and the location button should be hidden.
- What happens when all routes are inactive? The routes list displays all cards in their inactive styling; no special empty state is needed since the routes themselves are still shown.
- What happens when there are no announcements? The announcements tab shows an empty state message (e.g., "Nenhum aviso no momento").
- What happens when the location link is outdated? The hero card should show a warning indicator near the timestamp noting the location may not be current.
- What happens when a route has only past stops and no current/future stops? All timeline nodes show as completed, no pulsing indicator appears, and the hero card shows the "schedule completed" state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display each route card with: route name, operational status badge, schedule progress text (e.g., "Parada X de Y"), and an inner section showing next stop name and scheduled time.
- **FR-002**: The system MUST visually distinguish active routes from inactive routes using status badge styling (pulsing dot for active), icon background color differentiation, and a colored left accent on the card.
- **FR-003**: The system MUST display a gradient hero card on the route detail screen showing the next stop name, scheduled time, a label ("PROXIMA PARADA"), and a last-update timestamp.
- **FR-004**: The system MUST show a "live location" button inside the hero card only when the route is active and a location link is available.
- **FR-005**: The system MUST render the schedule as a vertical timeline with three visual node states: past (completed checkmark), current (pulsing animated indicator), and future (empty circle).
- **FR-006**: The system MUST collapse past stops by default in the timeline, with a button to expand them showing the count of hidden stops.
- **FR-007**: The system MUST provide a sticky header on the route detail screen with a frosted-glass (semi-transparent with backdrop blur) effect containing the back button and route name.
- **FR-008**: The system MUST implement bottom tab navigation with two tabs (Rotas and Avisos) that switch content in-place using client-side routing with URL changes (e.g., `/` for Rotas, `/avisos` for Avisos), preserving deep linking and browser back/forward history.
- **FR-009**: The system MUST display a notification dot on the Avisos tab when any non-expired urgent announcement exists.
- **FR-010**: The system MUST render announcement cards with: a type badge (uppercase, with icon — "URGENTE" or "INFORMATIVO"), title, description, and publication date.
- **FR-011**: The system MUST display a colored accent bar on the left side of urgent announcement cards.
- **FR-012**: The system MUST display a pin indicator on pinned announcement cards.
- **FR-013**: The system MUST animate page transitions: fade-and-slide-up for list entries, slide-from-right for route detail navigation.
- **FR-014**: The system MUST provide tactile feedback on card interactions (scale-down effect on tap/press).
- **FR-015**: The system MUST respect the user's reduced-motion accessibility preference by disabling or reducing animations.
- **FR-016**: The system MUST maintain all existing data contracts and API integrations — no breaking changes to existing responses. Additive computed fields (e.g., route progress) are permitted when derived from already-loaded data in the BFF.
- **FR-017**: The system MUST display loading skeletons that match the shapes of the redesigned components (route cards with inner section, gradient hero card, timeline nodes). Error and empty states retain the existing patterns (alert with retry button).

### Key Entities

- **Route Card**: Represents a van route in the list view. Attributes: name, status (active/inactive), progress (current stop number, total stops), next stop name, next stop time.
- **Timeline Stop**: Represents a single stop in the route detail timeline. Attributes: stop name, scheduled time, status (past/current/future).
- **Announcement Card**: Represents a system announcement. Attributes: title, description, publication date, type (info/urgent), pinned status.

## Assumptions

- The redesign applies only to public-facing screens (routes list, route detail, announcements). Admin screens are out of scope.
- The existing BFF API responses already provide all data needed for the new UI elements (route progress, stop statuses, announcement types). If any new computed fields are needed (e.g., "Parada X de Y" progress), they will be derived from existing schedule data.
- The "notification dot" on the Avisos tab is based on announcement data already available (urgent type or recent publication date), not a separate push notification system.
- The announcement type field (info/urgent) maps to the existing `isUrgent` boolean on announcements. Non-urgent announcements are treated as "info" type.
- Dark mode support is out of scope for this redesign. The prototype defines dark mode variables, but the current app does not implement dark mode, and adding it would expand scope.
- The frosted-glass sticky header effect will degrade gracefully on browsers that do not support `backdrop-filter`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can identify a route's operational status and next stop within 2 seconds of viewing the routes list.
- **SC-002**: Users can navigate from the routes list to a route's full schedule in 1 tap and under 1 second (including transition animation).
- **SC-003**: Users can distinguish between past, current, and future stops in the timeline without reading text labels (visual indicators alone are sufficient).
- **SC-004**: Users can switch between routes and announcements in 1 tap with content appearing within 300ms.
- **SC-005**: Users can identify urgent announcements within 1 second of viewing the announcements list (visual urgency is immediately apparent).
- **SC-006**: All interactive elements provide visual feedback within 100ms of user interaction (tap, press, hover).
- **SC-007**: Page transitions complete within 400ms and do not cause layout shifts or content jumps.
- **SC-008**: The redesigned screens maintain the same information completeness as the current screens — no data is lost or hidden by default (past stops are collapsed but expandable).
