# Embedded Live Map — Analysis

## Library Recommendation: MapLibre GL JS + react-map-gl

| Criteria | Leaflet | MapLibre GL | Google Maps | Mapbox GL |
|---|---|---|---|---|
| Bundle (gzip) | ~54 KB | ~90-95 KB | ~12 KB + ~180 KB external | ~250 KB |
| Cost | Free | Free | $7/1K loads (28.5K free/mo) | $5/1K loads (50K free/mo) |
| Mobile perf | Good (Canvas) | Excellent (WebGL) | Excellent | Excellent |
| Vector tiles | No | Yes (native) | Google-only | Mapbox-only |
| License | BSD (open) | BSD (open) | Proprietary | Proprietary (v2+) |
| Tile freedom | Any raster | Any vector/raster | Locked | Locked |

**Why MapLibre wins here:**

- WebGL rendering = buttery smooth pinch-zoom on mid-range Android phones (common in Bahia)
- Zero per-load cost — critical for a public-facing transport app with unpredictable traffic
- No vendor lock-in — aligns with the project's self-hosted philosophy (own VPS, Supabase, Caddy)
- The ~40 KB extra over Leaflet buys crisp vector tiles at every zoom level (no pixelated raster)
- Free tile providers: MapTiler free tier (100K tiles/month) or OpenStreetMap vector tiles

---

## UI Placement: Two Options

### Option A — Map card between HeroCard and Timeline (simpler, recommended for v1)

```
+-------------------------------+
|  [←]  Rota Van 1    [Em op.] |  ← sticky header
+-------------------------------+
| +---------------------------+ |
| |  PRÓXIMA PARADA           | |
| |  TRT-5 (Paralela)  01:20 | |  ← HeroCard (existing)
| |  ETA: 5 min              | |
| +---------------------------+ |
|                               |
| +---------------------------+ |
| |                           | |
| |   🚐 [van on map]        | |  ← NEW: map card (~250-300px)
| |     ○ stops along route   | |
| |              [⊕ recenter] | |
| +---------------------------+ |
|                               |
| +---------------------------+ |
| |  Horários (timeline)      | |  ← ScheduleTimeline (existing)
| |  ...                      | |
| +---------------------------+ |
+-------------------------------+
```

- Fits naturally in the existing scrollable layout
- Map complements HeroCard info ("where exactly is it?")
- `rounded-2xl`, `shadow-sm` matching design system
- Show only when `isRunning` + van has coordinates

### Option B — Map-as-background + bottom sheet (Uber/Lyft pattern, future enhancement)

```
+-------------------------------+
|  [←]  Rota Van 1    [Em op.] |
+-------------------------------+
|                               |
|        MAP (full area)        |
|     🚐 ---- ○ ---- ○         |
|                               |
+===============================+  ← draggable bottom sheet
| [grab handle]                 |
| Next: TRT-5  |  ETA 5 min    |  ← peek state
+-------------------------------+
```

- More immersive, industry standard for tracking apps
- More complex to implement (sheet drag gesture, state management)
- Better as a Phase 2 upgrade

---

## Map UX Best Practices

**Auto-centering & viewport:**

- On load: auto-fit the van marker + next 2-3 stops in view
- On updates: gently pan to follow the van (smooth animated transition)
- When user pans away: stop auto-centering, show a floating re-center button (compass icon)

**Markers:**

- Van: distinct colored icon (pulsing dot or small van silhouette), rotated to match bearing
- Next stop: highlighted (`blue-600`, matching accent color)
- Passed stops: gray/faded
- Future stops: neutral outlined circles
- Touch targets: minimum 44x44px

**Route path:**

- Polyline connecting all stops
- Completed portion: dashed/lighter
- Upcoming portion: solid accent color

**Stale data handling:**

- If `isLocationOutdated === true`: dim the van marker, show "Última atualização: X min atrás"
- If no coordinates at all: hide map, show "Localização não disponível"

---

## Data Already Available vs. Gaps

| Data | Available? | Where |
|---|---|---|
| Van lat/lng | Yes | `van.lastLat`, `van.lastLng` in API response |
| Van freshness | Yes | `van.isLocationOutdated`, `van.locationUpdatedAt` |
| Stop names/times | Yes | `schedule[]` in API response |
| Stop lat/lng | **No — needs API change** | In DB (`schedule_entries.stop_lat/stop_lng`) but not exposed |
| Passed stop IDs | Yes | `progress.passedStopIds` |
| Next stop ID | Yes | `progress.nextStopId` |

**One API change needed:** extend `/api/routes/[routeId]` to include `stop_lat` and `stop_lng` in the schedule entries response.

---

## Performance Strategy

- Dynamic import with `next/dynamic({ ssr: false })` — map libraries need `window`
- Skeleton placeholder while loading (matches existing skeleton pattern)
- Existing 15s polling from TanStack Query feeds new van position automatically
- Animate marker between positions (interpolate over the polling interval, not instant jumps)
- Lazy render: only mount the map when the route `isRunning` and coordinates exist

---

## Phased Approach

| Phase | Scope |
|---|---|
| Phase 1 (MVP) | Map card, van marker, stop markers, auto-center, skeleton loading, stale data handling |
| Phase 2 | Route polyline, smooth marker animation, re-center button, bearing rotation |
| Phase 3 | Bottom sheet layout, tap-to-expand fullscreen, passed/upcoming polyline styling |

---

## Accessibility

- `role="img"` + dynamic `aria-label` describing van position
- "Pular mapa" skip link for keyboard/screen reader users
- `aria-live="polite"` hidden region for significant position changes
- The existing HeroCard + Timeline already serve as the text alternative

---

## Bottom Line

MapLibre GL + react-map-gl as a card between HeroCard and Timeline gives us the best mobile experience at zero cost, with a clear upgrade path to the bottom-sheet pattern later. The main prerequisite is exposing stop coordinates in the API response.

Want me to spec and plan this for implementation?
