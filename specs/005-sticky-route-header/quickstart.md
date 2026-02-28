# Quickstart: Sticky Route Detail Header

## What to change

**Single file**: `src/app/(public)/routes/[routeId]/page.tsx`

## Implementation summary

### Success state (lines ~80-108)

1. **Pull the header div out** of the `<div className="space-y-6">` wrapper so it becomes a sibling above it.
2. **Add sticky + frosted glass classes** to the header div:
   - `sticky top-0 z-20 bg-zinc-50/90 backdrop-blur-md border-b border-zinc-200/50 py-4`
3. **Wrap remaining content** (HeroCard, ScheduleTimeline) in a `<div className="space-y-6 pt-6">` below the sticky header.

Before:
```tsx
<div className="space-y-6">
  <div className="flex items-center justify-between">  {/* header */}
    ...
  </div>
  <HeroCard ... />
  <ScheduleTimeline ... />
</div>
```

After:
```tsx
<>
  <div className="sticky top-0 z-20 bg-zinc-50/90 backdrop-blur-md border-b border-zinc-200/50 py-4">
    <div className="flex items-center justify-between">
      ...
    </div>
  </div>
  <div className="space-y-6 pt-6">
    <HeroCard ... />
    <ScheduleTimeline ... />
  </div>
</>
```

### Loading state (lines ~17-41)

Apply the same structural split: sticky skeleton header wrapper + content wrapper.

### Error state

No changes needed — error state has minimal content and no scrollable timeline.

## How to verify

1. `npm run lint` — zero errors
2. `npx tsc --noEmit` — zero errors
3. `npm run build` — succeeds
4. Open a route detail page on mobile viewport, scroll the timeline, verify header sticks with frosted glass effect
