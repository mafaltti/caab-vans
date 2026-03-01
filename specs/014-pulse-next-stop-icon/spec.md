# Feature Specification: Pulse Animation on Next Stop Icon

**Feature Branch**: `014-pulse-next-stop-icon`
**Created**: 2026-03-01
**Status**: Draft
**Input**: User description: "Add pulse animation to the next stop icon in the schedule timeline, matching the AI Studio prototype"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pulsing indicator draws attention to the next stop (Priority: P1)

A passenger viewing a running route's schedule timeline sees a subtle pulsing animation on the next stop's icon. The gentle fade in/out draws their eye to the relevant stop without being distracting, making it immediately clear which stop is next.

**Why this priority**: The core purpose of this feature. Without the pulse, the next stop icon is static and blends in more easily with other stops, reducing at-a-glance clarity.

**Independent Test**: Can be fully tested by opening any running route's detail page, scrolling to "Horarios", and observing the next stop icon. Delivers immediate visual feedback about which stop is active.

**Acceptance Scenarios**:

1. **Given** a route is running and has a next stop, **When** the user views the schedule timeline, **Then** the next stop's inner dot animates with a continuous pulse (opacity fading between full and half).
2. **Given** a route is running and the user scrolls through the timeline, **When** past stops are expanded, **Then** only the current/next stop icon pulses; past and future stop icons remain static.

---

### User Story 2 - Animation respects reduced motion preferences (Priority: P2)

A passenger who has enabled "reduce motion" in their device/browser accessibility settings sees the next stop icon without the pulse animation, ensuring the app remains comfortable and accessible for users sensitive to motion.

**Why this priority**: Accessibility is essential but secondary to the core visual feature. The app already respects reduced motion in other areas (e.g., HeroCard bounce), so this must be consistent.

**Independent Test**: Can be tested by enabling "prefers-reduced-motion: reduce" in OS/browser settings and verifying the next stop icon is static (no pulse).

**Acceptance Scenarios**:

1. **Given** the user has "reduce motion" enabled in their device settings, **When** they view a running route's schedule timeline, **Then** the next stop icon displays as a static blue dot without any animation.
2. **Given** the user has default motion settings (no reduced motion), **When** they view a running route's schedule timeline, **Then** the next stop icon pulses normally.

---

### User Story 3 - No animation on inactive routes (Priority: P3)

When a route is not running (inactive/out of operation), the schedule timeline shows all stops in a neutral state. No stop icon should pulse, since there is no "next stop" concept for inactive routes.

**Why this priority**: Prevents misleading visual cues. Lower priority because inactive routes already use neutral styling -- this story confirms no regression.

**Independent Test**: Can be tested by viewing an inactive route's schedule timeline and verifying all stop icons are static.

**Acceptance Scenarios**:

1. **Given** a route is not running, **When** the user views the schedule timeline, **Then** no stop icon displays any animation.

---

### Edge Cases

- What happens when the route transitions from running to inactive while the user is viewing the timeline? The pulse should stop when the data refreshes and no next stop is present.
- What happens when the next stop changes (e.g., the van reaches a stop and the next stop advances)? The pulse should move to the new next stop icon on the next data refresh.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display a continuous pulse animation on the inner dot of the next stop icon in the schedule timeline when the route is running.
- **FR-002**: The pulse animation MUST consist of an opacity fade between full visibility and approximately half visibility, cycling continuously.
- **FR-003**: The animation cycle duration MUST be approximately 2 seconds, matching the established pulse pattern used elsewhere in the app (e.g., route status badge).
- **FR-004**: The pulse animation MUST only appear on the stop with "current" status; past, future, and neutral stop icons MUST remain static.
- **FR-005**: The system MUST suppress the pulse animation when the user's device or browser has "reduce motion" accessibility settings enabled.
- **FR-006**: The system MUST NOT display any pulse animation on any stop icon when the route is inactive (not running).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can identify the next stop in the schedule timeline within 2 seconds of viewing, aided by the pulsing visual cue.
- **SC-002**: The animation is perceptible but not distracting -- the pulse is subtle (opacity change only, no size/position shift) and does not interfere with reading stop names or times.
- **SC-003**: The animation is fully suppressed when device-level "reduce motion" preferences are enabled, achieving accessibility compliance.
- **SC-004**: The visual treatment is consistent with the AI Studio prototype reference and with existing pulse animations in the app (route status badge dot).

## Assumptions

- The existing schedule timeline component already correctly identifies stop status ("past", "current", "future", "neutral"), so no data logic changes are needed.
- The project's design system already uses the same pulse animation pattern on the route status badge, so the visual language is established.
- A reduced-motion mechanism is already available in the project for accessibility support.
