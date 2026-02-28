# Tasks: Public UX Alignment

**Input**: Design documents from `/specs/006-public-ux-alignment/`
**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: Not requested — visual verification only via quality gates.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Enable safe-area support required by US4

- [x] T001 Add `viewport` export with `viewportFit: "cover"` to `src/app/layout.tsx` (enables `env(safe-area-inset-bottom)` on notched devices — see research.md R5)

---

## Phase 2: User Story 1 — Polished Route List View (Priority: P1) MVP

**Goal**: Route cards use shadcn Card component, active indicator uses icon color (not left border), next stop area has hover effect, typography matches reference scale.

**Independent Test**: Open the home page, verify card components with shadows, no left emerald border on active routes, blue hover tint on next stop area, dark medium-weight time text without clock icon, `text-2xl` page title, `text-lg` route names.

### Implementation for User Story 1

- [x] T002 [P] [US1] Update route card component in `src/components/public/route-card.tsx`:
  - Import `Card`, `CardContent` from `@/components/ui/card`
  - Replace outer `motion.div` wrapper with `Card` (override padding with `p-0`, keep `rounded-2xl shadow-sm border-zinc-100 hover:shadow-md`), wrap inner content with `CardContent` (override padding with `p-4`)
  - Remove `border-l-4 border-l-emerald-500` conditional class for active routes (FR-002)
  - Add `group-hover:bg-blue-50/50 transition-colors` to the next stop `div.rounded-xl.bg-zinc-50` area (FR-003)
  - Remove `Clock` icon import and its usage from the next stop time row (FR-004)
  - Change next stop time from `font-mono text-zinc-500` to `font-medium text-zinc-900` (FR-004)
  - Change route name `h2` from `text-base` to `text-lg` (FR-021)
- [x] T003 [P] [US1] Update home page title in `src/app/(public)/page.tsx`:
  - Change all `<h1>` elements from `text-xl` to `text-2xl` (FR-020) — applies to loading, error, and success states

**Checkpoint**: Home page route list matches reference design. Cards use shadcn component, no left border, hover effects work, typography scaled up.

---

## Phase 3: User Story 2 — Refined Route Detail View (Priority: P1)

**Goal**: Back button uses shadcn ghost Button, hero card CTA is full-width white, timeline nodes have proper borders/shadows/hover, section title is bold.

**Independent Test**: Navigate to any route detail page, verify ghost round back button, full-width white location button, bounce animation on nav icon, centered timestamp, current/future/past nodes match reference, bold "Horarios" title, shadcn "Ver paradas" button, row separators.

### Implementation for User Story 2

- [x] T004 [P] [US2] Update hero card component in `src/components/public/hero-card.tsx`:
  - Import `Button` from `@/components/ui/button`
  - Replace the translucent `<a>` link with `<Button asChild className="w-full bg-white text-blue-700 hover:bg-blue-50 font-semibold py-6 rounded-xl shadow-sm">` wrapping the `<a>` tag (FR-006, research.md R2)
  - Import `useReducedMotion` from `motion/react` and apply `animate-bounce` class to the `Navigation` icon only when reduced motion is not preferred: `className={prefersReducedMotion ? undefined : "animate-bounce"}` (FR-007, edge case: prefers-reduced-motion)
  - Restructure the bottom section: move timestamp to a new centered `<p>` below the button with `text-center text-xs text-blue-200 mt-3 opacity-80` (FR-008)
  - Move the outdated warning inline with the timestamp (both in a centered container)
- [x] T005 [P] [US2] Update schedule timeline component in `src/components/public/schedule-timeline.tsx`:
  - Import `Button` from `@/components/ui/button`
  - Change section title `<h3>` from `text-sm font-medium text-zinc-500` to `text-lg font-bold text-zinc-900` (FR-012)
  - Replace plain `<button>` "Ver paradas" with `<Button variant="secondary" size="sm" className="text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg">` (FR-013)
  - Update `TimelineNode` for `current` status: add `border-2 border-blue-600` and `shadow-sm shadow-blue-200` to outer div, change inner dot from `size-3` to `size-2` (FR-009)
  - Update `TimelineNode` for `future` status: wrap in `size-6` container with `bg-white border-2 border-zinc-200 group-hover:border-blue-300 transition-colors` (FR-010)
  - Update `TimelineNode` for `past` status: change from `bg-zinc-200` to `bg-zinc-100 border-2 border-white` (FR-011)
  - Change vertical line from `bg-zinc-200` to `bg-zinc-100` (FR-014)
  - Add `border-b border-zinc-50` to each timeline row `<li>` except last (FR-014)
  - Add `group` class to each timeline row `<li>`, add `group-hover:text-zinc-900 transition-colors` to future stop text (FR-015)
- [x] T006 [P] [US2] Update route detail page in `src/app/(public)/routes/[routeId]/page.tsx`:
  - Import `Button` from `@/components/ui/button`
  - Replace the plain back `<button>` with `<Button variant="ghost" size="icon" className="rounded-full hover:bg-zinc-200/50 text-zinc-700 -ml-2 mr-2">` (FR-005)
  - Apply same change in the loading skeleton and error states

**Checkpoint**: Route detail page fully matches reference. Hero card CTA is prominent, timeline is polished, back button uses shadcn component.

---

## Phase 4: User Story 3 — Consistent Announcements View (Priority: P2)

**Goal**: Announcement cards use shadcn Card and Badge components, urgent cards have rose border/shadow, typography matches reference.

**Independent Test**: Navigate to the avisos page, verify card components with shadow, badge components with subtle rounded shape, urgent card border and shadow, `text-lg font-bold` title, `leading-relaxed` body, `font-medium` date, `text-2xl` page title.

### Implementation for User Story 3

- [x] T007 [P] [US3] Update announcement card component in `src/components/public/announcement-card.tsx`:
  - Import `Card`, `CardContent` from `@/components/ui/card` and `Badge` from `@/components/ui/badge`
  - Replace outer `<div>` with `<Card className="relative overflow-hidden rounded-2xl shadow-sm ...">`; for urgent cards add `border-rose-200 shadow-rose-100/50`, for normal cards add `border-zinc-100` (FR-016, FR-018, research.md R4)
  - Replace inner `<div className="space-y-3">` with `<CardContent className="p-5">` (override default px-6)
  - Replace urgent badge `<span>` with `<Badge variant="destructive" className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-none shadow-none rounded text-[10px] font-bold uppercase tracking-wider">` (FR-017, research.md R3)
  - Replace info badge `<span>` with `<Badge variant="secondary" className="bg-zinc-100 text-zinc-600 hover:bg-zinc-100 border-none shadow-none rounded text-[10px] font-bold uppercase tracking-wider">` (FR-017)
  - Change title `<h2>` from `text-base font-semibold` to `text-lg font-bold` (FR-022)
  - Add `leading-relaxed` to body `<p>` text (FR-019)
  - Add `font-medium` to date `<p>` text (FR-019)
- [x] T008 [P] [US3] Update avisos page title in `src/app/(public)/avisos/page.tsx`:
  - Change all `<h1>` elements from `text-xl` to `text-2xl` (FR-020) — applies to loading, error, and success states

**Checkpoint**: Announcements page fully matches reference. Cards use shadcn component, badges use Badge component, urgent styling is distinct.

---

## Phase 5: User Story 4 — Updated Bottom Navigation (Priority: P2)

**Goal**: Bell icon for Avisos, 24px icons, rounded-xl containers, safe-area padding, fixed-width items.

**Independent Test**: View bottom nav on any public page, verify bell icon, 24px icon sizing, rounded-xl containers, `justify-around` with fixed-width items, safe-area padding on notched devices.

### Implementation for User Story 4

- [x] T009 [US4] Update bottom navigation in `src/components/public/bottom-nav.tsx`:
  - Replace `Megaphone` import with `Bell` from `lucide-react` and update the `navItems` array icon reference (FR-024)
  - Change icon className from `size-5` to `size-6` (24px) (FR-025)
  - Change icon container div from `rounded-lg` to `rounded-xl` (FR-025)
  - Change nav item `<Link>` from `flex-1` to `w-20` (FR-027)
  - Change container `<div>` from `flex` to `flex justify-around` (FR-027)
  - Add `pb-[env(safe-area-inset-bottom)]` to the outer `<nav>` element (FR-026, research.md R1)

**Checkpoint**: Bottom nav matches reference on all public pages. Safe-area padding degrades gracefully on devices without notch.

---

## Phase 6: User Story 5 — Status Badge Typography (Priority: P3)

**Goal**: Status badge uses semibold weight and wide letter spacing.

**Independent Test**: View any route card or route detail header, verify badge text uses semibold weight and wider letter spacing.

### Implementation for User Story 5

- [x] T010 [US5] Update status badge typography in `src/components/public/route-status-badge.tsx`:
  - Change `font-medium` to `font-semibold tracking-wide` in the badge className (FR-023)

**Checkpoint**: Status badge typography matches reference across all usages (route cards and detail headers).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validate all changes together and ensure no regressions

- [x] T011 Run lint (`npm run lint`), typecheck (`npx tsc --noEmit`), and build (`npm run build`) to verify zero errors
- [ ] T012 Visual verification: compare each public screen against AI Studio reference design side-by-side (home, route detail, avisos, bottom nav)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US1 (Phase 2)**: No dependencies on setup — can start immediately (parallel with Phase 1)
- **US2 (Phase 3)**: No dependencies on US1 — can start immediately (parallel with Phase 2)
- **US3 (Phase 4)**: No dependencies on US1/US2 — can start immediately (parallel)
- **US4 (Phase 5)**: Depends on Phase 1 (viewport-fit=cover for safe-area to work)
- **US5 (Phase 6)**: No dependencies — can start immediately (parallel with any phase)
- **Polish (Phase 7)**: Depends on ALL previous phases being complete

### User Story Dependencies

- **US1 (P1)**: Independent — touches `route-card.tsx` and `page.tsx`
- **US2 (P1)**: Independent — touches `hero-card.tsx`, `schedule-timeline.tsx`, and `routes/[routeId]/page.tsx`
- **US3 (P2)**: Independent — touches `announcement-card.tsx` and `avisos/page.tsx`
- **US4 (P2)**: Depends on T001 (viewport config) — touches `bottom-nav.tsx`
- **US5 (P3)**: Independent — touches `route-status-badge.tsx` only

### Parallel Opportunities

- T002, T003 can run in parallel (different files within US1)
- T004, T005, T006 can run in parallel (different files within US2)
- T007, T008 can run in parallel (different files within US3)
- All user stories (US1–US5) touch different files — ALL can run in parallel
- Only constraint: T009 (US4) should run after T001 (viewport setup)

---

## Parallel Example: All User Stories

```text
# These can ALL run in parallel since they touch different files:

US1: T002 (route-card.tsx) + T003 (page.tsx)
US2: T004 (hero-card.tsx) + T005 (schedule-timeline.tsx) + T006 (routes/[routeId]/page.tsx)
US3: T007 (announcement-card.tsx) + T008 (avisos/page.tsx)
US4: T001 (layout.tsx) → T009 (bottom-nav.tsx)
US5: T010 (route-status-badge.tsx)

# After all complete:
T011 (quality gates) → T012 (visual verification)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 (viewport setup)
2. Complete T002 + T003 (route card + home page)
3. **STOP and VALIDATE**: Home page should match reference
4. Continue with remaining stories

### Incremental Delivery

1. T001 (Setup) — viewport config
2. US1 (T002–T003) — route list polished
3. US2 (T004–T006) — route detail polished
4. US3 (T007–T008) — announcements polished
5. US4 (T009) — bottom nav polished
6. US5 (T010) — badge typography
7. T011–T012 — quality gates + visual verification

### Sequential (Solo Developer — Recommended)

Since all files are different and changes are small, a solo developer can work through all tasks sequentially in one pass:

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012

Each task is a focused edit to a single file. Estimated: one atomic commit per user story phase.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- No test tasks — spec did not request automated tests; visual verification via quality gates
- All changes are modifications to existing files; no new files created
- Commit suggestion: one commit per user story phase (5 commits + 1 for setup + 1 for polish = 7 commits max, or consolidate into fewer)
- All color values use zinc palette (FR-028)
