# Research: Embedded Live Map

## R1: Map Library Selection

**Decision**: MapLibre GL JS + react-map-gl

**Rationale**:
- WebGL rendering provides smooth pinch-zoom and panning on mid-range Android phones (common in Bahia region)
- Zero per-load cost — critical for a public-facing transport app with unpredictable traffic
- No vendor lock-in — aligns with project's self-hosted philosophy (own VPS, Supabase, Caddy)
- ~90-95 KB gzip total — acceptable trade-off for crisp vector tiles at every zoom level
- BSD-3 open-source license, governed by MapLibre foundation (backed by AWS, Meta, Microsoft, MapTiler)
- react-map-gl (by Uber's vis.gl team) provides declarative React `<Marker>` components that update on state change

**Alternatives considered**:
- **Leaflet + react-leaflet** (~54 KB gzip): Lighter bundle, but Canvas rendering is noticeably less smooth on mobile. Good fallback if bundle size becomes critical.
- **Google Maps** (~180 KB external): Best UX but $7/1K loads after 28.5K free/month. Vendor lock-in, no custom tile sources.
- **Mapbox GL JS** (~250 KB gzip): Same WebGL engine (MapLibre forked from it) but proprietary license since v2.0, $5/1K loads, locked to Mapbox tiles only.

## R2: Tile Provider

**Decision**: OpenStreetMap raster tiles via MapLibre's demo tiles for development; MapTiler free tier for production.

**Rationale**:
- MapTiler free tier provides 100K tile requests/month — sufficient for initial launch
- Good coverage and detail for Salvador/Bahia metropolitan area
- No API key needed for development (MapLibre demo tiles)
- Can upgrade to self-hosted OpenMapTiles if traffic grows beyond free tier

**Alternatives considered**:
- **Self-hosted TileServer GL**: Full control but adds infrastructure complexity. Defer until traffic justifies it.
- **Stadia Maps**: Free tier available but smaller community.
- **CARTO**: Good styling for transport but less common with MapLibre.

## R3: Map Integration Point in UI

**Decision**: Map card placed between HeroCard and ScheduleTimeline in the route detail page.

**Rationale**:
- Natural visual flow: status info (HeroCard) → spatial context (map) → detailed schedule (timeline)
- Fits within existing `space-y-6` layout without breaking component hierarchy
- Map card uses same design tokens: `rounded-2xl`, `shadow-sm`, `bg-white`
- Insertion point: after line 104 (HeroCard) and before line 106 (ScheduleTimeline) in `page.tsx`

**Alternatives considered**:
- **Map-as-background + bottom sheet** (Uber pattern): More immersive but significantly more complex (drag gesture, state management). Deferred to Phase 2.
- **Inside HeroCard**: Breaks component responsibility, makes HeroCard too complex.
- **Below ScheduleTimeline**: Users must scroll past all stops — less intuitive.

## R4: API Data Availability

**Decision**: Extend the route detail API response to include `stopLat` and `stopLng` in schedule items.

**Rationale**:
- Database columns `stop_lat` and `stop_lng` already exist in `schedule_entries` table
- Supabase query already selects these columns (both in detail and list endpoints)
- Only the response mapping needs updating — 2 lines added to `src/app/api/routes/[routeId]/route.ts`
- TypeScript `RouteDetail.schedule` type needs 2 fields added
- Non-breaking change (additive only)

## R5: Next.js SSR Compatibility

**Decision**: Dynamic import with `ssr: false` and `"use client"` directive.

**Rationale**:
- MapLibre GL JS accesses `window` and WebGL context at import time — cannot be server-rendered
- `next/dynamic` with `ssr: false` is the standard pattern, well-documented for map libraries
- Skeleton placeholder shown during load matches existing design system patterns
- No impact on page SEO (map content is not indexable anyway)

## R6: Real-time Update Strategy

**Decision**: Use existing 15-second TanStack Query polling; animate marker between position updates.

**Rationale**:
- Existing `useRouteDetail` hook already polls every 15 seconds — no new mechanism needed
- Van position (`lastLat`, `lastLng`) arrives with each poll response
- Marker animation via CSS transition or `requestAnimationFrame` interpolation between old and new coordinates
- 15-second interval balances freshness vs. network/battery usage on mobile
- No WebSocket/Realtime subscription needed for Phase 1
