# Feature Specification: Last-Known Progress Display for Non-Running Routes

**Feature Branch**: `055-last-known-client-wiring`
**Created**: 2026-03-08
**Status**: Draft
**Input**: Wire `includeLastKnown` into client hooks so non-running routes display their last-known progress position in the UI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Commuter Sees Last-Known Progress After Shift Ends (Priority: P1)

A commuter (lawyer or estagiario) checks the app after a van's shift has ended. Instead of seeing blank progress info, they see the last-known position the van reached before stopping. This tells them whether the van already passed their stop or not.

**Why this priority**: This is the core problem — commuters currently see no progress information for non-running routes, making the app useless outside active hours. Solving this delivers immediate value to the primary user base.

**Independent Test**: Can be fully tested by ending a route that has progressed past several stops, then viewing the route card and timeline as a commuter. The last-known stop, progress counter, and timeline should all display the van's final position.

**Acceptance Scenarios**:

1. **Given** a route that ran earlier today and passed stops A, B, and C before ending, **When** a commuter views the route list, **Then** the route card shows "Ultima posicao: Stop C" with a progress counter (e.g., "Parada 3 de 5").
2. **Given** a route that is not currently running but has last-known progress data, **When** a commuter opens the route detail, **Then** the stop timeline shows stops A and B as passed, stop C as the last-known position (visually muted), and remaining stops as future.
3. **Given** a route that is not running and has no persisted progress (never started or data expired), **When** a commuter views the route, **Then** the display remains blank/neutral as it does today — no change from current behavior.

---

### User Story 2 - Commuter Sees Muted Hero Card with Last-Known Position (Priority: P2)

When a commuter opens a non-running route's detail view that has last-known progress, they see a muted card showing the last-known stop name and time — clearly distinct from the live tracking card shown during active routes.

**Why this priority**: The hero card is the most prominent UI element on the route detail page. Showing last-known info here reinforces that the data is available but stale, using visual cues (muted colors, different label) to prevent confusion with live tracking.

**Independent Test**: Can be tested by ending a route mid-progress and viewing the route detail page. The hero card should display "Ultima posicao conhecida" with the stop name and time in muted styling.

**Acceptance Scenarios**:

1. **Given** a non-running route with last-known progress at "Stop C" at "08:15", **When** a commuter views the route detail, **Then** the hero card shows "Ultima posicao conhecida" with "Stop C" and "as 08:15" in muted gray styling.
2. **Given** a non-running route with last-known progress, **When** a commuter views the hero card, **Then** no ETA is displayed and no map/GPS marker is shown.
3. **Given** a route that transitions from non-running to running, **When** the commuter is viewing the route, **Then** the hero card switches from the muted last-known card to the live tracking card automatically.

---

### User Story 3 - Visual Distinction Between Live and Last-Known States (Priority: P3)

Across all UI components, last-known progress is visually distinct from live tracking. The timeline uses a gray dot (no pulse) instead of the blue pulsing dot for the current position. Labels explicitly say "Ultima posicao" rather than implying the van is currently there.

**Why this priority**: Preventing user confusion between stale and live data is critical for trust. Without clear visual distinction, commuters might rush to a stop thinking the van is actively there when it stopped hours ago.

**Independent Test**: Can be tested by comparing the same route in running vs. non-running-with-last-known states. Visual elements (dot color, label text, card styling) should be clearly different.

**Acceptance Scenarios**:

1. **Given** a non-running route with last-known progress, **When** the timeline renders, **Then** the current position marker uses a gray dot without pulse animation (not the blue pulsing dot used for live routes).
2. **Given** a non-running route with last-known progress, **When** the route card renders, **Then** the next stop label shows "Ultima posicao" prefix instead of the default "Proxima" label.

---

### Edge Cases

- What happens when the last-known progress data has expired (older than the configured ceiling)? The system returns no last-known data, and the UI shows the same blank state as today.
- What happens when the persisted pointer references a stop that no longer exists in the schedule? The system returns null for the last-known stop, and the UI shows the blank state.
- What happens when a route has `runStatus === "waiting"` (not yet started) even if stale progress data exists? The waiting state takes precedence — timeline shows all neutral, no last-known display.
- What happens when a route has `runStatus === "completed"`? The completed state takes precedence — timeline shows all past, hero card shows "Rota encerrada por hoje". Last-known is not shown for completed routes.
- What happens when a route transitions from non-running to running while the user is viewing it? The 5-second polling cycle picks up the status change and the UI switches to live mode automatically.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST request last-known progress data from the backend for all route queries (both route list and route detail).
- **FR-002**: The route card MUST display the last-known stop name with an "Ultima posicao" label when a non-running route has last-known progress data available.
- **FR-003**: The route card MUST display the progress counter (e.g., "Parada 3 de 5") when last-known progress data provides a valid stop index.
- **FR-004**: The route card MUST NOT display an ETA for non-running routes with last-known data.
- **FR-005**: The stop timeline MUST show passed stops, a current position marker, and future stops based on last-known progress data for non-running routes.
- **FR-006**: The stop timeline MUST use a visually muted current position marker (gray, no animation) for last-known progress, distinct from the live tracking marker (blue, pulsing).
- **FR-007**: The hero card MUST display a muted card with "Ultima posicao conhecida", the stop name, and the time for non-running routes with last-known data.
- **FR-008**: The hero card MUST NOT display an ETA or GPS information for last-known progress.
- **FR-009**: The map MUST NOT show a van marker for non-running routes, regardless of last-known data availability.
- **FR-010**: Routes with `runStatus === "waiting"` MUST continue to show all-neutral timeline regardless of any last-known data.
- **FR-011**: Routes with `runStatus === "completed"` MUST continue to show all-past timeline and "route completed" messaging.
- **FR-012**: Running routes MUST display identically to their current behavior — the last-known feature MUST NOT affect live route rendering.
- **FR-013**: When no last-known data is available for a non-running route (expired or never started), the UI MUST show the same blank state as today.

### Key Entities

- **Last-Known Progress**: The final progress position persisted for a route before it stopped running. Includes the last stop reached, list of passed stops, and the timestamp. Does not include ETA or GPS coordinates.
- **Next Stop Mode**: A flag indicating whether the next stop data comes from live tracking (`"live"`) or persisted history (`"last_known"`). Used by UI components to select appropriate visual styling.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Commuters viewing a non-running route that previously had active progress can see which stop the van last reached, within the data's expiry window.
- **SC-002**: 100% of last-known displays use muted visual styling (gray colors, "Ultima posicao" labels) — no instance where last-known data appears with live styling.
- **SC-003**: Zero ETA values displayed for non-running routes with last-known data.
- **SC-004**: Running routes render identically before and after this change — zero visual regressions for active tracking.
- **SC-005**: The route list page and route detail page both show last-known data consistently for the same route.

## Assumptions

- The backend `includeLastKnown=true` parameter is already fully implemented and tested (shipped in PR #59).
- The `nextStopMode` field (`"live" | "last_known" | null`) is already part of the `RouteWithStatus` type.
- The `passedStopIds` array is already included in the backend response when `includeLastKnown=true`.
- All UI copy is in Portuguese (pt-BR) to match the existing app language.
- The 5-second polling interval remains unchanged for all routes (optimizing polling frequency for non-running routes is out of scope).
- The driver route card (`src/components/driver/route-card.tsx`) is out of scope for this feature.
