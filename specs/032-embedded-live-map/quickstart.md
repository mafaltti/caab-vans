# Quickstart: Embedded Live Map

## Prerequisites

- Node.js 18+
- Running local dev server (`npm run dev`)
- Supabase instance with seeded data (vans, routes, schedule_entries with coordinates)
- At least one active route run with van location pings

## Install Dependencies

```bash
npm install maplibre-gl react-map-gl
```

## Key Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/components/public/van-tracking-map.tsx` | Main map component with van marker, stop markers, re-center button |

### Modified Files

| File | Change |
|------|--------|
| `src/app/api/routes/[routeId]/route.ts` | Add `stopLat`, `stopLng` to schedule response mapping |
| `src/types/index.ts` | Add `stopLat`, `stopLng` to `RouteDetail.schedule` type |
| `src/app/(public)/routes/[routeId]/page.tsx` | Import and render map component between HeroCard and ScheduleTimeline |
| `src/components/public/hero-card.tsx` | Remove "Abrir localização ao vivo" button and its analytics beacon |

## Verify It Works

1. Start the dev server: `npm run dev`
2. Run the tracking simulator: `npx tsx scripts/simulate-tracking.ts`
3. Open a route detail page in a mobile viewport (e.g., 375px width)
4. Verify:
   - Map card appears below HeroCard when route is running
   - Van marker shows at the correct position
   - Stop markers appear with correct status colors
   - Van marker moves on next polling update (15s)
   - Pinch-to-zoom and pan work
   - Re-center button appears after panning away

## Quality Gates

```bash
npx eslint .
npx tsc --noEmit
npm run build
npx vitest run
```
