# Research: Pulse Animation on Next Stop Icon

**Branch**: `014-pulse-next-stop-icon` | **Date**: 2026-03-01

## R1: How does the app handle reduced motion today?

**Decision**: Use `useReducedMotion()` hook from `motion/react` to conditionally apply animation.

**Rationale**: The `HeroCard` component (`hero-card.tsx:36`) already imports and uses this hook to conditionally apply `animate-bounce` on the Navigation icon. This is the established pattern in the codebase:

```tsx
const prefersReducedMotion = useReducedMotion();
// ...
className={prefersReducedMotion ? "size-4" : "size-4 animate-bounce"}
```

**Alternatives considered**:
- CSS `@media (prefers-reduced-motion: reduce)` — would work but diverges from the existing codebase pattern that uses the JS hook.
- Not handling reduced motion — rejected; accessibility is a spec requirement (FR-005) and the HeroCard already sets the precedent.

**Note**: `RouteStatusBadge` uses `animate-pulse` on its green dot without checking reduced motion. This is an existing inconsistency outside the scope of this feature.

## R2: Which animation class matches the AI Studio prototype?

**Decision**: Tailwind's built-in `animate-pulse` utility class.

**Rationale**: The AI Studio prototype (`App.tsx:289`) uses exactly `animate-pulse` on the inner dot of the current stop's timeline node. Tailwind's `animate-pulse` produces an opacity fade from 1.0 to 0.5 over a 2-second infinite cycle — matching FR-002 and FR-003. This same class is already used in `RouteStatusBadge` (`route-status-badge.tsx:15`).

**Alternatives considered**:
- Custom keyframes — unnecessary; the built-in class matches the prototype exactly.
- Motion library animation — overkill for a simple CSS opacity pulse; Motion is used for layout transitions and tap feedback, not persistent indicator animations.

## R3: What is the current TimelineNode structure for the "current" stop?

**Decision**: Modify the existing inner dot `<div>` by adding `animate-pulse` conditionally.

**Rationale**: Current implementation (`schedule-timeline.tsx:60-65`):

```tsx
if (status === "current") {
  return (
    <div className="flex size-6 items-center justify-center rounded-full bg-blue-100 border-2 border-blue-600 shadow-sm shadow-blue-200">
      <div className="size-3 rounded-full bg-blue-600" />
    </div>
  );
}
```

The inner dot (`size-3 rounded-full bg-blue-600`) needs `animate-pulse` added. The component is already a client component (`"use client"`) so it can use React hooks.

**Alternatives considered**:
- Adding a wrapper motion component — rejected; adds unnecessary complexity for a CSS-only animation.
- Changing the dot size back to `size-2` to match prototype — rejected; `size-3` was an intentional design decision in commit `3804d4e` and is not part of this feature's scope.
