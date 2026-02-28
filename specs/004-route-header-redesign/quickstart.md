# Quickstart: Route Detail Header Redesign

## What This Feature Does

Redesigns the route detail page header from a sticky bar layout to an inline row where the back button (icon-only), route title, and status badge sit together at the top of the scrollable content area.

## Files to Modify

| File | What Changes |
|------|-------------|
| `src/app/(public)/routes/[routeId]/page.tsx` | Header layout (success, loading, error states) |

## Key Changes

### 1. Success State (main return block)

- Remove the sticky header `<div>` (lines 78-92 approx.)
- Replace with an inline flex row inside the existing `<div className="space-y-6">`
- Back button: icon-only `ArrowLeft` (size 24), `rounded-full`, `aria-label="Voltar"`, no text
- Route name: `text-2xl font-bold`, truncated
- Status badge: aligned right with `justify-between`

### 2. Loading State

- Update skeleton to show a single row: back button area + title skeleton + badge skeleton

### 3. Error State

- Update back button to icon-only style matching success state

## How to Test

1. `npm run dev` and open a route detail page
2. Verify: back arrow + title + badge in one row, no sticky header
3. Tap back arrow — returns to route list
4. Test with a long route name — title truncates, arrow and badge stay visible
5. Check loading state (throttle network) — skeleton matches new layout
6. Check error state (disconnect API) — back button is icon-only inline
7. Run quality gates: `npx eslint .`, `npx tsc --noEmit`, `npm run build`
