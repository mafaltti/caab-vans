# Tasks: Embedded Live Map

**Input**: Design documents from `/specs/032-embedded-live-map/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the feature specification. Test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and extend the API to expose stop coordinates — prerequisites for all map functionality.

- [x] T001 Install MapLibre GL JS and react-map-gl dependencies via `npm install maplibre-gl react-map-gl`
- [x] T002 [P] Add `stopLat: e.stop_lat` and `stopLng: e.stop_lng` to the schedule mapping in `src/app/api/routes/[routeId]/route.ts` (lines 113-117 in the `sortedEntries.map()` call)
- [x] T003 [P] Add `stopLat: number | null` and `stopLng: number | null` to the `RouteDetail` schedule item type in `src/types/index.ts`

**Checkpoint**: Dependencies installed, API returns stop coordinates, types updated. Verify with `npx tsc --noEmit`.

---

## Phase 2: User Story 1 — View Van Position on Map (Priority: P1) 🎯 MVP

**Goal**: Passenger sees the van's live position on an embedded map card on the route detail page.

**Independent Test**: Open a route detail page while a van is actively tracked → map card appears below HeroCard with van marker at correct position. Run `npx tsx scripts/simulate-tracking.ts` to generate van pings.

### Implementation for User Story 1

- [x] T004 [US1] Create `src/components/public/van-tracking-map.tsx` as a `"use client"` component with: MapLibre GL map rendering, 250px fixed height, `rounded-2xl overflow-hidden shadow-sm bg-white` styling, OpenStreetMap tile source, and a single van marker using a pulsing blue dot (CSS animation). The component accepts props: `vanLat: number`, `vanLng: number`, `isLocationOutdated: boolean`. Center map on van position at zoom 14 on initial load.
- [x] T005 [US1] Add smooth van marker animation in `src/components/public/van-tracking-map.tsx`: when `vanLat`/`vanLng` props change (from polling), animate the marker from old position to new position using CSS transition or `requestAnimationFrame` interpolation over ~1 second. Map should NOT reset viewport on marker updates.
- [x] T006 [US1] Import `van-tracking-map.tsx` via `next/dynamic` with `ssr: false` in `src/app/(public)/routes/[routeId]/page.tsx`. Render between HeroCard and ScheduleTimeline. Conditionally render only when `route.isRunning && route.van.lastLat != null && route.van.lastLng != null`. Pass van position and `isLocationOutdated` as props. Use a skeleton placeholder (`<div className="h-[250px] w-full rounded-2xl bg-slate-100 animate-pulse" />`) as the loading fallback.
- [x] T007 [US1] Add tile load error handling in `src/components/public/van-tracking-map.tsx`: listen for MapLibre `error` event on tile load failures. When tiles fail, show a centered overlay with "Mapa indisponível" text (Tailwind: `absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400`).
- [x] T008 [US1] Add map library load error boundary in `src/app/(public)/routes/[routeId]/page.tsx`: wrap the dynamic map import in a React error boundary or try/catch so that if MapLibre fails to load entirely, the map card is hidden and the page remains functional (HeroCard + ScheduleTimeline unaffected).

**Checkpoint**: Van marker visible on map for active routes. Map loads with skeleton, degrades gracefully on failure. Verify with `npm run build` and manual test on 375px viewport.

---

## Phase 3: User Story 2 — See Stop Markers on Map (Priority: P2)

**Goal**: All route stops with coordinates appear on the map with visual differentiation by status (passed, next, future).

**Independent Test**: Open route detail → stop markers appear on map with correct colors. Next stop is blue, passed stops are gray, future stops are neutral.

### Implementation for User Story 2

- [x] T009 [US2] Extend `VanTrackingMapProps` in `src/components/public/van-tracking-map.tsx` to accept `stops: Array<{ id: string; stopName: string; stopLat: number; stopLng: number }>`, `nextStopId: string | null`, and `passedStopIds: string[]`.
- [x] T010 [US2] Render stop markers in `src/components/public/van-tracking-map.tsx`: for each stop with valid coordinates, render a `<Marker>` with a small circle. Color by status: next stop = `bg-blue-600` (12px solid circle), passed stops = `bg-slate-300` (10px), future stops = `border-2 border-slate-400 bg-white` (10px outlined). Filter out stops where `stopLat` or `stopLng` is null.
- [x] T011 [US2] Implement auto-fit viewport in `src/components/public/van-tracking-map.tsx`: on initial load, compute a bounding box that includes the van position and all stop markers with coordinates. Use MapLibre's `fitBounds()` with padding (~40px) to show van + stops. Fall back to centering on van at zoom 14 if only the van has coordinates.
- [x] T012 [US2] Update `src/app/(public)/routes/[routeId]/page.tsx` to pass stop data to the map component: map `route.schedule` (filtering items with `stopLat`/`stopLng`), `route.progress?.nextStopId`, and `route.progress?.passedStopIds ?? []` as props.

**Checkpoint**: Stop markers visible with correct status colors. Map auto-fits to show van + stops. Verify with tracking simulator running.

---

## Phase 4: User Story 3 — Navigate and Re-center Map (Priority: P3)

**Goal**: Passenger can pan/zoom freely and tap a re-center button to return to the van.

**Independent Test**: Pan the map away from the van → re-center button appears. Tap it → map smoothly returns to van position.

### Implementation for User Story 3

- [x] T013 [US3] Add user-interaction tracking state in `src/components/public/van-tracking-map.tsx`: track whether the user has manually panned/zoomed with a `userInteracted` ref. Set to `true` on `dragstart` or `zoomstart` events from user gesture. When `userInteracted` is false, auto-pan to follow the van on position updates.
- [x] T014 [US3] Add re-center button in `src/components/public/van-tracking-map.tsx`: when `userInteracted` is true, render a floating button (Lucide `LocateFixed` icon, 40x40px, `absolute bottom-3 right-3`, white background, rounded-full, shadow-md). On click: fly to van position with `map.flyTo()`, reset `userInteracted` to false, resume auto-following.

**Checkpoint**: Pan/zoom works naturally. Re-center button appears/disappears correctly. Verify touch gestures on mobile viewport.

---

## Phase 5: User Story 4 — Stale Location Warning (Priority: P3)

**Goal**: Passenger sees a visual warning when the van's location data is outdated.

**Independent Test**: Simulate stale data (`isLocationOutdated: true`) → van marker dims and warning text appears.

### Implementation for User Story 4

- [x] T015 [US4] Add stale location visual indicators in `src/components/public/van-tracking-map.tsx`: when `isLocationOutdated` is true, apply `opacity-40` to the van marker element. Show a small warning badge below the map card or as an overlay ("Localização desatualizada" in `text-xs text-amber-600`). When `isLocationOutdated` becomes false on next poll, remove warning and restore marker opacity.

**Checkpoint**: Stale warning appears/disappears correctly based on `isLocationOutdated` flag.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Remove legacy code and run quality gates.

- [x] T016 Remove the "Abrir localização ao vivo" button block (the `<a>` element with `MapPin` icon, ~lines 171-201) and its `sendBeacon` analytics tracking from `src/components/public/hero-card.tsx`. Clean up the `locationUrl` prop from `HeroCardProps` if no longer referenced elsewhere. Remove unused `MapPin` import if applicable.
- [x] T017 Run quality gates: `npx eslint .`, `npx tsc --noEmit`, `npm run build`, `npx vitest run`. Fix any lint or type errors introduced by the changes.
- [ ] T018 Run quickstart.md validation: (manual — requires dev server + tracking simulator) start dev server, run `npx tsx scripts/simulate-tracking.ts`, open route detail page at 375px viewport width. Verify all acceptance scenarios from spec.md: map appears for active routes, van marker moves on poll, stop markers show correct colors, re-center button works, stale warning shows, map hidden for inactive routes, skeleton during load, fallback on tile error.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **User Story 1 (Phase 2)**: Depends on Phase 1 (needs dependencies + API extension)
- **User Story 2 (Phase 3)**: Depends on Phase 2 (extends the map component created in US1)
- **User Story 3 (Phase 4)**: Depends on Phase 2 (adds interaction to the map component)
- **User Story 4 (Phase 5)**: Depends on Phase 2 (adds stale indicators to the map component)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Setup only — core MVP, delivers the map with van marker
- **US2 (P2)**: Depends on US1 — extends the same map component with stop markers
- **US3 (P3)**: Depends on US1 — adds interaction tracking to the same map component
- **US4 (P3)**: Depends on US1 — adds stale indicators to the same map component
- **US3 and US4**: Independent of each other — can be done in parallel after US1

### Within Each User Story

- T002 and T003 are parallel (different files)
- T004 must complete before T005, T007 (same file, incremental)
- T009 must complete before T010, T011 (same file, incremental)
- T013 must complete before T014 (same file, incremental)

### Parallel Opportunities

```
Phase 1:  T001 ──┐
          T002 ──┤ (all parallel)
          T003 ──┘

Phase 2:  T004 → T005 → T007  (sequential, same file)
          T006, T008           (parallel with each other, different file)

Phase 3:  T009 → T010 → T011  (sequential, same file)
          T012                 (parallel, different file)

Phase 4:  T013 → T014         (sequential, same file)
Phase 5:  T015                 (single task)

US3 ──┐
      ├── (parallel after US1)
US4 ──┘
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: User Story 1 (T004-T008)
3. **STOP and VALIDATE**: Map card appears with van marker for active routes
4. Deploy to DEV if ready — already delivers core value (replaces Google Maps link)

### Incremental Delivery

1. Setup + US1 → Van on map → Deploy (MVP!)
2. Add US2 → Stop markers with status colors → Deploy
3. Add US3 + US4 (parallel) → Pan/re-center + stale warning → Deploy
4. Polish → Remove legacy button, quality gates → PR to dev

---

## Notes

- All changes are in 5 files (1 new, 4 modified) — small, focused PR
- No database migrations or schema changes needed
- No new API keys or environment variables required
- MapLibre CSS (`maplibre-gl/dist/maplibre-gl.css`) must be imported in the map component
- The `locationUrl` field stays in the API response for now (removing it is a separate cleanup)
- Commit after each phase checkpoint for atomic, reviewable changes
