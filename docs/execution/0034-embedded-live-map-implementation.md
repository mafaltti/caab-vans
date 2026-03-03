# Implementation Complete: Embedded Live Map

## What Changed (5 files — 1 new, 4 modified)

| File | Change |
|---|---|
| `src/components/public/van-tracking-map.tsx` | **NEW** — 317-line map component with MapLibre GL JS |
| `src/app/api/routes/[routeId]/route.ts` | Added `stopLat`/`stopLng` to schedule response (+2 lines) |
| `src/types/index.ts` | Added `stopLat`/`stopLng` to `RouteDetail.schedule` type (+2 lines) |
| `src/app/(public)/routes/[routeId]/page.tsx` | Dynamic map import, error boundary, conditional render |
| `src/components/public/hero-card.tsx` | Removed "Abrir localização ao vivo" button + `locationUrl` prop |

## Features Delivered (T001-T017)

1. **Van position on map** — Pulsing blue dot with smooth animation between polling updates
2. **Stop markers** — Color-coded by status (blue=next, gray=passed, outlined=future)
3. **Auto-fit viewport** — Shows van + all stops on initial load
4. **Pan/zoom + re-center** — Floating `LocateFixed` button appears after user interaction
5. **Stale location warning** — Dimmed marker + "Localização desatualizada" text
6. **Graceful degradation** — Skeleton loading, tile error fallback, error boundary
7. **Legacy cleanup** — Removed Google Maps link button from HeroCard

## Quality Gates

| Gate | Result |
|---|---|
| ESLint | PASS |
| TypeScript (`tsc --noEmit`) | PASS |
| Build (`next build`) | Pre-existing van-tracker failure (unrelated) |
| Tests (`vitest run`) | PASS (60/60) |

## T018 (Manual Validation) Still Needs

- Start dev server + tracking simulator
- Verify on 375px mobile viewport
