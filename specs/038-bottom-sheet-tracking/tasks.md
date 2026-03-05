# Tasks: Bottom Sheet Tracking UI

**Input**: Design documents from `/specs/038-bottom-sheet-tracking/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install dependencies and generate scaffolding

- [x] T001 Install shadcn Drawer component by running `pnpm dlx shadcn@latest add drawer` which installs Vaul and generates `src/components/ui/drawer.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared components and modifications needed by multiple user stories

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Modify VanTrackingMap to accept three optional props in `src/components/public/van-tracking-map.tsx`: (1) `className` (defaulting to `h-[250px] rounded-2xl overflow-hidden shadow-sm bg-white`), (2) `fitBoundsPadding` (defaulting to `{ padding: 40 }`), (3) `recenterBottomOffset` (number in px). The outer wrapper uses `cn("relative", className)` so tailwind-merge resolves position conflicts (e.g. `relative` dropped in favor of `absolute inset-0` for fullscreen mode). An inner `h-full w-full overflow-hidden` div wraps the Map and re-center button. Existing card-mode usage unchanged (pass no new props).
- [x] T003 [P] Create RouteProgressBar component in `src/components/public/route-progress-bar.tsx`. Props: `totalStops: number`, `passedCount: number`. Renders N horizontal segments in a flex row with 4px gap: filled segments (blue-600) for passed stops, a partially-filled segment for current (CSS gradient), and empty segments (zinc-200) for future stops. Include labels below showing first stop name+time and last stop name+time. Match the mockup's `.progress-bar` styling from `docs/mockups/option-b-bottom-sheet.html`.
- [x] T004 [P] Create RouteDetailPeek component in `src/components/public/route-detail-peek.tsx`. Props: `nextStopName: string`, `scheduledTime: string`, `etaMinutes: number | null`, `totalStops: number`, `passedCount: number`, `firstStopLabel: string`, `lastStopLabel: string`. Layout: left side shows "Proxima parada" label with bounce icon, stop name (text-xl, bold, truncated), and scheduled time with clock icon. Right side shows ETA chip (large number + "min" unit) in blue-50 rounded box — when `etaMinutes` is null, the ETA chip div must not render (conditional rendering, not `display:none`) and the left info section must use `flex: 1` to expand and fill available space. Below, render `RouteProgressBar`. Match the mockup's `.peek-section` styling.

**Checkpoint**: Foundation ready — all shared components exist, map accepts fullscreen props

---

## Phase 3: User Story 1 — Glanceable ETA While Watching the Map (Priority: P1)

**Goal**: Full-screen map with bottom sheet in peek state showing next stop, ETA chip, and progress bar

**Independent Test**: Navigate to a running route with GPS coordinates → see fullscreen map + bottom sheet at peek with next stop info, ETA, and progress bar

### Implementation for User Story 1

- [x] T006 [US1] Create RouteDetailSheet component in `src/components/public/route-detail-sheet.tsx`. Uses Vaul `Drawer.Root` with `snapPoints={[0.25, 0.55, 0.92]}`, `activeSnapPoint` / `setActiveSnapPoint` as controlled state, `modal={false}`, `dismissible={false}`. Renders `Drawer.Portal` > `Drawer.Overlay` (transparent, z-50) > `Drawer.Content` (z-50, `h-[96dvh]`) with rounded top corners (`rounded-t-3xl`), sheet shadow, and a grab handle bar. Includes a visually hidden `Drawer.Title` for accessibility and `aria-describedby={undefined}` to suppress Radix warnings. Accepts `peek` (fixed top section) and `children` (scrollable content) as two separate slots. The `peek` section uses `shrink-0` to stay pinned; the scrollable area uses `min-h-0 flex-1 overflow-y-auto` with `overscroll-behavior: contain`.
- [x] T007 [US1] Add conditional layout switch in `src/app/(public)/routes/[routeId]/page.tsx`. Compute `useBottomSheet = route.isRunning && route.van.lastLat != null && route.van.lastLng != null` as a simple derived value (no useRef latch — GPS coordinates persist in the DB once set, so the condition stays true even when signal is temporarily lost; `isLocationOutdated` handles stale display). When `useBottomSheet` is true: render a `fixed inset-0 z-40 h-dvh` container (breaking out of the padded `<main>`) containing the fullscreen map and bottom sheet. When false: render existing card layout unchanged. The fixed header uses `z-[60]` to stay above both the sheet (z-50) and BottomNav (z-50).
- [x] T008 [US1] Wire fullscreen map in sheet mode within `src/app/(public)/routes/[routeId]/page.tsx`. When `useBottomSheet` is true: render `VanTrackingMap` with `className="absolute inset-0"` (no rounded corners, no shadow, no fixed height) and default `fitBoundsPadding={{ top: 80, bottom: 220, left: 40, right: 40 }}` (peek state padding). Pass existing van/stop props. Dynamically import `RouteDetailSheet` with `ssr: false`. Inside the sheet, render `RouteDetailPeek` with next stop data from `route.nextStop` and progress data from `route.progress`.

**Checkpoint**: Running routes show fullscreen map + bottom sheet at peek with glanceable ETA. Non-running routes still show card layout.

---

## Phase 4: User Story 2 — Expanding the Sheet to View Schedule (Priority: P1)

**Goal**: Three snap points (peek/half/full) with schedule timeline visible at half and full states, past stops toggle at full

**Independent Test**: Drag sheet handle upward → snaps to half (timeline visible) → full (complete timeline with past stops toggle). Drag down → collapses back.

### Implementation for User Story 2

- [x] T010 [US2] Add schedule timeline content to RouteDetailSheet in `src/app/(public)/routes/[routeId]/page.tsx`. The `ScheduleTimeline` component is rendered as the sheet's scrollable `children` with `variant="inline"`, which strips the card wrapper (no rounded-3xl/shadow/padding) and makes the "Horários" header + past-stops toggle sticky (`sticky top-0 z-20 bg-white -mx-5 px-5`) so they stay pinned while timeline items scroll underneath. The timeline is visible when the sheet is at half or full state.
- [x] T011 [US2] Verify scroll/drag coordination in `src/components/public/route-detail-sheet.tsx`. At peek and half snap points, touching the content area should drag the sheet (Vaul default). At full snap point, content must scroll; dragging down from scroll-top collapses the sheet. Ensure the sheet content wrapper has appropriate scroll properties and Vaul's scroll coordination is working. Add `overscroll-behavior: contain` to prevent iOS page bounce.

**Checkpoint**: All three snap states work with correct content visibility. Drag gestures transition smoothly between states.

---

## Phase 5: User Story 3 — Map Interaction with Sheet Awareness (Priority: P2)

**Goal**: Map pan/zoom works above sheet, re-center button repositions with sheet state, map viewport adjusts padding

**Independent Test**: Pan the map → re-center button appears above the sheet. Change sheet state → button and map viewport padding adjust.

### Implementation for User Story 3

- [x] T012 [US3] Add dynamic fitBounds padding based on sheet snap point in `src/app/(public)/routes/[routeId]/page.tsx`. When `activeSnapPoint` changes, compute new padding: peek → `{ top: 80, bottom: 220, left: 40, right: 40 }`, half → `{ top: 80, bottom: Math.round(window.innerHeight * 0.55), left: 40, right: 40 }`, full → `{ top: 80, bottom: Math.round(window.innerHeight * 0.85), left: 40, right: 40 }`. Pass the computed padding to `VanTrackingMap` via `fitBoundsPadding` prop. The map should re-fit bounds when padding changes (only if user hasn't manually panned).
- [x] T013 [US3] Add dynamic re-center button positioning in `src/app/(public)/routes/[routeId]/page.tsx`. Compute `recenterBottomOffset` from the active snap point: peek → `216` (200px sheet + 16px spacing), half → `Math.round(window.innerHeight * 0.55) + 16`, full → `-9999` (pushed off-screen since map is mostly covered). Pass `recenterBottomOffset` to `VanTrackingMap`. The button has `transition: bottom 0.3s ease` for smooth repositioning between snap states.
- [x] T014 [US3] Ensure map gestures work above the sheet in `src/app/(public)/routes/[routeId]/page.tsx`. Within the `z-40` sheet container, the map must sit at `z-0` and the Vaul drawer at a higher z-level. Touch events on the map area (above the sheet) must not be intercepted by the sheet. Vaul's `modal={false}` should handle this — verify no overlay/backdrop blocks map interaction.

**Checkpoint**: Map is fully interactive above the sheet. Re-center button and map viewport padding respond to sheet state changes.

---

## Phase 6: User Story 4 — Non-Running Route Fallback (Priority: P2)

**Goal**: Non-running routes (waiting, completed, no GPS) show existing card layout with zero regression

**Independent Test**: Navigate to a route in "waiting" or "completed" state → see existing card layout. Navigate to in_progress route without GPS → see card layout.

### Implementation for User Story 4

- [x] T015 [US4] Verify card layout fallback in `src/app/(public)/routes/[routeId]/page.tsx`. When `useBottomSheet` is false (not running, or no GPS), the existing card layout must render identically: HeroCard → VanTrackingMap (card mode, only if running with GPS) → ScheduleTimeline. Ensure no props or classNames from the sheet mode leak into the card mode path. The VanTrackingMap card mode must still use the default className (`h-[250px] rounded-2xl overflow-hidden shadow-sm bg-white`) and default padding (`{ padding: 40 }`).
- [x] T016 [US4] Hide BottomNav when sheet layout is active. The BottomNav is `z-50` (from layout). The sheet overlay and content also render at `z-50` via Vaul Portal but appear later in the DOM, so they layer on top. No explicit BottomNav hiding needed — the sheet's opaque background covers it at all snap points.

**Checkpoint**: Non-running routes look identical to before this feature. BottomNav is hidden only when sheet is active.

---

## Phase 7: User Story 5 — Mobile Browser Compatibility (Priority: P3)

**Goal**: Correct safe area insets, no iOS Safari rubber-banding, no toolbar flickering

**Independent Test**: Test on iOS Safari and Android Chrome — drag sheet, scroll content, verify no rubber-banding or toolbar flickering.

### Implementation for User Story 5

- [x] T017 [US5] Add safe area insets to sheet and header in `src/components/public/route-detail-sheet.tsx` and `src/app/(public)/routes/[routeId]/page.tsx`. Sheet content bottom padding must include `env(safe-area-inset-bottom)`. The header already uses `env(safe-area-inset-top)` — verify it still works in the fixed container. The fullscreen map container should use `100dvh` height (dynamic viewport height) to handle mobile toolbar show/hide.
- [x] T018 [US5] Prevent iOS Safari rubber-banding in `src/components/public/route-detail-sheet.tsx`. Vaul handles this natively — verify by testing on iOS Safari. If issues remain: add `touch-action: none` on the grab handle, `overscroll-behavior: contain` on the sheet content, and ensure the sheet container uses `position: absolute` (not `position: fixed`) to avoid mobile browser toolbar flickering per the analysis doc recommendation.

**Checkpoint**: Page works correctly on iOS Safari 15+ and Android Chrome without gesture issues.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, quality gates, and cleanup

- [x] T019 Run lint (`pnpm lint`), typecheck (`pnpm tsc --noEmit`), and build (`pnpm build`) to verify all quality gates pass
- [x] T020 Verify quickstart.md scenarios: (1) running route with GPS shows fullscreen map + sheet, (2) drag sheet through all three states, (3) non-running route shows card layout, (4) pan map shows re-center button above sheet, (5) route transitioning from waiting→in_progress mid-view switches to sheet layout on next poll, (6) GPS going null mid-session keeps sheet layout with stale overlay
- [x] T021 Verify bundle size impact: check that the Vaul/Drawer addition is under 10 KB gzip by comparing build output before and after

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (drawer must be installed)
- **US1 (Phase 3)**: Depends on Phase 2 (needs modified map + new components)
- **US2 (Phase 4)**: Depends on Phase 3 (needs sheet component to exist with snap points)
- **US3 (Phase 5)**: Depends on Phase 3 (needs sheet state to drive padding)
- **US4 (Phase 6)**: Depends on Phase 3 (needs conditional layout switch to exist)
- **US5 (Phase 7)**: Depends on Phase 3 (needs sheet to exist for safe area testing)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only — can start after Phase 2
- **US2 (P1)**: Depends on US1 — the sheet must exist before adding half/full content
- **US3 (P2)**: Depends on US1 — the sheet snap point state must exist before driving dynamic padding
- **US4 (P2)**: Depends on US1 — the conditional layout switch must exist before verifying fallback
- **US5 (P3)**: Depends on US1 — the sheet must exist before adding safe area polish

### Parallel Opportunities

- **Phase 2**: T002, T003, T004 are all [P] — different files, no dependencies between them
- **Phase 5**: T012 and T013 can run in parallel (different concerns: padding vs button position)
- **Phase 6**: T015 and T016 can run in parallel (verification vs nav hiding)
- **Phase 7**: T017 and T018 can run in parallel (safe areas vs rubber-banding)
- **US3 + US4 + US5**: Can all start in parallel after US1 is complete (different concerns)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all foundational tasks together (different files):
Task: "Modify VanTrackingMap props (className, fitBoundsPadding, recenterBottomOffset) in src/components/public/van-tracking-map.tsx"
Task: "Create RouteProgressBar in src/components/public/route-progress-bar.tsx"
Task: "Create RouteDetailPeek in src/components/public/route-detail-peek.tsx"
```

## Parallel Example: After US1 Complete

```bash
# Launch US3, US4, US5 in parallel (different concerns):
Task: "US3 - Dynamic map padding based on sheet state"
Task: "US4 - Verify card layout fallback for non-running routes"
Task: "US5 - Add safe area insets and iOS Safari fixes"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (install drawer)
2. Complete Phase 2: Foundational (map props + peek + progress bar)
3. Complete Phase 3: User Story 1 (sheet + fullscreen map + peek content)
4. **STOP and VALIDATE**: Running route shows fullscreen map + peek sheet with ETA
5. Deploy to DEV for testing

### Incremental Delivery

1. Setup + Foundational → Components ready
2. Add US1 → Fullscreen map + peek sheet (MVP!)
3. Add US2 → Half/full states with timeline
4. Add US3 + US4 → Map padding + fallback (can parallelize)
5. Add US5 → Mobile browser polish
6. Polish → Quality gates + bundle verification

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- T005 and T009 were merged into T002 and T004 respectively (analysis remediation)
- No new API endpoints or database changes — all tasks are frontend-only
- Vaul handles most iOS Safari gesture issues natively — T018 is verification + fallback
- The mockup at `docs/mockups/option-b-bottom-sheet.html` is the visual reference for all UI tasks
