# Feature Specification: Remove Misleading Skipped-Stop Warning Banner

**Feature Branch**: `069-remove-skip-banner`
**Created**: 2026-03-12
**Status**: Draft
**Input**: User description: "Remove the 'Tempo estimado pode variar — parada(s) com alteração' banner from the commuter route detail page. The banner is misleading because skipped stops do not degrade ETA accuracy — the ETA engine already filters out skipped stops and recalculates from the van's live position. Skipped stops are already visually marked in the ScheduleTimeline."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Commuter views route with skipped stops (Priority: P1)

A commuter opens a route detail page where the driver has skipped one or more stops. The commuter sees the skipped stops visually marked in the schedule timeline but is no longer shown a misleading warning banner implying that ETAs are unreliable.

**Why this priority**: This is the only scenario affected by the change. The current banner causes unnecessary anxiety for commuters by suggesting ETAs may be wrong, when in reality the ETA engine already accounts for skipped stops.

**Independent Test**: Open a route detail page for a running route that has skipped stops — verify no "Tempo estimado pode variar" banner appears, while skipped stops remain visually indicated in the timeline.

**Acceptance Scenarios**:

1. **Given** a running route with one or more skipped stops and no active detour, **When** a commuter opens the route detail page (map layout), **Then** no "parada(s) com alteração" warning banner is displayed.
2. **Given** a running route with one or more skipped stops and no active detour, **When** a commuter opens the route detail page (card layout), **Then** no "parada(s) com alteração" warning banner is displayed.
3. **Given** a running route with skipped stops, **When** a commuter views the schedule timeline, **Then** skipped stops are still visually marked (existing behavior unchanged).
4. **Given** a running route with an active detour, **When** a commuter opens the route detail page, **Then** the "Rota em desvio" detour banner still appears as before.

---

### Edge Cases

- What happens when both skipped stops and an active detour exist? The detour banner shows (unchanged behavior — the skipped-stop banner was already suppressed by the detour guard).
- What happens when no stops are skipped and no detour is active? No banner shows (unchanged behavior).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST NOT display the "Tempo estimado pode variar — parada(s) com alteração" banner in the map-based running layout.
- **FR-002**: The system MUST NOT display the "Tempo estimado pode variar — parada(s) com alteração" banner in the card-based non-running layout.
- **FR-003**: The system MUST continue to display the "Rota em desvio" detour banner with its reason label when a detour is active.
- **FR-004**: The system MUST continue to visually mark skipped stops in the schedule timeline.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No commuter sees the "parada(s) com alteração" warning banner on any route detail page, regardless of skipped-stop state.
- **SC-002**: The detour banner ("Rota em desvio") continues to appear correctly when a detour is active.
- **SC-003**: Skipped stops remain visually distinguishable in the schedule timeline.

## Assumptions

- The `hasExceptions` variable and related dead code left behind after removing the banner should be cleaned up.
- No backend or API changes are needed — this is a frontend-only removal.
