# UX Requirements Quality Checklist: MVP Vans Dashboard

**Purpose**: Validate completeness, clarity, and consistency of UX requirements across public app and admin panel
**Created**: 2026-02-26
**Feature**: [spec.md](../spec.md)
**Scope**: Public member app + Admin panel (both surfaces)
**Depth**: Standard, with accessibility as primary focus
**Cross-check**: 2026-02-26 — 11 pass, 5 partial, 32 fail (after Tier 1 fixes)

## Visual & Layout Completeness

- [ ] CHK001 Are mobile viewport/breakpoint requirements defined for the public app? [Gap]
  > FAIL — Spec says "mobile-first" (header) and FR-023 targets "<2s on mobile 4G" but no viewport or breakpoint requirements are defined.

- [ ] CHK002 Is the visual hierarchy between "Running" and "Not running" route status specified with measurable criteria (color, icon, sizing)? [Completeness, Spec §FR-001]
  > FAIL — FR-001 states "display a list of all routes with their current status (Running / Not running)" but provides no visual criteria (color, icon, badge shape, sizing).

- [ ] CHK003 Is "distinct styling" for urgent announcements quantified with specific visual properties? [Clarity, Spec §FR-008]
  > FAIL — FR-008 says "visually distinguish urgent announcements with distinct styling" — vague. No color, border, icon, or sizing defined.

- [ ] CHK004 Is the visual differentiation for pinned vs non-pinned announcements defined? [Clarity, Spec §FR-006]
  > FAIL — FR-006 defines sort order (pinned first) but no visual indicator to distinguish pinned items from non-pinned.

- [ ] CHK005 Are route list card/item layout requirements specified (what information appears, visual weight)? [Gap]
  > FAIL — US1 and FR-001 imply route name + status appear, but no layout spec for what a route card/item contains or its visual structure.

- [ ] CHK006 Is the "Open location link" CTA sizing and prominence defined relative to other route detail elements? [Clarity, Spec §US2]
  > PARTIAL — US2 calls it a "primary CTA" which signals design intent (highest visual weight), but no sizing, color, or positioning specified.

- [ ] CHK007 Are typography hierarchy requirements documented for route names, stop names, times, and status labels? [Gap]
  > FAIL — No typography requirements anywhere in the spec. Constitution locks Inter font but spec has no hierarchy rules.

- [ ] CHK008 Are admin panel form layout requirements specified for route, schedule, and announcement CRUD? [Gap]
  > FAIL — US4 defines which fields exist (route name, van, HH:mm, stop name, etc.) but no form layout, field grouping, or interaction patterns.

- [ ] CHK009 Is the schedule editor interaction model defined (inline editing, modal, separate page)? [Gap]
  > FAIL — US4 says "route schedule editor" and "add/edit/remove schedule entries" but no interaction model (inline table, modal, separate page).

## Navigation & Interaction

- [x] CHK010 Is the navigation model between home → route detail → announcements explicitly documented? [Gap]
  > PASS — New §Navigation Model defines two-level hierarchy (home → route detail), announcements as persistent nav element, and admin sidebar structure.

- [x] CHK011 Is the "fast path" (route list → route detail → open location link) documented with specific interaction steps to support SC-001? [Completeness, Spec §SC-001]
  > PASS — §Navigation Model defines "2-tap flow" from app open to location link, with schedule + CTA visible without scrolling on standard mobile viewport.

- [ ] CHK012 Is the route selection interaction specified (tap target area, visual feedback on tap)? [Gap]
  > PARTIAL — US1 Independent Test mentions "tap a route" but no tap target area, press state, or visual feedback is specified.

- [x] CHK013 Are back-navigation requirements defined for route detail and announcements? [Gap]
  > PASS — FR-028 requires a back affordance on every screen below home level and preservation of browser back behavior.

- [x] CHK014 Are admin panel navigation requirements between CRUD sections documented? [Gap]
  > PASS — §Navigation Model (Admin Panel) defines sidebar/top-level nav with Routes, Announcements, User Management sections. Schedule editor is within route detail/edit.

- [x] CHK015 Is the announcements entry point specified (tab, separate page, inline section)? [Gap]
  > PASS — §Navigation Model specifies persistent tab/nav element on both home and route detail; announcements is a separate page (not modal or drawer). FR-029 formalizes this.

## Status & Feedback Clarity

- [ ] CHK016 Is "Schedule ended for now" message placement and styling specified? [Clarity, Spec §FR-003]
  > FAIL — FR-003 defines the text string but not where it appears on the route detail page or how it's styled.

- [ ] CHK017 Is "Location not updated today" warning styling and positioning relative to the location CTA defined? [Clarity, Spec §FR-004]
  > FAIL — FR-004 defines the text and trigger condition but not its visual treatment or proximity to the CTA.

- [ ] CHK018 Is the "Last updated" timestamp format specified (relative time vs absolute datetime)? [Clarity, Spec §FR-004]
  > PARTIAL — Constitution mandates "HH:mm format in America/Bahia" for displayed times. FR-004 says "Last updated: <date/time>". Time format is constrained but the full format (date + time? relative like "5 min ago"?) is not.

- [ ] CHK019 Is the "Next scheduled stop/time" label layout defined relative to the disclaimer text? [Clarity, Spec §FR-005]
  > FAIL — FR-005 says include the label and the disclaimer ("Check the location link for the actual position") but no layout relationship (proximity, sizing, visual weight).

- [ ] CHK020 Are admin form validation error message presentation requirements specified (inline, toast, banner)? [Clarity, Spec §FR-013]
  > FAIL — FR-013 and Edge Cases say "display a validation error" and "rejects it with a validation error" but no presentation pattern (inline field error, toast, banner).

- [ ] CHK021 Is the login error feedback defined for different failure modes (wrong credentials, deactivated account)? [Gap, Spec §FR-009]
  > FAIL — FR-009 says "authenticate admin users via email/password" but no error feedback defined for wrong password, unknown email, or deactivated account.

- [ ] CHK022 Is user-facing feedback defined when rate limiting is triggered on login? [Gap, Spec §FR-022]
  > FAIL — FR-022 says "apply basic rate limiting to login and ingestion endpoints" but no user-facing message defined for blocked requests.

## Empty, Loading & Error States

- [x] CHK023 Are loading state requirements defined for the routes list (skeleton, spinner, or other pattern)? [Gap]
  > PASS — FR-025 requires skeleton placeholders while data loads on public pages. Blank screen and raw spinner explicitly disallowed.

- [x] CHK024 Are loading state requirements defined for route detail data? [Gap]
  > PASS — FR-025 covers all public pages including route detail.

- [ ] CHK025 Is the "No routes configured yet" empty state visually specified? [Completeness, Spec §Edge Cases]
  > PARTIAL — Edge Cases define the text ("No routes configured yet") and behavior (empty state shown), but no visual treatment (icon, illustration, layout).

- [ ] CHK026 Is the "No schedule available" empty state visually specified? [Completeness, Spec §Edge Cases]
  > PARTIAL — Edge Cases define the text ("No schedule available") but no visual treatment.

- [ ] CHK027 Is the "No announcements right now" empty state visually specified? [Completeness, Spec §Edge Cases]
  > PARTIAL — US3 scenario 5 defines the text but no visual treatment.

- [x] CHK028 Are error state requirements defined when data fetching fails on public pages? [Gap]
  > PASS — FR-026 requires inline error message with retry action on data fetch failure. Blank screen explicitly disallowed.

- [x] CHK029 Are admin panel empty states defined for entities with no records (no routes, no announcements)? [Gap]
  > PASS — FR-027 requires empty state with create prompt when no records exist for a given entity.

## Accessibility (Primary Focus)

- [x] CHK030 Are minimum touch target sizes specified for mobile (e.g., 44x44px per WCAG 2.5.8)? [Gap]
  > PASS — FR-030 requires all interactive elements to have a minimum touch target of 44x44 CSS pixels on mobile viewports.

- [x] CHK031 Are color contrast ratio requirements defined with a specific WCAG level (AA or AAA)? [Gap]
  > PASS — FR-031 requires WCAG 2.1 AA contrast ratios (4.5:1 normal text, 3:1 large text and UI components).

- [ ] CHK032 Are requirements defined for conveying Running/Not running status through means beyond color alone (icon, text, pattern)? [Gap, Spec §FR-001]
  > FAIL — FR-001 shows status as text strings ("Running" / "Not running") which technically satisfies this via text, but no explicit multi-modal requirement exists. Text strings may be sufficient if always displayed alongside any color coding.

- [ ] CHK033 Are screen reader requirements specified for route status indicators? [Gap]
  > FAIL — No screen reader or assistive technology requirements anywhere in spec.

- [ ] CHK034 Are focus indicator requirements defined for all interactive elements? [Gap]
  > FAIL — No focus indicator requirements. Relevant for admin panel keyboard users.

- [ ] CHK035 Is semantic heading hierarchy documented for public and admin pages? [Gap]
  > FAIL — PRD mentions "semantic structure" but spec has no heading hierarchy defined.

- [ ] CHK036 Are keyboard navigation requirements defined for admin panel forms and lists? [Gap]
  > FAIL — No keyboard navigation requirements for admin panel.

- [ ] CHK037 Are text scaling/zoom requirements specified (up to 200% without horizontal scroll)? [Gap]
  > FAIL — No text scaling or zoom requirements.

- [ ] CHK038 Are ARIA live region requirements specified for dynamic content (next scheduled stop updates, countdown timers)? [Gap]
  > FAIL — No ARIA requirements. Constitution allows UI countdown timers but spec doesn't address how dynamic updates are announced to assistive tech.

- [ ] CHK039 Is the reading order for the announcement list specified for assistive technology (pinned first, then recency)? [Completeness, Spec §FR-006]
  > PARTIAL — FR-006 defines visual sort order (pinned first, newest-first) which implicitly sets DOM/reading order, but no explicit assistive technology requirement.

## Consistency Across Surfaces

- [ ] CHK040 Are form field patterns (input types, labels, validation feedback) consistent between route, schedule, and announcement CRUD? [Consistency]
  > FAIL — No form patterns defined for any admin CRUD. Consistency cannot be assessed when neither surface has form requirements.

- [ ] CHK041 Are Running/Not running status badge requirements consistent between route list and route detail views? [Consistency, Spec §FR-001]
  > FAIL — FR-001 defines status on the home screen. Route detail page (US1/US2) doesn't explicitly re-state whether or how status appears. Possible inconsistency risk.

- [ ] CHK042 Is the timestamp display format consistent between location link "Last updated" and announcement dates? [Consistency]
  > FAIL — FR-004 mentions "Last updated: <date/time>" for location. Announcements have "newest-first" ordering but no visible timestamp format defined. Cannot assess consistency.

- [ ] CHK043 Are button/CTA hierarchy and styling requirements consistent across public and admin surfaces? [Consistency]
  > FAIL — US2 defines "primary CTA" for location link. No other CTA hierarchy defined for public or admin surfaces.

## Edge Case UX Scenarios

- [ ] CHK044 Are requirements defined for text overflow behavior on long route names or announcement titles? [Edge Case, Gap]
  > FAIL — No text overflow, truncation, or wrapping requirements.

- [ ] CHK045 Are scrolling/pagination requirements defined for routes with many schedule entries? [Edge Case, Gap]
  > FAIL — No scrolling or pagination requirements for schedule lists or any list view.

- [ ] CHK046 Is the "Did this help you decide today?" prompt placement, timing, and dismissal behavior specified? [Completeness, Spec §SC-006]
  > FAIL — SC-006 says the feedback "collects responses" but no UX defined: when it appears, where, how to dismiss, frequency.

- [ ] CHK047 Are admin session timeout/expiry UX requirements defined? [Gap]
  > FAIL — No session management UX requirements. What happens when an admin session expires mid-edit?

- [ ] CHK048 Are requirements defined for how quickly the UI reflects status changes at schedule boundary times? [Edge Case, Spec §FR-002]
  > FAIL — Constitution says BFF computes status and UI may run local countdown timers. But no refresh interval or staleness tolerance defined in spec.

## Notes

- **Results (after Tier 1 fixes)**: 11 pass / 5 partial / 32 fail
- **Tier 1 gaps addressed**: Navigation model (§Navigation Model + FR-028/029),
  loading/error states (FR-025/026/027), a11y baselines (FR-030/031)
- Remaining FAILs are Tier 2 (visual treatment, form patterns, feedback
  styling) and Tier 3 (typography, overflow, session timeout) — these are
  expected at spec stage and can be resolved during planning or implementation
- Items marked PARTIAL have some coverage but need more precision
- Items marked FAIL are either completely absent or too vague to implement
