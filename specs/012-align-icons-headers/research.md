# Research: Align Stop Icons & Fixed Headers

**Feature**: `012-align-icons-headers`
**Date**: 2026-03-01

## 1. Fixed vs Sticky Header Positioning

**Decision**: Use `position: fixed` with spacer elements for content offset.

**Rationale**: The current `sticky top-0` inside a container with `pt-6` causes headers to scroll ~24px before sticking. The AI Studio prototype shows headers that never move. Only `fixed` provides true zero-movement from the first scroll event.

**Alternatives considered**:
- **Keep `sticky`, remove `pt-6` from layout**: Would eliminate the initial scroll, but the header would still be part of the document flow. If any future padding or margin is added above, the issue returns. Less predictable.
- **Move headers to layout, use `fixed` there**: Would require prop passing (page title, back button, badge) from each page to the layout. Over-engineered for 3 pages with different headers.
- **Use `sticky top-0` with negative top offset**: Hacky and fragile.

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

## Summary

All research items resolved. No NEEDS CLARIFICATION items remain. The implementation is purely CSS/Tailwind class changes with minor JSX restructuring (removing inner div for hollow circles, adjusting header positioning).
