# Research: Sticky Page Headers

**Date**: 2026-02-28

## Summary

No NEEDS CLARIFICATION items in the technical context. This feature is a pure CSS/layout change with no unknowns.

## Decisions

### Sticky positioning approach

- **Decision**: Use CSS `sticky` positioning within the existing `<main>` scroll container.
- **Rationale**: `position: sticky` is natively supported in all target browsers, requires no JavaScript, and works naturally within the existing layout. The `<main>` element is the scroll container, so `sticky top-0` pins the header correctly.
- **Alternatives considered**:
  - `position: fixed` — rejected because it would require manual width constraints to stay within the `max-w-lg` container and would overlap the bottom nav z-index management.
  - Layout-level header (in `layout.tsx`) — rejected because it would affect all public pages including route detail, which has its own header pattern. The spec explicitly scopes this to Rotas and Avisos only.

### Full-width spanning technique

- **Decision**: Use `-mx-4 px-5` to break out of parent `px-4` padding.
- **Rationale**: The parent `<main>` applies `px-4`. Negative margins on the sticky header extend it to the container edges while inner padding restores text alignment. This is a standard Tailwind pattern for edge-to-edge elements inside padded containers.
- **Alternatives considered**:
  - Move `px-4` from layout to each page — rejected because it would require modifying every public page for this feature, violating minimal diff principle.
  - Remove padding from layout and use a wrapper — rejected for same reason.

### No shared component extraction

- **Decision**: Inline the sticky header markup in each page file.
- **Rationale**: Only 2 occurrences exist. Constitution principle I (DRY) requires >= 3 repetitions before extraction. The markup is ~3 lines — extracting it would add indirection with no meaningful reuse benefit.
