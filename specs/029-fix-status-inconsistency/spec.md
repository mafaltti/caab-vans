# Feature Specification: Fix Status Inconsistency

**Feature Branch**: `029-fix-status-inconsistency`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "Fix status inconsistency between route list and route detail pages. Currently the route list page shows 'Em operação' for ALL vans based solely on isRunning (schedule window + fresh GPS), ignoring the actual shift lifecycle (runStatus). The route detail page correctly uses runStatus to show 'Aguardando início da rota' when no shift has been started."

## Clarifications

### Session 2026-03-02

- Q: Should "waiting" and "idle" have distinct badge treatments, and what are the exact Portuguese labels? → A: Option C — 4 badges: "Em operação" (green), "Aguardando início" (amber, for both waiting and idle), "Encerrada" (emerald/muted, for completed), "Fora de operação" (zinc). A manual "end route for the day" driver action is out of scope for this fix; the "Encerrada" state relies on the existing automatic logic (all shifts ended + past schedule window).
- Q: How should vans waiting to start their route (no active shift, but GPS is on) be displayed to passengers? → A: "Aguardando início" (amber). GPS being on doesn't mean the van is serving passengers — only an active shift means operating.
- Q: Should `idle` (between shifts) + GPS fresh show "Em operação" or "Aguardando início"? → A: "Em operação" (green). Between shifts but still actively tracked means the van is operating from the passenger's perspective. Only `idle` without GPS → "Aguardando início".
- Q: Should badge and hero card always show consistent status? → A: Yes. The hero card decision tree must match the badge for all state combinations. When active shift has stale GPS, hero shows "Em operação" with a "Localização desatualizada" warning.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Passenger sees accurate status on route list (Priority: P1)

As a passenger browsing the route list, I want to see a status badge that accurately reflects whether a van is actively running its route, so I don't mistake an idle or waiting van for one that is in operation.

**Why this priority**: This is the core bug — passengers currently see misleading "Em operação" badges for vans that haven't started their shift, causing confusion about which vans are actually running.

**Independent Test**: Can be tested by viewing the route list page when some vans have active shifts and others don't. Only vans with active shifts should show the green "Em operação" badge.

**Acceptance Scenarios**:

1. **Given** a van has an active shift (route started, not ended), **When** a passenger views the route list, **Then** the route card shows a green "Em operação" badge with a pulsing dot.
2. **Given** a van is between shifts but has fresh GPS data (idle + isRunning), **When** a passenger views the route list, **Then** the route card shows a green "Em operação" badge with a pulsing dot.
3. **Given** a van is within schedule hours but no shift has been started today and no fresh GPS, **When** a passenger views the route list, **Then** the route card shows an amber "Aguardando início" badge.
4. **Given** a van's shift has ended, GPS is stale, and it's still within the schedule window, **When** a passenger views the route list, **Then** the route card shows an amber "Aguardando início" badge.
5. **Given** a van has completed all shifts and the schedule window has passed, **When** a passenger views the route list, **Then** the route card shows a muted emerald "Encerrada" badge.
6. **Given** a van has a route_run but no shifts and the schedule window has passed, **When** a passenger views the route list, **Then** the route card shows a zinc "Fora de operação" badge.
7. **Given** a van is outside its schedule window entirely with no route_run, **When** a passenger views the route list, **Then** the route card shows a zinc "Fora de operação" badge.

---

### User Story 2 - Status consistency between list and detail (Priority: P1)

As a passenger, I want to see the same operational status on the route list card and the route detail page, so I'm not confused by conflicting information when navigating between views.

**Why this priority**: Equally critical — showing different statuses on different pages erodes user trust and creates confusion.

**Independent Test**: Can be tested by comparing the status badge on each route card in the list page with the hero card status on the corresponding detail page. They must always agree on the operational state.

**Acceptance Scenarios**:

1. **Given** a route shows "Em operação" on the list page (active shift + GPS fresh), **When** I tap into that route's detail page, **Then** the hero card shows the blue gradient card with next stop, ETA, and live location button.
2. **Given** a route shows "Em operação" on the list page (active shift + GPS stale), **When** I tap into that route's detail page, **Then** the hero card shows "Em operação" with a "Localização desatualizada" warning.
3. **Given** a route shows "Em operação" on the list page (idle + GPS fresh), **When** I tap into that route's detail page, **Then** the hero card shows the blue gradient card with next stop info.
4. **Given** a route shows "Aguardando início" on the list page, **When** I tap into that route's detail page, **Then** the hero card shows "Aguardando início da rota".
5. **Given** a route shows "Encerrada" on the list page, **When** I tap into that route's detail page, **Then** the hero card shows "Rota encerrada por hoje".
6. **Given** a route shows "Fora de operação" on the list page (schedule ended), **When** I tap into that route's detail page, **Then** the hero card shows "Programação encerrada por hoje".
7. **Given** a route shows "Fora de operação" on the list page (before schedule), **When** I tap into that route's detail page, **Then** the hero card shows "Fora de operação".

---

### Edge Cases

- What happens when a van has fresh GPS data but no shift started (`waiting` + `isRunning`)? → Must show "Aguardando início" (amber). GPS on ≠ serving passengers.
- What happens when a van is between shifts with fresh GPS (`idle` + `isRunning`)? → Must show "Em operação" (green). Van is still actively tracked from passenger perspective.
- What happens when a van is between shifts with stale GPS (`idle` + `!isRunning`)? → Must show "Aguardando início" (amber).
- What happens when a van has an active shift but GPS is stale (`in_progress` + `!isRunning`)? → Badge: "Em operação" (green). Hero: "Em operação" + "Localização desatualizada" warning.
- What happens when there's no route_run and schedule is active? → Must show "Aguardando início" (amber).
- What happens when there's no route_run and schedule has ended? → Must show "Fora de operação" (zinc).
- What happens when `waiting`/`idle` and schedule has ended? → Must show "Fora de operação" (zinc). The van missed its window or is done.
- What happens when the van is outside the schedule window entirely? → Must show "Fora de operação" (zinc).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The route list status badge MUST incorporate the shift lifecycle state (`runStatus`) when determining what label and color to display, not solely rely on schedule window and GPS freshness.
- **FR-002**: The status badge MUST show "Em operação" (green/emerald, with pulsing dot) when a shift is actively in progress (`runStatus` = "in_progress") OR when the van is between shifts but still actively tracked (`runStatus` = "idle" AND `isRunning` = true).
- **FR-003**: The status badge MUST show "Aguardando início" (amber) when: (a) `runStatus` = "waiting" or "idle" (without fresh GPS) and schedule is not ended, OR (b) no route_run exists but schedule is active.
- **FR-004**: The status badge MUST show "Encerrada" (muted emerald) when the route is done for the day (`runStatus` = "completed").
- **FR-005**: The status badge MUST show "Fora de operação" (zinc) when: (a) the van is outside its schedule window with no route_run, OR (b) `runStatus` = "waiting"/"idle" and schedule has ended.
- **FR-006**: The route list page badge and route detail page hero card MUST display consistent status for the same route at the same time. The hero card decision tree must match the badge mapping for all reachable state combinations.
- **FR-007**: When a shift is active but GPS is stale (`in_progress` + `!isRunning`), the hero card MUST show "Em operação" with a "Localização desatualizada" warning, matching the badge's green "Em operação" state.

### Key Entities

- **Route Run Status**: Represents the shift lifecycle state of a route — waiting (not started), in_progress (active shift), idle (between shifts), completed (done for the day).
- **Status Badge**: Visual indicator on route cards with 4 variants: "Em operação" (green), "Aguardando início" (amber), "Encerrada" (muted emerald), "Fora de operação" (zinc).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of route cards on the list page display a status badge that matches the operational state shown on the corresponding detail page.
- **SC-002**: A route whose shift has not been started never displays "Em operação" on any page.
- **SC-003**: Only routes with an actively running shift display the green "Em operação" badge with pulsing indicator.
- **SC-004**: All four badge states ("Em operação", "Aguardando início", "Encerrada", "Fora de operação") are visually distinguishable on the route list.

## Assumptions

- The `runStatus` field is already computed correctly by the backend and available in the API response under `progress.runStatus`.
- ~~The route detail page's hero card already handles `runStatus` correctly — only the route list's status badge needs to be updated.~~ **Revised**: The hero card had an incomplete decision tree that caused inconsistencies with the badge. It was rewritten to match the badge for all state combinations.
- The existing color palette and design conventions (emerald for active, amber for waiting, zinc for inactive) should be reused for consistency.
- The "Encerrada" state is triggered automatically when all shifts have ended and the schedule window has passed. A manual "end route for the day" driver action is out of scope and will be a separate future feature.
- The badge mapping depends on three variables: `runStatus`, `isRunning` (GPS freshness + schedule window), and `scheduleStatus`. The `isRunning` flag distinguishes `idle` between "Em operação" (GPS fresh) and "Aguardando início" (GPS stale).

## Out of Scope

- Manual "end route for the day" driver action — currently the "completed" state is automatic (all shifts ended + past schedule window). A future feature may allow drivers to explicitly mark the route as ended for the day.
