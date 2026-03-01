# Research: Align Stop Icons & Fixed Headers

**Feature**: `012-align-icons-headers`
**Date**: 2026-03-01

## 1. Fixed vs Sticky Header Positioning

**Decision**: Use `position: fixed` with spacer elements for content offset.

**Rationale**: The current `sticky top-0` inside a container with `pt-6` causes headers to scroll ~24px before sticking. The AI Studio prototype shows headers that never move. Only `fixed` provides true zero-movement from the first scroll event.

**Alternatives considered**:
- **Keep `sticky`, remove `pt-6` from layout**: Would eliminate the initial scroll, but the header would still be part of the document flow. If any future padding or margin is added above, the issue returns. Less predictable.
- **Use `sticky top-0` with negative top offset**: Hacky and fragile.

**Implementation note (post-implementation)**: The initial per-page `fixed` headers caused a visible position flash during page transitions (e.g. Rotas → Route Detail). The final solution lifts shared headers into a layout-level `PublicHeader` client component that uses `usePathname()` to derive the title for Rotas/Avisos, and shows a skeleton fallback for other paths. Route Detail keeps its own header (rendered on top via DOM order). This prevents header unmount/remount during navigation.

## 2. Fixed Header Width Constraint

**Decision**: Apply `max-w-lg mx-auto` to the inner content of fixed headers.

**Rationale**: `position: fixed` pulls the element out of the normal flow and positions relative to the viewport. Without width constraints, the header would span the full viewport width. Wrapping content in `max-w-lg mx-auto` matches the layout's container, so the header content aligns with page content.

**Alternatives considered**:
- **Full-width frosted bar with centered content**: Same visual result but the frosted background extends edge-to-edge on desktop. This is acceptable on mobile (full width anyway) and arguably better on wider screens — the blur/background fills the whole top bar. The inner content stays centered.

## 3. Content Spacer for Fixed Headers

**Decision**: Add a spacer `<div>` after each fixed header to prevent content overlap.

**Rationale**: Fixed elements are removed from document flow, so content would otherwise render behind the header. A spacer with matching height pushes content down.

**Alternatives considered**:
- **Top padding on content container**: Works but couples the padding value to header height. A spacer is more explicit and easier to maintain.
- **CSS `scroll-padding-top`**: Only affects scroll snap behavior, doesn't prevent overlap.

## 4. Timeline Icon Shapes

**Decision**: Modify `TimelineNode` CSS classes only — no new components or icons needed.

**Rationale**: All icon changes are achievable with Tailwind utility classes:
- **Future/neutral**: Remove the inner `<div>` — the outer circle with `border-2 border-zinc-200` becomes a hollow ring.
- **Current**: Replace `animate-pulse` dot with a larger solid inner circle (`size-3 bg-blue-600 rounded-full`) for the concentric circle effect.
- **Past**: No changes (checkmark icon stays).

**Alternatives considered**:
- **SVG icons from Lucide**: `Circle` and `CircleDot` icons exist but are line-based strokes, not filled shapes. CSS circles give more control over size, fill, and color.
- **Custom SVG components**: Over-engineered for simple circle shapes.

## 5. Safe Area Inset for Fixed Headers

**Decision**: Use `top: env(safe-area-inset-top, 0px)` on fixed headers and `calc(3.5rem + env(safe-area-inset-top, 0px))` on spacer divs.

**Rationale**: The app uses `viewportFit: "cover"` in the root layout. With `position: fixed; top: 0`, headers render under the iOS status bar/notch on notched devices. Offsetting by `env(safe-area-inset-top)` keeps headers below the safe area. A `0px` fallback ensures correct behavior on browsers or devices without safe area insets.

## 6. Layout-Level Header for Transition Stability

**Decision**: Create a `PublicHeader` client component in the layout that handles headers for Rotas and Avisos pages, with a skeleton fallback for other paths.

**Rationale**: Per-page fixed headers caused a visible position flash during client-side navigation. When React swaps page components, the old header unmounts and the new one mounts — leaving a brief gap. Moving the header to the layout ensures it never unmounts. For Route Detail (which has unique header content), the page renders its own header on top (same z-index, later in DOM order). The layout's skeleton fallback remains visible during the navigation gap, preventing the flash.

## Summary

All research items resolved. No NEEDS CLARIFICATION items remain. Implementation involved CSS/Tailwind class changes, JSX restructuring, a new layout-level header component, and safe-area-inset handling.
