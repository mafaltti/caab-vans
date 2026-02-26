<!-- project-documentation/product-manager-output.md -->

# Vans CAAB — MVP PRD

**Date:** 2026-02-25

## 1. Executive Summary
- **Elevator Pitch (≤20 words):** Mobile web app to see running CAAB van routes, next scheduled stop/time, announcements, and a live location link.
- **Problem Statement (2-3 sentences):** CAAB members struggle to quickly decide where/when to catch a van because operational info is fragmented. They need a single place to confirm which routes are running, the next scheduled stop/time, and access the van’s live location link.
- **Target User:** CAAB members (lawyers and trainees/estagiários) planning their commute using CAAB’s free transport.
- **Proposed Solution (1-2 sentences):** A public, mobile-friendly web app listing routes with inferred running status, fixed schedules per route, operational announcements, and a “live” location link shared daily.
- **MVP Success Metric (quantifiable):** **≥40%** of unique visitors complete “Select running route → view next scheduled stop/time → open location link” within **≤60 seconds**.

## 2. Key Features

### Feature 1: Route Status + Next Scheduled Stop/Time (Fixed Schedule)
- **User Story:** As a CAAB member, I want to see which routes are running and the next scheduled stop/time, so I can decide where/when to catch the van.
- **Acceptance Criteria:**
  - **Given** the home screen, **when** I open the app, **then** I see a list of routes with status **Running** / **Not running**.
  - **Given** a route detail page, **when** I view the schedule, **then** I see an ordered list of stops with times (HH:mm).
  - **Given** a route schedule and current time `T` (America/Bahia), **when** there exists a schedule entry with time **≥ T**, **then** “Next scheduled stop” is the **first** entry whose time is **≥ T**.
  - **Given** `T` is after the last schedule entry, **when** I view the route, **then** the UI shows “Schedule ended for now”.
  - **Given** this is a schedule-based estimate, **when** the UI displays the next stop/time, **then** it is labeled **“Next scheduled stop/time”** and includes a note: **“Check the location link for the actual position.”**
- **Priority:** **P0** — Core decision-making flow.
- **Dependencies / Risks (max 3):**
  - Schedules may not match reality during delays; UX must avoid overclaiming.
  - Correct timezone handling (America/Bahia).
  - Schedule data must be accurate and maintained (trust risk).

### Feature 2: Live Location Link (Last Shared Today) + Timestamp
- **User Story:** As a CAAB member, I want to open the van’s live location link, so I can see where it actually is right now.
- **Acceptance Criteria:**
  - **Given** a route has a stored location link, **when** I open route details, **then** I see:
    - “Last updated: <date/time>”
    - a primary CTA “Open location link” that opens the stored URL.
  - **Given** the stored link timestamp date is not **today** (America/Bahia), **when** I view the route, **then** I see “Location not updated today”.
  - **Given** multiple updates arrive in a day, **when** I view the route, **then** the stored link is the **latest** (overwrite).
- **Priority:** **P0** — Enables real-world confirmation via the live link.
- **Dependencies / Risks (max 3):**
  - If link not shared today, route will be Not running (strict rule).
  - Ingestion reliability (Pabbly → API).
  - Users may still interpret the app as “real-time tracking”; UI must stay precise.

### Feature 3: Operational Announcements (Pinned/Urgent + Expiry)
- **User Story:** As a CAAB member, I want to see operational announcements, so I can adapt to changes or interruptions.
- **Acceptance Criteria:**
  - **Given** announcements exist, **when** I open announcements, **then** I see newest-first.
  - **Given** some announcements are **pinned**, **when** I view the list, **then** pinned items appear **above** non-pinned items.
  - **Given** an announcement is marked **urgent**, **when** it is displayed, **then** it has distinct styling (but ordering is controlled by pinned + recency).
  - **Given** an announcement has an **expiry datetime**, **when** current time is after expiry (America/Bahia), **then** it does not appear in the public app.
  - **Given** there are no active announcements, **when** I open announcements, **then** I see “No announcements right now”.
- **Priority:** **P1** — Useful, but secondary to route decision flow.
- **Dependencies / Risks (max 3):**
  - Needs lightweight operational discipline to keep posts relevant.
  - Expiry behavior must be clear to admins.
  - Too many announcements can create noise.

### Feature 4: Admin Panel (Multi-admin Email/Password) — CRUD Routes/Schedules/Stops, Announcements, Admin Users
- **User Story:** As a transport manager/admin, I want to maintain routes, schedules, announcements, and admin accounts, so the public app stays correct.
- **Acceptance Criteria:**
  - **Auth**
    - **Given** the admin panel, **when** I log in with email/password, **then** I can access admin features.
  - **Admin Users**
    - **Given** I am an authenticated admin, **when** I create another admin user (email + password), **then** that user can log in.
  - **Routes**
    - **Given** the routes area, **when** I create/edit a route, **then** I can set route name and its single associated `van_id`.
  - **Schedules**
    - **Given** a route schedule editor, **when** I add/edit/remove schedule entries, **then** each entry has `HH:mm` + stop name.
    - **Given** I attempt to save duplicate times in the same route schedule, **when** I save, **then** I get a validation error and nothing is persisted.
    - **Given** schedule entries are saved, **when** the schedule is displayed, **then** it is ordered by time (system sorts automatically to support easy insertion).
  - **Announcements**
    - **Given** announcements CRUD, **when** I create/edit an announcement, **then** I can set: title, body, pinned (bool), urgent (bool), expiry datetime.
- **Priority:** **P0** — Required to operate the system.
- **Dependencies / Risks (max 3):**
  - Account creation adds risk surface; keep minimal (no roles beyond admin).
  - Admin UX must be fast and mistake-resistant (time validation).
  - Security basics must be solid (password storage, brute force protection).

## 3. Requirements Overview

### Functional (core flows only)
- **Public App**
  - Home: list routes with status Running/Not running.
  - Route detail: schedule list, computed next scheduled stop/time, open live location link, last updated timestamp, stale warning.
  - Announcements: list active announcements with pinned/urgent/expiry rules.
- **Admin App**
  - Email/password login.
  - Admin user creation (email/password).
  - CRUD routes (name, `van_id`).
  - CRUD schedule entries (HH:mm + stop; no duplicates; auto-sorted).
  - CRUD announcements (title/body/pinned/urgent/expiry).
- **Location Ingestion API**
  - Receives full Telegram message text (from Pabbly), extracts URL, overwrites latest location link for the van/route.

### Integration points (if any)
- **Pabbly → API:** posts Telegram message text containing the link.
- **External location provider:** open stored URL in browser (commonly maps.app.goo.gl).

### Non-Functional (MVP-critical only)
- **Performance:** main pages load in **<2s on mobile (4G)**.
- **Security basics:**
  - Admin auth with secure password hashing.
  - API ingestion secured with shared secret/token.
  - Basic rate limiting for login + ingestion endpoints.
- **Accessibility minimums:** mobile tap targets, semantic structure, acceptable contrast.

### UX Requirements (brief)
- **Intended experience:** “In under a minute, confirm a route is running, see the next scheduled stop/time, and open the live location link.”
- **Two must-have UX principles:**
  1. **Truthful labeling:** “Next scheduled stop/time” (planned) + prompt to check location for reality.
  2. **Fast path:** routes list → route detail → primary CTA (“Open location link”).

## 4. Validation Plan
- **Core Hypothesis:** If members can see running routes, the next scheduled stop/time, and a live location link in one place, they can make better catch decisions.
- **Key Assumption:** “Running” inferred by (today link + schedule window) matches how operations behave and is acceptable even if a driver forgets to share.
- **Next Step:** Controlled release (QR at stops + internal comms) with event tracking:
  - `route_selected`
  - `next_scheduled_stop_viewed`
  - `open_location_link_clicked`
  - `time_to_complete_core_flow`
  - optional 1-tap: “Did this help you decide today?” (yes/no)

## 5. Critical Questions Checklist
1. **Who is the primary user and what is the one job-to-be-done?**  
   CAAB members deciding where/when to catch a van today.

2. **What is the smallest lovable outcome we must deliver?**  
   Show which routes are running, compute next scheduled stop/time, and provide a live location link with timestamp.

3. **What will we measure to know the MVP works?**  
   ≥40% complete the core flow in ≤60s; location-link click-through and usefulness feedback.

4. **What must be true for this to succeed (biggest assumption)?**  
   Admins keep schedules accurate and drivers share a link daily when a route is operating.

5. **What are the main risks that could invalidate the MVP?**  
   Missing link updates cause “Not running” even when running; schedule delays reduce trust; ingestion failures.

## MVP Decision Rules (Explicit)

### Timezone
- All “today”, schedule comparisons, and expiry evaluation use **America/Bahia**.

### Next scheduled stop/time rule
- For current time `T`, “Next scheduled stop” = the **first** schedule entry with time **≥ T**.
- If `T` is after the last schedule entry time, show “Schedule ended for now”.

### Running / Not running rule (Q1 = C)
A route is **Running** only if **all** are true:
1) Current time `T` is **within the schedule window** (between first and last schedule times, inclusive), AND  
2) The route’s associated van has a stored location link with `last_updated_date == today`.

Otherwise it is **Not running** (including before first time, after last time, or link not updated today).

### Location ingestion rule (Telegram text, Q4 = reject)
- API receives full Telegram message text.
- If the text contains **exactly one** URL, store it as the latest location link (overwrite) and set `last_updated_at = now`.
- If the text contains **zero** URLs or **multiple** URLs, reject with an error (no changes persisted).

### Announcement display rules
- Show only announcements where `now <= expiry_datetime`.
- Sort: pinned announcements first; within pinned and non-pinned groups, newest-first.
- Urgent affects styling only (does not override pin/recency ordering).