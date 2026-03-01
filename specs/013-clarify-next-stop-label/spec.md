# Feature Specification: Clarify Next Stop Label

**Feature Branch**: `013-clarify-next-stop-label`
**Created**: 2026-03-01
**Status**: Draft
**Input**: User description: "Change the ambiguous 'Parada atual / Próxima' label in the Horários timeline to simply 'Próxima parada' for clarity"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unambiguous Next Stop Label (Priority: P1)

A passenger viewing the schedule timeline for an active route sees the label "Próxima parada" on the highlighted stop, immediately understanding that this is the next upcoming stop on the route. There is no ambiguity about whether it refers to the current location or the next destination.

**Why this priority**: This is the only change in scope — eliminating user confusion about which stop the label refers to directly impacts the core information delivery of the app.

**Independent Test**: Can be fully tested by opening any active route's schedule timeline and verifying the highlighted stop shows "Próxima parada" instead of the old "Parada atual / Próxima" label.

**Acceptance Scenarios**:

1. **Given** a route is active with a current/next stop identified, **When** the schedule timeline renders, **Then** the highlighted stop displays the label "Próxima parada" (not "Parada atual / Próxima").
2. **Given** a route is active, **When** the user reads the timeline label, **Then** they can unambiguously identify which stop is the next upcoming one.
3. **Given** the hero card already shows "Próxima parada", **When** the user switches between the hero card and the timeline, **Then** the terminology is consistent across both components.

### Edge Cases

- What happens when the schedule has ended for the day? The label only appears for stops with `status === "current"`, so no label is shown when there is no current/next stop — no change needed.
- What happens when there is only one stop remaining? The same "Próxima parada" label applies — it still indicates the next stop.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The schedule timeline MUST display "Próxima parada" as the label for the current/next stop, replacing the previous "Parada atual / Próxima" text.
- **FR-002**: The label text MUST be consistent with the hero card component, which already uses "Próxima parada".
- **FR-003**: The label styling (font size, color, position) MUST remain unchanged — only the text content changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of timeline stop labels for current/next stops read "Próxima parada" with no occurrence of the old "Parada atual / Próxima" text anywhere in the application.
- **SC-002**: Users can identify the next upcoming stop within the timeline without hesitation or confusion about the label meaning.
- **SC-003**: Label terminology is consistent across all components that reference the next stop (hero card and schedule timeline).

## Assumptions

- The hero card (`hero-card.tsx`) already uses "Próxima parada" — this change brings the timeline into alignment.
- No other components use the old "Parada atual / Próxima" label.
- The change is purely cosmetic (text content only) — no logic, styling, or layout changes are needed.
