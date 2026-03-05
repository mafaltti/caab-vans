# Quickstart: Bottom Sheet Tracking UI

**Feature**: 038-bottom-sheet-tracking

## Prerequisites

- Node.js, pnpm installed
- Project dependencies installed (`pnpm install`)
- Local dev server runs (`pnpm dev`)
- At least one route in the database with `isRunning=true` and valid GPS coordinates

## Step 1: Install shadcn Drawer

```bash
pnpm dlx shadcn@latest add drawer
```

This installs Vaul (~5 KB gzip) and generates `src/components/ui/drawer.tsx`.

## Step 2: Key Files to Modify

| File | Change |
|------|--------|
| `src/app/(public)/routes/[routeId]/page.tsx` | Add conditional layout switch (card vs. sheet mode) |
| `src/components/public/van-tracking-map.tsx` | Accept `className` + `fitBoundsPadding` props for fullscreen variant |

## Step 3: Key Files to Create

| File | Purpose |
|------|---------|
| `src/components/public/route-detail-sheet.tsx` | Bottom sheet wrapper using Vaul Drawer |
| `src/components/public/route-detail-peek.tsx` | Peek section (next stop + ETA chip + progress bar) |
| `src/components/public/route-progress-bar.tsx` | Compact horizontal progress bar |

## Step 4: Verify

1. Open a running route with GPS coordinates → should see fullscreen map + bottom sheet in peek state
2. Drag sheet up → should snap to half (timeline visible) and full (complete timeline)
3. Open a non-running route → should see existing card layout (no regression)
4. Pan the map → re-center button should appear above the sheet

## Design Reference

- Mockup: `docs/mockups/option-b-bottom-sheet.html` (open in browser)
- Analysis: `docs/execution/0044-option-b-bottom-sheet-analysis.md`

## Key Technical Decisions

- **Vaul Drawer** with `modal={false}`, `dismissible={false}`, `snapPoints={[0.25, 0.55, 0.92]}`
- **Vaul requires Overlay** — a transparent `Drawer.Overlay` is needed for snap point calculations and `Drawer.Title` (visually hidden) for accessibility
- **No new API endpoints** — reuses existing `useRouteDetail` hook (5s polling)
- **No new route groups** — conditional rendering in the same page component
- **No route polyline** — out of scope; map shows markers only
- **ETA chip hidden** when `etaMinutes` is null (no placeholder)
- **No latch pattern** — GPS coordinates persist in the DB, so `useBottomSheet` is a simple derived value
- **z-index stack**: map container `z-40` → BottomNav `z-50` → sheet overlay+content `z-50` (DOM order wins) → header `z-[60]`
- **VanTrackingMap** uses `cn("relative", className)` so tailwind-merge resolves position conflicts for fullscreen mode
