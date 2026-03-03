# Implementation Plan: Embedded Live Map

**Branch**: `032-embedded-live-map` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/032-embedded-live-map/spec.md`

## Summary

Replace the deprecated Google Maps `location_url` link with an embedded live tracking map on the route detail page. The map displays the van's real-time position and route stop markers using MapLibre GL JS + react-map-gl. The "Abrir localização ao vivo" button is removed entirely. Map renders as a 250px card between HeroCard and ScheduleTimeline, only when the route is actively running and van coordinates are available.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: MapLibre GL JS, react-map-gl, existing TanStack Query polling
**Storage**: Supabase Postgres (no schema changes — columns already exist)
**Testing**: Vitest (unit tests for data transformations, visual verification for map)
**Target Platform**: Mobile web (320px–430px viewport, touch-first)
**Project Type**: Web application (Next.js BFF + frontend)
**Performance Goals**: Map visible within 3 seconds of page load; marker updates within 1 second of new data
**Constraints**: ~90-95 KB gzip added bundle; zero per-load tile cost; no API keys for development
**Scale/Scope**: Public-facing page, variable traffic, 4 vans currently

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Single map component, no abstractions. Reuses existing polling. No premature optimization. |
| II. Explicit Trade-offs | PASS | Trade-off: ~40KB extra vs Leaflet buys WebGL smoothness on mobile. Documented in research.md. |
| III. Branch & Merge Discipline | PASS | Feature branch `032-embedded-live-map` targets `dev`. |
| IV. Quality Gates | PASS | Will run lint, typecheck, build, tests before PR. |
| V. Stack Constraints | PASS | Uses Next.js App Router, Tailwind/shadcn/ui tokens, TanStack Query, TypeScript. MapLibre is a new dependency but fits the stack (client-side, no server requirements). |
| Security Constraints | PASS | No new API keys exposed to client. Tile requests are public (no auth). No service role key usage. |
| Timezone & Data Consistency | N/A | Map does not display times; schedule times remain in ScheduleTimeline. |

**Post-Phase 1 re-check**: All gates still pass. No new patterns, no edge functions, no service role key in client.

## Project Structure

### Documentation (this feature)

```text
specs/032-embedded-live-map/
├── plan.md              # This file
├── research.md          # Phase 0: library selection, tile provider, UI placement
├── data-model.md        # Phase 1: API response extension, type changes, UI constants
├── quickstart.md        # Phase 1: setup, files to create/modify, verification steps
├── contracts/
│   └── route-detail-schedule-extension.md  # API contract for schedule coordinate fields
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── api/routes/[routeId]/route.ts    # MODIFY: add stopLat/stopLng to schedule response
│   └── (public)/routes/[routeId]/
│       └── page.tsx                      # MODIFY: import and render map component
├── components/public/
│   ├── van-tracking-map.tsx              # NEW: map component (client-side, dynamic import)
│   └── hero-card.tsx                     # MODIFY: remove "Abrir localização ao vivo" button
└── types/
    └── index.ts                          # MODIFY: extend RouteDetail.schedule type
```

**Structure Decision**: All changes fit within the existing `src/` layout. One new component file (`van-tracking-map.tsx`) in the existing `components/public/` directory. No new directories or architectural changes.

## Implementation Approach

### Step 1: API & Type Extension (Backend)

Expose stop coordinates in the route detail API response. This is a prerequisite for the map to render stop markers.

**Files**: `src/app/api/routes/[routeId]/route.ts`, `src/types/index.ts`

**Changes**:
- Add `stopLat: e.stop_lat` and `stopLng: e.stop_lng` to the schedule mapping (~2 lines)
- Add `stopLat: number | null` and `stopLng: number | null` to the `RouteDetail.schedule` type

**Risk**: Very low — additive, non-breaking change. Existing consumers ignore unknown fields.

### Step 2: Install Map Dependencies

Add MapLibre GL JS and react-map-gl to the project.

**Command**: `npm install maplibre-gl react-map-gl`

**Risk**: Low — new dependencies, but well-maintained and widely used. ~90KB gzip added to client bundle.

### Step 3: Create Map Component

Build `van-tracking-map.tsx` as a `"use client"` component with:
- MapLibre GL map with OpenStreetMap tiles
- Van marker (pulsing, visually distinct)
- Stop markers (color-coded by status: passed=gray, next=blue, future=neutral)
- Auto-fit viewport on load (van + next stops)
- Re-center button (appears when user pans away)
- Stale location warning overlay when `isLocationOutdated`
- Tile error fallback ("Mapa indisponível")
- Fixed 250px height, `rounded-2xl` styling

**Files**: `src/components/public/van-tracking-map.tsx` (new)

**Risk**: Medium — largest piece of work. Map interaction, marker animation, and touch gestures need careful testing on mobile devices.

### Step 4: Integrate Map into Route Detail Page

Import the map component via `next/dynamic` with `ssr: false` and render it between HeroCard and ScheduleTimeline. Pass van position, stop data, and progress state as props.

**Files**: `src/app/(public)/routes/[routeId]/page.tsx`

**Changes**:
- Dynamic import with skeleton loading placeholder
- Conditional render: only when `isRunning && van.lastLat != null && van.lastLng != null`
- Props: van position, schedule with coordinates, progress (nextStopId, passedStopIds)

**Risk**: Low — straightforward integration with existing data flow.

### Step 5: Remove Legacy Location Button

Remove the "Abrir localização ao vivo" button and its analytics beacon from HeroCard.

**Files**: `src/components/public/hero-card.tsx`

**Changes**:
- Remove the `locationUrl` prop usage and the `<a>` button block (~30 lines)
- Remove the `sendBeacon` analytics tracking for `open_location_link_clicked`
- Clean up unused `locationUrl` prop if no longer needed elsewhere

**Risk**: Low — straightforward removal. The `locationUrl` field remains in the API response (cleanup deferred).

### Step 6: Quality Gates & Testing

- Run lint, typecheck, build, and tests
- Manual testing on mobile viewport with tracking simulator
- Verify skeleton loading, stale warning, tile error fallback
- Verify graceful degradation when route is not running

## Complexity Tracking

No constitution violations. No complexity justification needed.
