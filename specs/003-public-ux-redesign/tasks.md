# Tasks: Public Screens UX Redesign

**Input**: Design documents from `/specs/003-public-ux-redesign/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the spec — test tasks are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependency and update shared types needed by all stories.

- [x] T001 Install `motion` library as a project dependency via `npm install motion`
- [x] T002 Update TypeScript types in `src/types/index.ts`: add `totalStops: number` and `currentStopIndex: number | null` to `RouteWithStatus`; add `TimelineStopStatus` and `TimelineStop` types per data-model.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: BFF update and shared components that MUST be complete before user story work.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [P] Update BFF routes list handler in `src/app/api/routes/route.ts` to compute and return `totalStops` (schedule_entries count) and `currentStopIndex` (index of nextStop entry, or null) per contracts/api-changes.md
- [x] T004 [P] Create PageTransition wrapper component in `src/components/public/page-transition.tsx` with two animation variants (`fade-slide-up` and `slide-from-right`) using `motion` library's `motion.div`, with enter/exit animations per component-interfaces.md
- [x] T005 [P] Update RouteStatusBadge in `src/components/public/route-status-badge.tsx`: change active badge to emerald background (`bg-emerald-100 text-emerald-700`) with a pulsing dot indicator (`animate-pulse`); change inactive badge to zinc background (`bg-zinc-100 text-zinc-600`) without animation

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Browse Routes with Enhanced Cards (Priority: P1) MVP

**Goal**: Redesign route cards on the home page with Bus icon, progress text ("Parada X de Y"), inner next-stop section with MapPin/Clock icons, status-colored left accent, hover shadow elevation, chevron color shift, and scale-on-tap feedback.

**Independent Test**: Open the app at `/`. Verify each route card displays: route name, emerald/zinc status badge with pulsing dot (active), progress text, inner section with next stop name and time. Tap a card and verify scale-down feedback + navigation to route detail. Hover and verify shadow elevation + chevron shifts blue.

### Implementation for User Story 1

- [x] T006 [US1] Rewrite RouteCard in `src/components/public/route-card.tsx`: add Bus icon with status-colored background (blue-50/emerald for active, zinc-50 for inactive); add progress text from `totalStops`/`currentStopIndex`; add inner card section (zinc-50 bg) with MapPin icon + truncated stop name and Clock icon + time (font-mono); add 4px emerald left border for active routes; add hover shadow elevation (`shadow-sm` → `shadow-md`) and chevron color transition; wrap with `motion.button` for `whileHover={{ scale: 0.98 }}` and `whileTap={{ scale: 0.96 }}`; use `rounded-2xl` card shape per prototype
- [x] T007 [US1] Update home page in `src/app/(public)/page.tsx`: replace existing RouteCard usage with updated component; update loading skeleton shapes to match new card layout (include inner section placeholder); keep existing error/empty state patterns unchanged

**Checkpoint**: User Story 1 complete — route list page is redesigned and independently testable.

---

## Phase 4: User Story 2 — View Route Detail with Gradient Hero and Timeline (Priority: P1)

**Goal**: Replace the flat next-stop display and schedule list with a gradient hero card and vertical timeline with past/current/future stop states, collapsible past stops, and sticky glassmorphism header.

**Independent Test**: Navigate to `/routes/{id}`. Verify gradient hero card shows "PROXIMA PARADA" label, stop name, time, location button (if active), and timestamp. Verify timeline shows stops with checkmark nodes (past), pulsing blue node (current), empty circle nodes (future). Verify past stops are collapsed by default with "Ver X paradas anteriores" button. Scroll down and verify sticky header with frosted-glass effect.

### Implementation for User Story 2

- [x] T008 [P] [US2] Create HeroCard component in `src/components/public/hero-card.tsx` per component-interfaces.md: gradient background (`from-blue-600 to-indigo-700`), `rounded-3xl`, decorative blur circle, "PROXIMA PARADA" uppercase label with Navigation icon, stop name (text-2xl bold white), time with Clock icon, "Abrir localizacao ao vivo" white button (shown only when `isRunning && locationUrl`), last-update timestamp, outdated location warning indicator; handle schedule-ended and no-schedule empty states with muted card styling; preserve existing `sendBeacon` analytics tracking from LocationLinkCta
- [x] T009 [P] [US2] Create ScheduleTimeline component in `src/components/public/schedule-timeline.tsx` per component-interfaces.md: derive `TimelineStop[]` from schedule + nextStopId; render vertical timeline with connecting line (absolute positioned, 2px width); past nodes (checkmark icon, zinc-400 text), current node (pulsing blue dot with `animate-pulse`, blue-700 text, "Parada atual / Proxima" label), future nodes (empty circle, zinc-700 text); collapse past stops by default with "Ver X paradas anteriores" button; times in `font-mono`; `rounded-3xl` white container; handle empty schedule edge case
- [x] T010 [US2] Update route detail page in `src/app/(public)/routes/[routeId]/page.tsx`: add sticky header with frosted-glass effect (`sticky top-0 z-20 bg-zinc-50/80 backdrop-blur-md`); replace NextStopDisplay + LocationLinkCta with HeroCard; replace ScheduleList with ScheduleTimeline; update loading skeletons to match new component shapes (gradient placeholder for hero, timeline node placeholders)
- [x] T011 [US2] Remove deprecated components: delete `src/components/public/next-stop-display.tsx`, `src/components/public/location-link-cta.tsx`, and `src/components/public/schedule-list.tsx`; verify no remaining imports reference these files

**Checkpoint**: User Story 2 complete — route detail page is redesigned and independently testable.

---

## Phase 5: User Story 3 — Switch Between Routes and Announcements via Tabs (Priority: P2)

**Goal**: Rewrite bottom navigation with enhanced active states, notification dot for urgent announcements, upward shadow; move announcements to `/avisos` URL with redirect from old path; update public layout for smooth tab switching.

**Independent Test**: Open the app. Tap "Avisos" tab and verify URL changes to `/avisos` with smooth content transition. Tap "Rotas" and verify return to `/`. Verify active tab has highlighted icon container, bolder stroke, blue color. Create an urgent announcement and verify notification dot appears on Avisos tab. Visit `/announcements` and verify redirect to `/avisos`.

### Implementation for User Story 3

- [x] T012 [P] [US3] Rewrite BottomNav in `src/components/public/bottom-nav.tsx`: active tab gets `bg-blue-50` icon container, `scale-110` icon, `strokeWidth: 2.5`, `text-blue-600` color; inactive tab gets `text-zinc-400`, `strokeWidth: 2`; add notification dot (`w-2 h-2 bg-rose-500 border-2 border-white rounded-full`) on Avisos tab icon, driven by `useAnnouncements()` checking `some(a => a.isUrgent)`; add upward shadow on nav bar (`shadow-[0_-10px_40px_rgba(0,0,0,0.05)]`); use `text-[10px] tracking-wide font-semibold` for labels
- [x] T013 [P] [US3] Create avisos page at `src/app/(public)/avisos/page.tsx`: move announcement list content from `src/app/(public)/announcements/page.tsx`; use `useAnnouncements()` hook; keep existing loading/error/empty state patterns; update heading to "Avisos"
- [x] T014 [US3] Convert old announcements page to redirect: update `src/app/(public)/announcements/page.tsx` to perform a permanent redirect from `/announcements` to `/avisos` using Next.js `redirect()` function
- [x] T015 [US3] Update public layout in `src/app/(public)/layout.tsx`: ensure BottomNav uses updated component; adjust content area padding if needed for new nav bar height; update BottomNav active path matching to use `/avisos` instead of `/announcements`

**Checkpoint**: User Story 3 complete — tab navigation redesigned and independently testable.

---

## Phase 6: User Story 4 — View Announcements with Visual Urgency Levels (Priority: P2)

**Goal**: Redesign announcement cards with uppercase type badges, colored accent bars for urgent announcements, and pin indicators.

**Independent Test**: Navigate to `/avisos`. Verify urgent announcements show rose accent bar on left, "URGENTE" badge with AlertCircle icon, rose color scheme for title/body. Verify info announcements show "INFORMATIVO" badge with Info icon, neutral colors. Verify pinned announcements show pin icon. Verify all cards show title, body, and "Publicado em DD/MM/YYYY" timestamp.

### Implementation for User Story 4

- [x] T016 [US4] Rewrite AnnouncementCard in `src/components/public/announcement-card.tsx`: add type badge section — urgent: `bg-rose-100 text-rose-700` badge with AlertCircle icon and "URGENTE" text; info: `bg-zinc-100 text-zinc-600` badge with Info icon and "INFORMATIVO" text; badges use `text-[10px] font-bold uppercase tracking-wider`; add 6px rose-500 accent bar on left for urgent (`absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500`); urgent title/body use rose-900/rose-800 colors; pin indicator with Pin icon (`text-blue-500 fill-blue-50`); card uses `rounded-2xl p-5 shadow-sm`; keep existing date formatting logic (pt-BR, America/Bahia)
- [x] T017 [US4] Update avisos page skeletons in `src/app/(public)/avisos/page.tsx`: update loading skeleton shapes to match new announcement card layout (badge placeholder, accent bar area, title/body blocks)

**Checkpoint**: User Story 4 complete — announcements page redesigned and independently testable.

---

## Phase 7: User Story 5 — Smooth Page Transitions and Micro-interactions (Priority: P3)

**Goal**: Add page-level enter/exit transitions using AnimatePresence, list entry stagger animations, and reduced-motion accessibility support.

**Independent Test**: Navigate between routes list and avisos — verify fade-slide-up transitions. Tap a route card — verify detail page slides in from right. Tap "Voltar" — verify slide-out to right. Enable `prefers-reduced-motion: reduce` in browser devtools — verify all animations are disabled or reduced.

### Implementation for User Story 5

- [x] T018 [US5] Integrate AnimatePresence in public layout: update `src/app/(public)/layout.tsx` to wrap page children with `AnimatePresence` from `motion`; use `usePathname()` as animation key; apply `fade-slide-up` variant for list pages (`/`, `/avisos`) and `slide-from-right` for route detail pages (`/routes/*`) via PageTransition component
- [x] T019 [US5] Add list entry stagger animations: in `src/app/(public)/page.tsx`, wrap each RouteCard with `motion.div` using stagger effect (`initial={{ opacity: 0, y: 10 }}`, `animate={{ opacity: 1, y: 0 }}`, transition delay based on index); apply same pattern in `src/app/(public)/avisos/page.tsx` for AnnouncementCard entries
- [x] T020 [US5] Add prefers-reduced-motion support: in `src/components/public/page-transition.tsx`, check `prefers-reduced-motion` media query and skip animations when enabled; in route card and announcement card, conditionally disable `motion` hover/tap scale effects; ensure CSS `animate-pulse` on status badge respects `@media (prefers-reduced-motion: reduce)` by adding appropriate Tailwind classes or CSS override

**Checkpoint**: All user stories complete — full redesign with animations is testable end-to-end.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Quality validation across all stories.

- [x] T021 [P] Run quality gates: execute `npx eslint .`, `npx tsc --noEmit`, `npm run build`, and `npx vitest run` — fix any failures
- [x] T022 Verify edge cases per spec: route with zero stops (empty timeline), schedule ended (muted hero card), all routes inactive (list renders normally), no announcements (empty state message), outdated location (warning in hero card), all past stops (no pulsing node, schedule-ended hero)
- [x] T023 Run quickstart.md validation: follow all testing steps in `specs/003-public-ux-redesign/quickstart.md` and verify each passes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 (T002 types, T003 BFF, T005 RouteStatusBadge)
- **US2 (Phase 4)**: Depends on Phase 2 (T004 PageTransition, T005 RouteStatusBadge) — can run in parallel with US1
- **US3 (Phase 5)**: Depends on Phase 2 (T004 PageTransition) — can start after Phase 2
- **US4 (Phase 6)**: Depends on US3 T013 (avisos page exists) — otherwise independent
- **US5 (Phase 7)**: Depends on US1, US2, US3, US4 completion (needs all components to exist)
- **Polish (Phase 8)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Independent after Phase 2
- **US2 (P1)**: Independent after Phase 2 — can run in parallel with US1
- **US3 (P2)**: Independent after Phase 2 — can start before or after US1/US2
- **US4 (P2)**: Needs US3's avisos page (T013) — otherwise independent
- **US5 (P3)**: Depends on all prior stories (adds animations to existing components)

### Within Each User Story

- Components before pages (components are imported by pages)
- New components before removing deprecated ones (T011)
- Page updates after component work
- Skeleton updates alongside or after page updates

### Parallel Opportunities

- **Phase 2**: T003, T004, T005 can all run in parallel (different files)
- **Phase 3 + Phase 4**: US1 and US2 can run in parallel after Phase 2
- **Phase 4**: T008 (HeroCard) and T009 (ScheduleTimeline) can run in parallel
- **Phase 5**: T012 (BottomNav) and T013 (avisos page) can run in parallel
- **Phase 5 + Phase 6**: US3 T012/T013 and US4 T016 can run in parallel

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all foundational tasks together (different files, no deps):
Task: "Update BFF routes handler in src/app/api/routes/route.ts"
Task: "Create PageTransition component in src/components/public/page-transition.tsx"
Task: "Update RouteStatusBadge in src/components/public/route-status-badge.tsx"
```

## Parallel Example: US1 + US2

```bash
# After Phase 2, launch both P1 stories in parallel:
# Developer A: US1
Task: "Rewrite RouteCard in src/components/public/route-card.tsx"
Task: "Update home page in src/app/(public)/page.tsx"

# Developer B: US2
Task: "Create HeroCard in src/components/public/hero-card.tsx"
Task: "Create ScheduleTimeline in src/components/public/schedule-timeline.tsx"
Task: "Update route detail page in src/app/(public)/routes/[routeId]/page.tsx"
Task: "Remove deprecated components"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (install motion, update types)
2. Complete Phase 2: Foundational (BFF update, PageTransition, RouteStatusBadge)
3. Complete Phase 3: User Story 1 (enhanced route cards)
4. **STOP and VALIDATE**: Open app, verify route cards display all new elements
5. Deploy to DEV if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (enhanced route cards) → Test → Deploy/Demo (MVP!)
3. US2 (gradient hero + timeline) → Test → Deploy/Demo
4. US3 (tab nav + /avisos) → Test → Deploy/Demo
5. US4 (announcement cards) → Test → Deploy/Demo
6. US5 (page transitions) → Test → Deploy/Demo
7. Polish → Final validation → PR to dev

### Parallel Team Strategy

With two developers:

1. Both complete Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 → US3 → US5
   - Developer B: US2 → US4 → Polish
3. Stories integrate independently via shared types and component contracts

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group (atomic commits per constitution)
- Stop at any checkpoint to validate story independently
- Old components (next-stop-display, location-link-cta, schedule-list) are removed ONLY after US2 verifies new replacements work
- The `/announcements` → `/avisos` redirect ensures no broken links
