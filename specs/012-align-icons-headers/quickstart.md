# Quickstart: 012 — Align Stop Icons & Fixed Headers

## What Changed

Two visual alignment changes to match the AI Studio prototype:

1. **Stop timeline icons** — Updated icon shapes in `TimelineNode`:
   - Future/neutral stops: hollow circle (border only, no inner dot)
   - Current stop: concentric circles (blue border ring + solid blue inner circle)
   - Past stops: unchanged (checkmark)

2. **Page headers** — Changed from `sticky` to `fixed` positioning:
   - Headers never move during scrolling (always pinned at top)
   - Added spacer divs to prevent content overlap
   - Maintained frosted glass visual effect
   - Added `env(safe-area-inset-top)` offset for iOS notch/status bar
   - Rotas/Avisos headers lifted to a shared layout-level `PublicHeader` component to prevent transition flash during navigation
   - Route Detail keeps its own header (unique content: back button, route name, badge); restructured to a single return with conditional inner content for stable transitions

## Files Modified

| File | Change |
| ---- | ------ |
| `src/components/public/schedule-timeline.tsx` | `TimelineNode` icon rendering |
| `src/components/public/public-header.tsx` | **New** — layout-level fixed header (title for Rotas/Avisos, skeleton fallback for other paths) |
| `src/app/(public)/layout.tsx` | Adjusted top padding (`pt-6` → `pt-2`), added `PublicHeader` |
| `src/app/(public)/page.tsx` | Removed per-page header (now in layout), kept spacer |
| `src/app/(public)/avisos/page.tsx` | Removed per-page header (now in layout), kept spacer |
| `src/app/(public)/routes/[routeId]/page.tsx` | Unified header into single return with conditional content, added safe-area offset |

## How to Verify

1. `npm run dev` and open the app
2. **Stop icons**: Navigate to an active route detail page. Check:
   - Past stops show checkmark
   - Current stop shows blue concentric circles
   - Future stops show hollow circle (no inner dot)
   - Open an inactive route: all stops show hollow circles
3. **Fixed headers**: Scroll on each page (Rotas, Avisos, Route Detail). Headers should never move — content scrolls underneath from the start.
4. **Navigation transitions**: Navigate between Rotas ↔ Avisos ↔ Route Detail. Headers should not flash or shift position during transitions.
