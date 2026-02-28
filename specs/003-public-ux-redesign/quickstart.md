# Quickstart: Public Screens UX Redesign

**Branch**: `003-public-ux-redesign` | **Date**: 2026-02-28

## Prerequisites

- Node.js (see `.nvmrc` or `package.json` engines)
- pnpm (or npm — check lockfile)
- Running Supabase instance (or `.env.local` configured for dev)

## Setup

```bash
# Switch to feature branch
git checkout 003-public-ux-redesign

# Install dependencies (includes new motion library)
npm install

# Start dev server
npm run dev
```

## Key Files to Modify

### BFF (API layer)
- `src/app/api/routes/route.ts` — Add `totalStops` + `currentStopIndex` fields

### Types
- `src/types/index.ts` — Add new fields to `RouteWithStatus`, add `TimelineStop` type

### Pages
- `src/app/(public)/layout.tsx` — Add animation wrapper
- `src/app/(public)/page.tsx` — Use updated `RouteCard`
- `src/app/(public)/avisos/page.tsx` — New path (moved from `announcements/`)
- `src/app/(public)/routes/[routeId]/page.tsx` — Use `HeroCard` + `ScheduleTimeline`

### Components (src/components/public/)
- `route-card.tsx` — Rewrite with enhanced design
- `route-status-badge.tsx` — Update with pulsing dot
- `hero-card.tsx` — NEW (replaces `next-stop-display.tsx` + `location-link-cta.tsx`)
- `schedule-timeline.tsx` — NEW (replaces `schedule-list.tsx`)
- `announcement-card.tsx` — Rewrite with urgency badges
- `bottom-nav.tsx` — Rewrite with notification dot + enhanced active states
- `page-transition.tsx` — NEW (animation wrapper)

### Cleanup
- Remove `next-stop-display.tsx` (replaced by `hero-card.tsx`)
- Remove `location-link-cta.tsx` (merged into `hero-card.tsx`)
- Remove `schedule-list.tsx` (replaced by `schedule-timeline.tsx`)
- Add redirect: `/announcements` → `/avisos`

## Quality Gates

```bash
# All must pass before PR
npx eslint .
npx tsc --noEmit
npm run build
npx vitest run
```

## Testing the Redesign

1. Open `http://localhost:3000` — verify route cards with progress, icons, hover/tap effects
2. Tap a route — verify slide-in transition, gradient hero card, timeline with collapsible past stops
3. Tap "Avisos" tab — verify smooth transition, announcement cards with urgency badges
4. Check notification dot appears when urgent announcements exist
5. Verify `/announcements` redirects to `/avisos`
6. Test with `prefers-reduced-motion: reduce` — verify animations are disabled
