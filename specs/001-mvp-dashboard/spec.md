# Feature Specification: MVP Vans Dashboard

**Feature Branch**: `001-mvp-dashboard`
**Created**: 2026-02-26
**Status**: Draft
**Input**: PRD at `docs/PRD-MVP.md` — mobile-first web app for CAAB van transport status

## Clarifications

### Session 2026-02-26

- Q: How does the ingestion endpoint identify which van a Telegram message belongs to? → A: Each van has a dedicated ingestion URL (e.g., `/api/ingest/:vanId`) configured in Pabbly.
- Q: Does the route schedule vary by day of the week? → A: No. Same schedule every day (single schedule per route).
- Q: What language should the app UI be in? → A: Portuguese (pt-BR) only.
- Q: Should route/announcement deletion be hard or soft delete? → A: Hard delete (permanently removed). Audit trails deferred post-MVP.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Route Status and Next Scheduled Stop (Priority: P1)

As a CAAB member, I want to see which van routes are currently running and
the next scheduled stop/time, so I can decide where and when to catch the van.

**Why this priority**: This is the core value proposition. Without route status
and schedule visibility, the app delivers no value. It addresses the primary
pain point: fragmented operational info.

**Independent Test**: Open the app on a mobile browser, see a list of routes
with Running/Not running status, tap a route, and confirm the schedule shows
the next scheduled stop with a time. Delivers immediate decision-making value
even without the location link.

**Acceptance Scenarios**:

1. **Given** the home screen, **When** I open the app, **Then** I see a list
   of routes each showing status "Running" or "Not running".
2. **Given** a route detail page, **When** I view the schedule, **Then** I see
   an ordered list of stops with times in HH:mm format.
3. **Given** a route schedule and current time `T` (America/Bahia), **When**
   there exists a schedule entry with time >= T, **Then** the "Next scheduled
   stop" displayed is the first entry whose time is >= T.
4. **Given** current time `T` is after the last schedule entry, **When** I
   view the route, **Then** the UI shows "Schedule ended for now".
5. **Given** this is schedule-based (not real-time), **When** next stop/time
   is displayed, **Then** it is labeled "Next scheduled stop/time" and
   includes: "Check the location link for the actual position."

---

### User Story 2 - Open Live Location Link (Priority: P1)

As a CAAB member, I want to open the van's live location link, so I can see
where the van actually is right now.

**Why this priority**: Tied for P1 because it completes the core user flow.
The location link is also a key input for the Running/Not running status rule.

**Independent Test**: Navigate to a route detail, verify the "Last updated"
timestamp and the "Open location link" button. If the link was not shared
today, confirm the "Location not updated today" warning appears.

**Acceptance Scenarios**:

1. **Given** a route has a stored location link, **When** I open route
   details, **Then** I see "Last updated: <date/time>" and a primary CTA
   "Open location link" that opens the stored URL.
2. **Given** the stored link's timestamp date is not today (America/Bahia),
   **When** I view the route, **Then** I see "Location not updated today".
3. **Given** multiple location updates arrive in a day, **When** I view the
   route, **Then** the stored link is the latest one (overwrite).

---

### User Story 3 - View Operational Announcements (Priority: P2)

As a CAAB member, I want to see operational announcements, so I can adapt to
schedule changes or service interruptions.

**Why this priority**: Important for communicating disruptions but not part of
the core "find my van" flow. The app is useful without announcements.

**Independent Test**: Open the announcements section, confirm pinned items
appear first, newest-first within groups, urgent items have distinct styling,
and expired announcements are hidden.

**Acceptance Scenarios**:

1. **Given** announcements exist, **When** I open announcements, **Then** I
   see them newest-first.
2. **Given** some announcements are pinned, **When** I view the list, **Then**
   pinned items appear above non-pinned items.
3. **Given** an announcement is marked urgent, **When** displayed, **Then** it
   has distinct visual styling (ordering still follows pinned + recency).
4. **Given** an announcement has an expiry datetime, **When** current time is
   after expiry (America/Bahia), **Then** it does not appear in the public app.
5. **Given** there are no active announcements, **When** I open announcements,
   **Then** I see "No announcements right now".

---

### User Story 4 - Admin: Manage Routes, Schedules, and Announcements (Priority: P3)

As an operations admin, I want to maintain routes, schedules, and
announcements through an admin panel, so the public app stays accurate.

**Why this priority**: Required for the app to function (data must be
managed), but from a user-journey perspective, the public-facing stories
deliver direct member value first.

**Independent Test**: Log in as admin, create a route with a schedule, create
an announcement, and verify changes are reflected in the public app.

**Acceptance Scenarios**:

1. **Given** the admin panel, **When** I log in with email/password, **Then**
   I can access admin features based on my role.
2. **Given** the routes area, **When** I create/edit a route, **Then** I can
   set the route name and its single associated van.
3. **Given** a route schedule editor, **When** I add/edit/remove schedule
   entries, **Then** each entry has an HH:mm time and a stop name.
4. **Given** I attempt to save duplicate times in the same route schedule,
   **When** I save, **Then** I get a validation error and nothing is persisted.
5. **Given** schedule entries are saved, **When** the schedule is displayed,
   **Then** entries are ordered by time automatically.
6. **Given** announcements CRUD, **When** I create/edit an announcement,
   **Then** I can set: title, body, pinned flag, urgent flag, expiry datetime.

---

### User Story 5 - Superuser: Manage Admin Accounts (Priority: P3)

As a superuser, I want to manage admin accounts, so that access is controlled
and auditable.

**Why this priority**: Governance requirement. Needed before production but
does not block early development or testing of other stories.

**Independent Test**: Log in as superuser, create a new admin user, verify
the new user can log in. Verify a non-superuser admin cannot access user
management.

**Acceptance Scenarios**:

1. **Given** I am logged in as superuser, **When** I open "User Management",
   **Then** I can create a new user with role admin or superuser (email +
   password), reset a user's password, and deactivate/reactivate a user.
2. **Given** I am logged in as admin (non-superuser), **When** I try to
   access "User Management", **Then** access is denied (no UI entry point;
   the backend also blocks the request).
3. **Given** a new user is created, **When** they log in, **Then** their
   role permissions are enforced immediately.

---

### User Story 6 - Location Ingestion from Telegram via Pabbly (Priority: P3)

As the system, when Pabbly forwards a Telegram message containing a location
link, I must extract and store the URL so the public app can display it.

**Why this priority**: Required for the location link feature to work, but is
a backend integration task with no direct user-facing journey.

**Independent Test**: Send a POST request with a Telegram message body
containing a single URL. Verify the route's location link is updated. Send a
message with zero or multiple URLs and verify rejection.

**Acceptance Scenarios**:

1. **Given** a POST to the van's dedicated ingestion URL, **When** the
   Telegram message text contains exactly one URL, **Then** the system stores
   it as the latest location link for that van and sets last_updated_at to now.
2. **Given** a POST to the ingestion URL, **When** the message text contains
   zero URLs or multiple URLs, **Then** the system rejects the request with an
   error and persists no changes.
3. **Given** the ingestion endpoint, **When** a request arrives without a
   valid shared secret/token, **Then** the system rejects it.
4. **Given** a POST to an ingestion URL with an unknown van identifier,
   **When** the system looks up the van, **Then** it rejects the request.

---

### Edge Cases

- What happens when a route has no schedule entries? The route is shown but
  with a "No schedule available" message instead of stop times.
- What happens when no routes exist? The home screen shows an empty state
  with a message like "No routes configured yet."
- What happens when the location link URL is invalid or unreachable? The
  system stores the URL as-is (it is the van driver's responsibility). The
  app opens whatever URL was provided.
- What happens when a superuser tries to deactivate the last remaining
  superuser? The system prevents it and shows an error to avoid lockout.
- What happens when an admin tries to save a schedule entry with an invalid
  time format? The system rejects it with a validation error.
- What happens when the user's device clock is wrong? All time comparisons
  (running status, next stop, expiry) MUST use server time in America/Bahia,
  not the client clock.
- What happens while data is loading on public pages? The system MUST show
  skeleton placeholders (not a blank screen or spinner) for the routes list
  and route detail content areas while data loads.
- What happens when a public page fails to load data? The system MUST show
  an inline error message with a retry action (e.g., "Could not load routes.
  Tap to retry."). The app MUST NOT show a blank screen or crash.
- What happens when the admin panel has no records for a given entity? The
  system MUST show an empty state with a prompt to create the first record
  (e.g., "No routes yet. Create one.").

## Navigation Model

### Public App

The public app has two levels of navigation:

1. **Home screen** — route list. This is the app entry point.
2. **Route detail** — schedule, next stop, location link CTA. Reached by
   tapping a route card on the home screen.

Announcements are accessible via a persistent tab or navigation element
visible on both home and route detail screens. The announcements view is a
separate page (not a modal or drawer).

**Fast path** (supports SC-001): Home → tap route card → route detail
(schedule + location link CTA visible without scrolling on a standard mobile
viewport). This is a **2-tap flow** from app open to location link.

**Back navigation**: Route detail MUST provide a clear back affordance
(back button or browser back) to return to the home screen. Standard browser
back behavior MUST be preserved across all public screens.

### Admin Panel

The admin panel uses a sidebar or top-level navigation with sections for:
Routes, Announcements, and User Management (superuser only). The schedule
editor is reached from within the route detail/edit view (not a top-level
section).

## Requirements *(mandatory)*

### Functional Requirements

**Public App**

- **FR-001**: System MUST display a list of all routes with their current
  status (Running / Not running) on the home screen.
- **FR-002**: A route MUST be considered "Running" only when both conditions
  are true: (a) current time is within the schedule window (between first and
  last schedule times, inclusive) AND (b) the route's van has a stored
  location link with last_updated_date equal to today (America/Bahia).
- **FR-003**: System MUST compute "Next scheduled stop" as the first schedule
  entry whose time is >= current time T (America/Bahia). If T is past the
  last entry, display "Schedule ended for now".
- **FR-004**: System MUST display the location link with a "Last updated"
  timestamp. If the link was not updated today, display "Location not updated
  today".
- **FR-005**: System MUST label schedule-based information as "Next scheduled
  stop/time" and include a prompt to check the location link for actual
  position.
- **FR-006**: System MUST display active announcements sorted by pinned
  status first, then by recency (newest-first) within each group.
- **FR-007**: System MUST hide announcements whose expiry datetime has passed
  (America/Bahia).
- **FR-008**: System MUST visually distinguish urgent announcements with
  distinct styling.

**Admin App**

- **FR-009**: System MUST authenticate admin users via email/password.
- **FR-010**: System MUST enforce two roles: admin (manage routes, schedules,
  announcements) and superuser (all admin permissions plus user management).
- **FR-011**: System MUST allow admins to create, edit, and delete routes
  (hard delete), where each route has a name and a single associated van.
- **FR-012**: System MUST allow admins to create, edit, and delete schedule
  entries, each with an HH:mm time and a stop name.
- **FR-013**: System MUST reject duplicate times within the same route
  schedule and display a validation error.
- **FR-014**: System MUST automatically sort schedule entries by time.
- **FR-015**: System MUST allow admins to create, edit, and delete (hard
  delete) announcements with title, body, pinned flag, urgent flag, and
  expiry datetime.
- **FR-016**: System MUST restrict user management (create, password reset,
  deactivate/reactivate) to superusers only — both in UI and backend.
- **FR-017**: System MUST prevent deactivation of the last active superuser.

**Location Ingestion**

- **FR-018**: System MUST provide a dedicated ingestion URL per van (e.g.,
  `/api/ingest/:vanId`). Pabbly is configured to POST each van's Telegram
  messages to its specific URL.
- **FR-019**: System MUST extract exactly one URL from the Telegram message
  text and store it as the latest location link for the van identified by the
  URL path. Messages with zero or multiple URLs MUST be rejected.
- **FR-020**: System MUST secure each ingestion endpoint with a shared
  secret/token.

**Cross-cutting**

- **FR-021**: All time comparisons, schedule evaluations, and expiry checks
  MUST use server-side time in America/Bahia timezone.
- **FR-022**: System MUST apply basic rate limiting to login and ingestion
  endpoints.
- **FR-023**: Main public pages MUST load in under 2 seconds on a mobile 4G
  connection.
- **FR-024**: All user-facing text (labels, messages, errors) MUST be in
  Portuguese (pt-BR). No multi-language support is needed for MVP.
- **FR-025**: Public pages MUST show skeleton placeholders while data loads.
  A blank screen or raw spinner is not acceptable.
- **FR-026**: Public pages MUST show an inline error message with a retry
  action when data fetching fails. The app MUST NOT show a blank screen.
- **FR-027**: Admin list views MUST show an empty state with a create prompt
  when no records exist for a given entity.
- **FR-028**: The public app MUST provide a back affordance on every screen
  below the home level. Browser back behavior MUST be preserved.
- **FR-029**: Announcements MUST be accessible via a persistent navigation
  element visible on both the home screen and the route detail screen.
- **FR-030**: All interactive elements MUST have a minimum touch target of
  44x44 CSS pixels on mobile viewports.
- **FR-031**: All text and interactive elements MUST meet WCAG 2.1 AA
  contrast ratios (4.5:1 for normal text, 3:1 for large text and UI
  components).

### Key Entities

- **Route**: A van transport route with a name and a single associated van.
  Has one schedule (ordered list of stops with times) that applies uniformly
  every day (no weekday/weekend variation).
- **Van**: Represents a physical vehicle. Has a latest location link and a
  last_updated_at timestamp. Associated with one route.
- **Schedule Entry**: A single stop in a route's schedule. Has a stop name
  and an HH:mm time. Unique time constraint per route.
- **Location Link**: The most recent live location URL for a van, with a
  last_updated_at timestamp. Overwritten on each new valid ingestion.
- **Announcement**: An operational message with title, body, pinned flag,
  urgent flag, expiry datetime, and created_at timestamp.
- **User (Admin)**: An authenticated staff member with email, password, role
  (admin or superuser), and active/deactivated status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: >= 40% of unique visitors complete the core flow (select running
  route -> view next scheduled stop/time -> open location link) within
  60 seconds.
- **SC-002**: Main public pages load in under 2 seconds on a mobile 4G
  connection.
- **SC-003**: Admins can create a route with a full schedule in under 5
  minutes.
- **SC-004**: Location link click-through rate is measurable via
  `open_location_link_clicked` event tracking.
- **SC-005**: Zero privilege escalation incidents — non-superuser admins
  cannot access user management at any point.
- **SC-006**: The optional "Did this help you decide today?" feedback collects
  responses for validation of the core hypothesis.

## Assumptions

- Van drivers reliably share a live location link in Telegram daily when a
  route is operating.
- Admins keep schedules accurate and up to date.
- Pabbly is configured to forward Telegram messages to the ingestion endpoint
  with the correct shared secret.
- The location link URLs (typically maps.app.goo.gl) are valid and open
  correctly in mobile browsers.
- An initial superuser account is bootstrapped (seeded) during deployment.
