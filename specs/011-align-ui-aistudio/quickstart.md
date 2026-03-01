# Quickstart: Align UI with AI Studio Prototype

**Feature**: `011-align-ui-aistudio` | **Date**: 2026-02-28

## Prerequisites

- Node.js and npm installed
- Project dependencies installed (`npm install`)
- Development server running (`npm run dev`)

## What Changes

Three component files are modified (layout-only, no new dependencies):

1. **`src/components/public/route-card.tsx`** — Badge moves to top-right row; chevron moves inside next-stop info bar
2. **`src/components/public/announcement-card.tsx`** — Urgent cards gain a rose left accent bar
3. **`src/components/public/schedule-timeline.tsx`** — Toggle button moves inline with "Horarios" header; becomes bidirectional

## How to Verify

1. **Routes listing** (`/`): Compare route cards against AI Studio prototype
   - Badge should be top-right, separate from title
   - Chevron should be inside the next-stop bar (or absent if no next-stop)
2. **Avisos page** (`/avisos`): Check urgent cards have a rose left accent bar
3. **Route detail** (`/routes/[id]`): Check "Ver paradas anteriores" button is right-aligned in header row and toggles show/hide

## Quality Gates

```bash
npm run lint        # ESLint
npx tsc --noEmit    # Type-check
npm run build       # Next.js build
npm run test        # Vitest (if applicable)
```
