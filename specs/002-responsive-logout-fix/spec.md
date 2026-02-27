# Feature Specification: Mobile Responsiveness & Secure Logout

**Feature Branch**: `002-responsive-logout-fix`
**Created**: 2026-02-27
**Status**: Draft
**Input**: User description: "Fix mobile responsiveness issues across the application and fix the broken logout flow where clicking 'Sair' does not fully log the user out, allowing browser back-button access to authenticated pages."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure Logout (Priority: P1)

As an admin user, when I click "Sair" (logout), my session must be fully terminated so that I cannot return to any authenticated page using the browser back button, bookmarks, or direct URL entry.

**Why this priority**: This is a security vulnerability. An incomplete logout allows unauthorized access to the admin panel from a shared or public device. Fixing this is critical before any UX improvements.

**Independent Test**: Can be fully tested by logging in as an admin, navigating to several admin pages, clicking "Sair", then pressing the browser back button and verifying that the user is redirected to the login page instead of seeing cached authenticated content.

**Acceptance Scenarios**:

1. **Given** an authenticated admin on any admin page, **When** they click "Sair", **Then** the session is fully invalidated (both client-side and server-side), all authentication cookies are cleared, and the user is redirected to the login page.
2. **Given** a user who just logged out, **When** they press the browser back button, **Then** they see the login page (not a cached version of the previous authenticated page).
3. **Given** a user who just logged out, **When** they manually type or paste a protected admin URL in the browser, **Then** they are redirected to the login page.
4. **Given** a user who just logged out, **When** the logout operation itself fails (e.g., network error), **Then** they see an error message and remain on the current page (not silently redirected to login with a still-valid session).

---

### User Story 2 - Admin Tables Readable on Mobile (Priority: P2)

As an admin using a mobile device, I need to be able to view and interact with admin list pages (vans, routes, announcements, users) without excessive horizontal scrolling that makes the content unusable.

**Why this priority**: Admin tables are the primary way administrators manage the system. If they cannot read or interact with these tables on mobile, the admin panel is effectively unusable on phones.

**Independent Test**: Can be fully tested by opening each admin list page on a 375px-wide viewport and verifying that key information is visible and action buttons are reachable without horizontal scrolling.

**Acceptance Scenarios**:

1. **Given** an admin on the vans list page using a 375px-wide screen, **When** the page loads, **Then** the van name and action buttons are visible without horizontal scrolling.
2. **Given** an admin on any list page using a mobile device, **When** they view the table, **Then** secondary columns (e.g., token, webhook URL, last updated) are either hidden or accessible via an alternate layout, and the primary column and actions remain visible.
3. **Given** an admin on a list page in landscape orientation, **When** they rotate the device, **Then** additional columns become visible and the layout adapts to use the available width.

---

### User Story 3 - Schedule Editor Usable on Mobile (Priority: P3)

As an admin editing route schedules on a mobile device, I need the schedule entry form to be usable without content overflowing off-screen.

**Why this priority**: Schedule editing is a key admin workflow. Fixed-width inputs that overflow on small screens make this task frustrating or impossible on mobile.

**Independent Test**: Can be fully tested by opening the schedule editor on a 320px-wide viewport and verifying that all inputs (time, stop name) and action buttons are accessible without horizontal scrolling.

**Acceptance Scenarios**:

1. **Given** an admin editing a schedule on a screen narrower than 360px, **When** they view a schedule entry row, **Then** all form elements (time input, stop name, action buttons) are accessible without horizontal overflow.
2. **Given** an admin adding a new schedule entry on mobile, **When** they interact with the time input, **Then** the input is large enough to tap accurately (minimum 44px touch target).

---

### User Story 4 - Protected Pages Prevent Stale Access (Priority: P2)

As a system, authenticated admin pages must not be served from browser cache after the session ends, ensuring that sensitive data is never displayed to an unauthenticated user.

**Why this priority**: This is a complementary security measure to the logout fix. Even if the logout clears the session correctly, cached pages can still expose sensitive data.

**Independent Test**: Can be fully tested by logging in, navigating to admin pages, logging out, then using the browser back button and verifying the browser fetches a fresh response from the server (resulting in a redirect to login).

**Acceptance Scenarios**:

1. **Given** any protected admin page, **When** the server responds, **Then** the response includes cache-control headers that instruct the browser not to cache the page.
2. **Given** any protected admin API endpoint, **When** the server responds with data, **Then** the response includes cache-control headers that prevent browser caching of sensitive data.
3. **Given** an authenticated admin viewing a page, **When** their session expires while viewing the page, **Then** any subsequent data fetch from the page detects the 401 status and redirects the user to the login page.

---

### Edge Cases

- What happens if the user has multiple admin tabs open and logs out from one? All tabs should detect the session is gone upon their next interaction (e.g., data fetch or navigation) and redirect to login.
- What happens if the logout request fails due to a network error? The user should see an error message and not be redirected to login (preserving the still-valid session).
- What happens on devices with screen widths below 320px (e.g., Galaxy Fold folded state)? Content should remain functional, even if not optimally laid out.
- What happens when admin tables have zero rows? The empty state must also be responsive and not break the layout on mobile.
- What happens if the user refreshes the login page after a successful logout? They should simply see the login page with no errors or stale data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST fully invalidate the user session on both client and server when the user clicks "Sair" (logout).
- **FR-002**: System MUST clear all authentication cookies and tokens during the logout process.
- **FR-003**: System MUST redirect the user to the login page after a successful logout.
- **FR-004**: System MUST display an error message if the logout operation fails, without redirecting the user.
- **FR-004a**: System MUST show a loading indicator while the logout operation is in progress and prevent duplicate submissions until the operation completes or fails.
- **FR-005**: System MUST include cache-control response headers on all protected admin pages that prevent browser caching.
- **FR-006**: System MUST include cache-control response headers on all protected admin API responses that prevent browser caching.
- **FR-007**: System MUST redirect unauthenticated users to the login page when they attempt to access any protected admin route (including via browser back button).
- **FR-008**: Protected admin pages MUST detect unauthorized (401) API responses and redirect the user to the login page.
- **FR-009**: Admin list tables (vans, routes, announcements, users) MUST display primary information and action buttons without requiring horizontal scrolling on screens 375px wide and above.
- **FR-010**: Secondary table columns (e.g., token, webhook URL, last updated timestamp) MUST be progressively revealed as screen width increases, hidden on the smallest screens.
- **FR-011**: The schedule editor form MUST remain usable (no horizontal overflow) on screens 320px wide and above.
- **FR-012**: All interactive elements on mobile MUST meet a minimum touch target size of 44x44 pixels.

### Assumptions

- The application's primary mobile breakpoints follow Tailwind CSS defaults: `sm` (640px), `md` (768px), `lg` (1024px).
- The admin panel is used on mobile occasionally (e.g., quick checks on the go) rather than as the primary interface, so a functional-but-simplified mobile layout is acceptable over a fully optimized mobile-first design.
- The public-facing pages (dashboard) already have reasonable mobile behavior (max-w-lg container, bottom nav). This feature focuses on the admin panel and the logout flow.
- Standard browser cache-control headers (`no-store, no-cache, must-revalidate`) are sufficient to prevent back-button access on modern browsers (Chrome, Safari, Firefox, Edge).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After clicking "Sair", 100% of browser back-button attempts land on the login page (not a cached admin page), tested across Chrome, Safari, and Firefox on both desktop and mobile.
- **SC-002**: All four admin list pages (vans, routes, announcements, users) display their primary column and action buttons without horizontal scrolling on a 375px-wide viewport.
- **SC-003**: The schedule editor does not produce horizontal overflow on a 320px-wide viewport.
- **SC-004**: A failed logout attempt shows a visible error message to the user within 2 seconds.
- **SC-005**: All interactive elements on admin pages meet the 44x44px minimum touch target on mobile viewports.
