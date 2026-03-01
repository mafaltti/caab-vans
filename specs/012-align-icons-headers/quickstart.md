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

## Files Modified

| File | Change |
| ---- | ------ |
| `src/components/public/schedule-timeline.tsx` | `TimelineNode` icon rendering |
| `src/app/(public)/page.tsx` | Routes header: sticky → fixed |
| `src/app/(public)/avisos/page.tsx` | Announcements header: sticky → fixed |
| `src/app/(public)/routes/[routeId]/page.tsx` | Route detail header: sticky → fixed |
| `src/app/(public)/layout.tsx` | Adjust top padding for fixed headers |

## How to Verify

1. `npm run dev` and open the app
2. **Stop icons**: Navigate to an active route detail page. Check:
   - Past stops show checkmark
   - Current stop shows blue concentric circles
   - Future stops show hollow circle (no inner dot)
   - Open an inactive route: all stops show hollow circles
3. **Fixed headers**: Scroll on each page (Rotas, Avisos, Route Detail). Headers should never move — content scrolls underneath from the start.
