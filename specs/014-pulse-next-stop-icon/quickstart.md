# Quickstart: Pulse Animation on Next Stop Icon

## What to change

**Single file**: `src/components/public/schedule-timeline.tsx`

## Steps

### 1. Import `useReducedMotion` hook

Add import from `motion/react` (same as `hero-card.tsx` does):

```tsx
import { useReducedMotion } from "motion/react";
```

### 2. Add reduced motion awareness to `TimelineNode`

The `TimelineNode` component needs access to the reduced motion preference. Two options:

- **Option A (simplest)**: Call `useReducedMotion()` inside `ScheduleTimeline` and pass the result as a prop to `TimelineNode`.
- **Option B**: Call `useReducedMotion()` directly inside `TimelineNode` (it's already within a client component boundary).

Either works — prefer whichever keeps the code simplest.

### 3. Add `animate-pulse` to the current stop's inner dot

In the `TimelineNode` function, for `status === "current"`, add `animate-pulse` to the inner dot's className, conditionally based on reduced motion:

```tsx
// Before:
<div className="size-3 rounded-full bg-blue-600" />

// After (when reduced motion is NOT preferred):
<div className="size-3 rounded-full bg-blue-600 animate-pulse" />

// After (when reduced motion IS preferred):
<div className="size-3 rounded-full bg-blue-600" />
```

Follow the same conditional pattern used in `hero-card.tsx:76-78`.

## Verification

1. **Visual**: Open a running route's detail page → scroll to "Horarios" → the next stop's blue dot should pulse.
2. **Accessibility**: Enable "prefers-reduced-motion: reduce" in browser DevTools → the dot should be static.
3. **Inactive route**: View an inactive route → all stop icons static, no pulse.
4. **Quality gates**: `eslint`, `tsc --noEmit`, `next build` must pass.
