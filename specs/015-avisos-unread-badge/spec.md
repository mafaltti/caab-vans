# Feature Specification: Functional Unread Badge for Avisos Tab

**Feature Branch**: `015-avisos-unread-badge`
**Created**: 2026-03-01
**Status**: Draft
**Input**: User description: "Make the Avisos tab badge functional by tracking read state via localStorage"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Badge Alerts User to New Notices (Priority: P1)

As a passenger using the CAAB Vans app, I want to see a visual indicator (red dot) on the Avisos tab when there are notices I haven't seen yet, so I know there's new information to check.

**Why this priority**: This is the core value of the feature — users need a reliable signal that new content exists. Without this, they either miss important notices or compulsively check the tab.

**Independent Test**: Can be fully tested by publishing a new announcement and verifying the badge appears for a user who hasn't visited the Avisos tab since that announcement was created.

**Acceptance Scenarios**:

1. **Given** a user has never visited the Avisos tab, **When** there is at least one active announcement, **Then** the red dot badge appears on the Avisos tab icon.
2. **Given** a user last visited the Avisos tab yesterday, **When** a new announcement was published today, **Then** the red dot badge appears on the Avisos tab icon.
3. **Given** there are no active announcements, **When** the user views the bottom navigation, **Then** no badge is displayed on the Avisos tab icon.

---

### User Story 2 - Badge Disappears After Viewing Notices (Priority: P1)

As a passenger, I want the red dot to disappear after I visit the Avisos tab and see the new notices, so the badge only draws my attention when there's genuinely new content.

**Why this priority**: Equally critical to Story 1 — the badge is useless if it never clears. Together these two stories form the minimum viable unread indicator.

**Independent Test**: Can be fully tested by navigating to the Avisos tab and verifying the badge disappears, then confirming it stays hidden on subsequent visits until a newer announcement is published.

**Acceptance Scenarios**:

1. **Given** the red dot badge is visible (new notices exist), **When** the user navigates to the Avisos tab, **Then** the badge disappears.
2. **Given** the user just visited the Avisos tab and the badge cleared, **When** the user navigates away and returns to the bottom navigation, **Then** the badge remains hidden (no new notices were published in the interim).
3. **Given** the user visited the Avisos tab and the badge cleared, **When** a new announcement is published after that visit, **Then** the badge reappears on the next data refresh.

---

### User Story 3 - Badge Persists Across Browser Sessions (Priority: P2)

As a passenger, I want the app to remember that I've already seen the notices even if I close and reopen the browser, so the badge doesn't falsely reappear during a new session.

**Why this priority**: Important for a polished experience but secondary to the core show/hide behavior. Without this, the badge would reset every time the user reopens the app.

**Independent Test**: Can be tested by visiting Avisos, closing the browser, reopening it, and verifying the badge state is correctly preserved.

**Acceptance Scenarios**:

1. **Given** the user visited Avisos and the badge cleared, **When** the user navigates to a different tab and back, **Then** the badge remains hidden.
2. **Given** the user visited Avisos and the badge cleared, **When** the user closes and reopens the browser on the same device, **Then** the badge remains hidden (read state persists).

---

### Edge Cases

- What happens when a user clears their browser storage? The badge reappears as if the user has never visited, treating all current announcements as new. This is acceptable behavior.
- What happens when an existing announcement is edited (updated) after the user's last visit? Edited announcements do not re-trigger the badge — only newly created announcements trigger it.
- What happens when all announcements expire after the user's last visit? The badge does not appear because there are no active announcements to show.
- What happens when the user has no internet and cached data is stale? The badge state is based on the last successfully fetched data; the read timestamp is still preserved locally.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a red dot badge on the Avisos tab icon when there are active announcements created after the user's last visit to the Avisos tab.
- **FR-002**: System MUST record the user's last visit timestamp to the Avisos tab in the browser's local storage when the user navigates to the Avisos page.
- **FR-003**: System MUST compare the most recent announcement's creation date against the stored last-visit timestamp to determine badge visibility.
- **FR-004**: System MUST hide the badge when the user has no unread announcements (all announcements were created before the last visit, or no active announcements exist).
- **FR-005**: System MUST show the badge for first-time visitors (no stored timestamp) when at least one active announcement exists.
- **FR-006**: System MUST persist the read state across browser sessions on the same device using local storage.
- **FR-007**: System MUST NOT re-trigger the badge when an existing announcement is edited — only newly created announcements trigger the badge.
- **FR-008**: The badge dot MUST be positioned closer to the bell icon, sitting tightly on the icon rather than offset away from it.

### Key Entities

- **Read State**: Represents when the user last viewed the Avisos tab. Stored per-device as a timestamp. Compared against announcement creation dates to determine unread status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The badge correctly appears within one polling cycle (60 seconds) after a new announcement is published, for users who haven't visited the Avisos tab since.
- **SC-002**: The badge disappears immediately when the user navigates to the Avisos tab.
- **SC-003**: Read state persists across browser sessions — closing and reopening the browser does not reset the badge unless browser storage was cleared.
- **SC-004**: The badge never appears when there are zero active announcements, regardless of stored read state.

## Assumptions

- Public users of the app have no authentication, so read tracking is per-device via local storage — not synced across devices. This is an acceptable trade-off for the MVP.
- The existing 60-second polling interval for announcement data is sufficient for badge freshness; no real-time push is needed.
- The announcement `created_at` field is the authoritative timestamp for determining "newness" — `updated_at` changes (edits) do not count as new content.
- Local storage is available in all target browsers (modern mobile browsers).

## Scope Boundaries

### In Scope

- Red dot badge visibility logic based on local read state
- Recording last-visit timestamp when user views the Avisos tab
- Persisting read state in local storage
- Repositioning badge dot closer to the bell icon

### Out of Scope

- Server-side read tracking or per-user read state
- Cross-device synchronization of read state
- Per-announcement read tracking (marking individual notices as read/unread)
- Unread count indicator (showing a number instead of a dot)
- Push notifications for new announcements
