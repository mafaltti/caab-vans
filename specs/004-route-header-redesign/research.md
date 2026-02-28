# Research: Route Detail Header Redesign

**Date**: 2026-02-28
**Feature**: 004-route-header-redesign

## Summary

No NEEDS CLARIFICATION items were present in the Technical Context. This feature is a straightforward UI layout change with a clear reference design (AI Studio prototype). Research focused on validating the approach against existing codebase patterns.

## Findings

### 1. Current Header Implementation

**Decision**: Modify the existing route detail page in-place.
**Rationale**: The header layout (sticky bar, back button, title, badge) is entirely contained within `src/app/(public)/routes/[routeId]/page.tsx`. No shared header component exists — the header is page-specific, making it safe to modify without side effects.
**Alternatives considered**: Extracting a shared inline header component — rejected per YAGNI (only one page uses this pattern).

### 2. Back Button Touch Target

**Decision**: Use `p-2` padding on a `rounded-full` button with `ArrowLeft size={24}` icon.
**Rationale**: `p-2` (8px padding) + 24px icon = 40px rendered size. Combined with the `min-h-[44px]` constraint already used in the project, this meets the 44px minimum touch target requirement. The `rounded-full` shape matches the AI Studio reference design.
**Alternatives considered**: Using a larger padding (`p-3`) — rejected as it would make the button visually oversized relative to the title text.

### 3. Sticky Header Removal

**Decision**: Remove the sticky header entirely; back button becomes part of the scrollable content.
**Rationale**: The AI Studio reference design intentionally removes the sticky header. Users have three alternative navigation methods: (1) scroll to top, (2) browser back gesture, (3) bottom navigation "Rotas" tab. The cleaner layout prioritizes content (hero card, timeline) over persistent navigation chrome.
**Alternatives considered**: Keeping a minimal sticky back button without the full bar — rejected as it contradicts the reference design and adds unnecessary complexity.
