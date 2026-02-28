# Quickstart: Public UX Alignment

**Branch**: `006-public-ux-alignment`

## What This Feature Does

Aligns all public-facing UI components to match the reference design. This is a visual polish pass — no new functionality, no data changes, no API changes.

## Files to Change (10 files)

### Components (7 files)

| File | Summary |
|------|---------|
| `src/components/public/route-card.tsx` | Wrap in shadcn Card, remove left border indicator, add hover effect, update time styling |
| `src/components/public/route-status-badge.tsx` | Update font weight and letter spacing |
| `src/components/public/hero-card.tsx` | Redesign CTA button (full-width white), add bounce animation, center timestamp |
| `src/components/public/schedule-timeline.tsx` | Restyle all timeline nodes, update title/button/separators |
| `src/components/public/announcement-card.tsx` | Wrap in shadcn Card, use Badge component, add urgent styling |
| `src/components/public/bottom-nav.tsx` | Change icon to Bell, resize to 24px, add safe-area padding |

### Pages (3 files)

| File | Summary |
|------|---------|
| `src/app/(public)/page.tsx` | Title from text-xl to text-2xl |
| `src/app/(public)/avisos/page.tsx` | Title from text-xl to text-2xl |
| `src/app/(public)/routes/[routeId]/page.tsx` | Back button to shadcn Button, title to text-2xl |

### Config (1 file, conditional)

| File | Summary |
|------|---------|
| `src/app/layout.tsx` | Add `viewport-fit=cover` to viewport config (if not present) |

## How to Verify

1. `npm run lint` — zero errors
2. `npx tsc --noEmit` — zero errors
3. `npm run build` — success
4. Visual check on mobile viewport:
   - Home page: route cards with card component, no left border on active routes
   - Route detail: white CTA button, refined timeline nodes, bold section title
   - Avisos: card components with badge components, urgent border/shadow
   - Bottom nav: bell icon, 24px, safe-area padding
