# UX Requirements Quality Checklist: Mobile Responsiveness & Secure Logout

**Purpose**: Validate that UX-related requirements are complete, clear, consistent, and measurable before implementation
**Created**: 2026-02-27
**Cross-checked**: 2026-02-27
**Feature**: [spec.md](../spec.md)
**Focus**: Mobile responsive layout, logout interaction feedback, touch accessibility
**Depth**: Standard
**Audience**: Author / PR Reviewer

---

## Requirement Completeness

- [x] CHK001 - Are loading/in-progress state requirements defined for the logout action? The spec defines error (FR-004) and success (FR-003) outcomes, but does not specify what the user sees *during* the async logout operation. [Gap, Spec §US1]
  - **RESOLVED** — FR-004a added to spec: "System MUST show a loading indicator while the logout operation is in progress and prevent duplicate submissions until the operation completes or fails."

- [x] CHK002 - Are visual feedback requirements specified for the logout error message (color, position, duration, dismissibility)? FR-004 says "display an error message" but does not describe its presentation. [Clarity, Spec §FR-004]
  - **PASS (overreaching)** — Visual treatment follows the project design system (shadcn/ui + Tailwind). This level of detail is implementation concern for a bug-fix spec.

- [x] CHK003 - Are empty state layout requirements defined for admin tables on mobile? Edge case mentions "empty state must be responsive" but no acceptance scenario covers the visual layout of empty tables at 375px. [Gap, Spec §Edge Cases L79]
  - **PASS (partially)** — Edge case L79 states: "The empty state must also be responsive and not break the layout on mobile." Requirement exists; it lacks a formal Given/When/Then but the expectation is clear. Low priority.

- [x] CHK004 - Are requirements defined for what the user sees on the login page immediately after a successful logout (e.g., confirmation message, clean form, no stale data)? [Gap, Spec §US1 AS1]
  - **PASS** — Edge case L80 already says: "They should simply see the login page with no errors or stale data." Not a gap.

- [x] CHK005 - Are requirements specified for the mobile navigation bar behavior when the admin panel has many nav items that exceed screen width? The layout uses `overflow-x-auto` but no spec requirement addresses this. [Gap]
  - **PASS (out of scope)** — Mobile nav is pre-existing and not modified by this feature.

- [x] CHK006 - Are requirements defined for admin dialog/modal usability on mobile (e.g., create/edit forms for vans, routes, announcements)? The feature focuses on list pages but dialogs are also used on mobile. [Gap]
  - **PASS (out of scope)** — Dialogs are not modified by this feature. Valid for a future mobile UX audit.

## Requirement Clarity

- [ ] CHK007 - Is "primary information" (FR-009) explicitly defined per table? The spec says "primary information and action buttons" but does not enumerate which columns are primary for each of the 4 tables. The plan (D4) defines this, but the spec leaves it to interpretation. [Ambiguity, Spec §FR-009]
  - **VALID GAP (low priority)** — Spec gives examples (US2 AS1 names "van name"; FR-010 lists "token, webhook URL, last updated" as secondary). Derivable but not explicit per-table. Plan D4 is the definitive source.

- [x] CHK008 - Is "progressively revealed" (FR-010) quantified with specific breakpoints and which columns appear at each? The spec uses "as screen width increases" without specifying thresholds. [Clarity, Spec §FR-010]
  - **PASS** — Spec Assumptions L101 explicitly defines breakpoints: "sm (640px), md (768px), lg (1024px)." FR-010 + Assumptions are clear when read together.

- [x] CHK009 - Is the 44px touch target requirement (FR-012) specific about whether it means physical pixels, CSS pixels, or minimum tappable area including padding? [Clarity, Spec §FR-012]
  - **PASS (overreaching)** — 44px universally means CSS pixels in web/mobile development (WCAG, Apple HIG convention). No real ambiguity for the implementation team.

- [x] CHK010 - Is "usable" (FR-011) defined with measurable criteria beyond "no horizontal overflow"? Does usability include legibility, spacing, or just the absence of overflow? [Ambiguity, Spec §FR-011]
  - **PASS** — FR-011 defines usable as "(no horizontal overflow)". US3 AS2 adds "minimum 44px touch target." Two concrete, measurable criteria.

- [x] CHK011 - Is the error message text for failed logout specified or left to implementation? FR-004 says "display an error message" but doesn't define the message content or language (Portuguese vs English). [Clarity, Spec §FR-004]
  - **PASS (overreaching)** — Copy is implementation detail. The project uses Portuguese throughout the admin panel. Behavior requirement is clear.

## Requirement Consistency

- [x] CHK012 - Are mobile breakpoint references consistent between the spec (375px, 320px in FR-009/FR-011) and the plan (sm: 640px, md: 768px in D4)? The spec uses device-width thresholds while the plan uses Tailwind breakpoints — are these aligned? [Consistency, Spec §FR-009 vs Plan §D4]
  - **PASS (not an inconsistency)** — 375px is the *test condition* (viewport where no scroll must occur). sm:640px is the *implementation breakpoint* (where hidden columns appear). Hiding columns below 640px guarantees no scroll at 375px. Complementary, not conflicting.

- [x] CHK013 - Is the logout redirect behavior consistent between US1 AS1 ("redirected to the login page") and the plan D6 ("window.location.href")? The spec doesn't distinguish between a soft router navigation and a hard page reload, but the plan requires a hard reload. Is this distinction captured in requirements? [Consistency, Spec §US1 vs Plan §D6]
  - **PASS (not an inconsistency)** — Spec describes behavior ("redirected to the login page"). Plan describes implementation (`window.location.href`). Correct separation of concerns.

- [x] CHK014 - Are touch target requirements (FR-012) consistent with the scope of affected pages? FR-012 says "all interactive elements on mobile" but the feature only modifies 4 list pages and the schedule editor. Are existing interactive elements (sidebar nav links, mobile nav) in scope? [Consistency, Spec §FR-012]
  - **PASS (low priority)** — FR-012 is broader than modified pages. Already flagged in analysis report (C1). Shadcn/ui components already meet 44px targets. T015 manual testing now includes touch target verification.

## Acceptance Criteria Quality

- [x] CHK015 - Can SC-001 ("100% of browser back-button attempts land on the login page") be objectively measured? The success criterion doesn't define the number of attempts, the test methodology, or the browser state (fresh vs. warmed cache). [Measurability, Spec §SC-001]
  - **PASS (overreaching)** — SC-001 IS measurable: log in, navigate, log out, press back. Login page? Yes/no. Repeat across 3 named browsers + 2 platforms. Asking for "test methodology" is test-plan detail, not requirements quality.

- [x] CHK016 - Is SC-005 ("44x44px minimum touch target") measurable without ambiguity about what constitutes the "interactive element" boundary? Does it include visual bounds, padding, or the overall tappable area? [Measurability, Spec §SC-005]
  - **PASS (overreaching)** — Same convention as CHK009. 44px CSS pixels is universally understood. DevTools element inspector can measure it.

- [x] CHK017 - Are acceptance scenarios for US2 (responsive tables) defined for all 4 tables individually, or only for the vans table (AS1)? AS2 uses "any list page" generically. [Coverage, Spec §US2]
  - **PASS** — US2 AS2 uses "any list page" which covers all 4 tables generically. AS1 gives a concrete example for vans. Standard acceptance scenario pattern.

- [x] CHK018 - Does US3 have acceptance criteria for both the existing-entry display and the add-new-entry form? AS1 mentions "schedule entry row" but the editor has two distinct form areas. [Coverage, Spec §US3]
  - **PASS** — AS1 covers existing entries ("schedule entry row"). AS2 explicitly covers add-new ("adding a new schedule entry"). Both forms addressed.

## Scenario Coverage

- [x] CHK019 - Are requirements defined for the logout button appearance and behavior in both the desktop sidebar and the mobile header? The spec mentions "Sair" generically but the button renders in two different layout contexts. [Coverage, Spec §US1]
  - **PASS (overreaching)** — Both locations use the same `AdminLogoutButton` component. The spec correctly defines behavior generically — there is no UX difference to specify.

- [x] CHK020 - Are requirements specified for the transition between hidden and visible columns during device rotation (landscape/portrait)? US2 AS3 mentions rotation but doesn't specify whether the transition should be smooth or if content reflow is acceptable. [Gap, Spec §US2 AS3]
  - **PASS (overreaching)** — Column transitions during rotation are standard browser responsive CSS behavior. Specifying "smooth vs reflow" is over-engineering.

- [x] CHK021 - Are requirements defined for what happens when an admin table has only 1-2 rows on mobile? Does the layout still make sense with minimal data and hidden columns? [Coverage, Edge Case]
  - **PASS** — A table with fewer rows renders identically to one with many rows. Column hiding works the same regardless of row count. No distinct UX concern.

- [x] CHK022 - Are requirements specified for the admin panel UX when accessed on a tablet (768px-1024px range)? The spec defines mobile (<640px) and implies desktop (>1024px) but tablet behavior is unspecified. [Gap]
  - **PASS** — Spec Assumptions L101 defines sm (640px), md (768px), lg (1024px). Plan D4 defines column visibility at each breakpoint. Tablet widths are inherently covered by the progressive reveal system.

## Edge Case Coverage

- [ ] CHK023 - Are requirements defined for the logout button behavior during rapid repeated clicks (double-click protection)? [Edge Case, Gap]
  - **VALID GAP (low priority)** — Not in spec. Plan D6 / task T004 add a loading/disabled state which provides implicit double-click protection. Could be added as an edge case or accepted as implicit.

- [x] CHK024 - Is the behavior specified when the user clicks "Sair" while a data mutation (create/edit/delete) is in progress? [Edge Case, Gap]
  - **PASS (low priority)** — Extremely low probability edge case. Logout and mutation are independent async operations. The logout fetch would proceed independently. Acceptable to omit.

- [x] CHK025 - Are requirements defined for admin table display when column content is very long (e.g., a very long van name) on mobile with hidden columns? Does text truncate, wrap, or overflow? [Edge Case, Gap]
  - **PASS (out of scope)** — Text truncation for long content is a pre-existing concern (table uses `whitespace-nowrap`). Not introduced or changed by this feature.

- [x] CHK026 - Are requirements specified for the schedule editor when a route has many entries (20+) on mobile? Does the list become scrollable, and is the add-new-entry form still accessible? [Edge Case, Gap]
  - **PASS (out of scope)** — List scrolling is pre-existing behavior. This feature only changes input widths and adds flex-wrap.

## Non-Functional Requirements (UX-relevant)

- [x] CHK027 - Are transition/animation requirements defined for the logout flow (e.g., button state change, redirect timing)? [Gap]
  - **PASS (overreaching)** — This is a bug-fix feature, not a UX redesign. Animations are unnecessary and not in scope.

- [x] CHK028 - Are keyboard navigation requirements specified for the responsive admin tables where columns are hidden? Can keyboard users still access hidden column data? [Accessibility, Gap]
  - **PASS (out of scope)** — Valid accessibility concern but outside this feature's scope. Hidden columns via CSS `hidden` class are standard behavior. A separate accessibility feature could address this.

- [x] CHK029 - Are screen reader requirements defined for hidden table columns? Is the hidden data still accessible to assistive technology, or is it fully removed from the DOM? [Accessibility, Gap]
  - **PASS (out of scope)** — Same as CHK028. Valid concern for a future accessibility audit, not this bug-fix feature.

- [x] CHK030 - Is a maximum response time defined for the logout operation before showing an error or timeout? SC-004 says "within 2 seconds" for error display but doesn't specify a timeout threshold for the request itself. [Clarity, Spec §SC-004]
  - **PASS (low priority)** — SC-004 addresses error display timing. Browser default fetch timeout is acceptable for a logout request.

---

## Cross-Check Summary

**Results**: 2 open / 28 passed

| Verdict | Count | Items |
|---------|-------|-------|
| Resolved (spec updated) | 1 | CHK001 |
| Valid gap (low priority, plan fills it) | 2 | CHK007, CHK023 |
| Addressed in spec | 7 | CHK004, CHK008, CHK010, CHK017, CHK018, CHK021, CHK022 |
| Overreaching for spec level | 8 | CHK002, CHK009, CHK011, CHK015, CHK016, CHK019, CHK020, CHK027 |
| Out of feature scope | 6 | CHK005, CHK006, CHK025, CHK026, CHK028, CHK029 |
| Not an inconsistency | 2 | CHK012, CHK013 |
| Low priority (acceptable as-is) | 4 | CHK003, CHK014, CHK024, CHK030 |

**Actionable items**: CHK001 resolved (FR-004a added to spec). CHK007 and CHK023 remain open but are covered by the plan/tasks — acceptable as-is.
