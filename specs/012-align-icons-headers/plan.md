# Implementation Plan: Align Stop Icons & Fixed Headers

**Branch**: `012-align-icons-headers` | **Date**: 2026-03-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/012-align-icons-headers/spec.md`

## Summary

Align the schedule timeline stop icons and page header scroll behavior with the AI Studio prototype. Two changes: (1) update the `TimelineNode` component to render future/neutral stops as hollow circles and the current stop as concentric circles (keep past checkmark unchanged), and (2) convert page headers from `sticky` to `fixed` positioning so they never move during scrolling.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: React, Tailwind CSS, shadcn/ui, Lucide icons
**Storage**: N/A — no data changes
**Testing**: Vitest (visual verification is manual)
**Target Platform**: Mobile web (responsive, `max-w-lg` container)
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A — CSS-only changes, no performance impact
**Constraints**: Must match AI Studio prototype; maintain frosted glass header effect
**Scale/Scope**: 4 files modified, 0 files created

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
| ---- | ------ | ----- |
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal CSS changes; no new abstractions |
| II. Explicit Trade-offs | PASS | Sticky→fixed is the only approach; documented below |
| III. Branch & Merge Discipline | PASS | Working on `012-align-icons-headers` branch; PR targets `dev` |
| IV. Quality Gates | PASS | Will run lint, typecheck, build before PR |
| V. Stack Constraints | PASS | Uses Tailwind CSS utilities only; no new dependencies |
| Security Constraints | N/A | No auth/data changes |
| Timezone & Data | N/A | No time/data changes |

## Project Structure

### Documentation (this feature)

```text
specs/012-align-icons-headers/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── spec.md              # Feature specification
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files affected)

```text
src/
├── app/(public)/
│   ├── layout.tsx                      # Remove pt-6; add pt for fixed header offset
│   ├── page.tsx                        # Routes list — sticky→fixed header
│   ├── avisos/
│   │   └── page.tsx                    # Announcements — sticky→fixed header
│   └── routes/[routeId]/
│       └── page.tsx                    # Route detail — sticky→fixed header
└── components/public/
    └── schedule-timeline.tsx           # TimelineNode icon changes
```

**Structure Decision**: No new files or directories. All changes are in-place modifications to existing components and pages.

## Design Decisions

### 1. Stop Icon Changes (TimelineNode component)

**Current → Target mapping:**

| Status | Current | Target |
| ------ | ------- | ------ |
| `past` | Gray circle + checkmark icon | No change |
| `current` | Blue border circle + pulsing blue dot | Blue border circle + solid blue inner circle (no pulse) |
| `future` | White circle + gray dot inside | Hollow circle (border only, no inner content) |
| `neutral` | Same as future (gray dot inside) | Hollow circle (border only, no inner content) — same as future |

**Implementation**: Modify the `TimelineNode` component in `schedule-timeline.tsx`:
- **Current stop**: Remove `animate-pulse`, increase inner circle to `size-3` for visible concentric effect — outer ring (blue border) + solid inner circle (blue fill).
- **Future/neutral stops**: Remove the inner `<div>` entirely — keep only the outer circle with border.

### 2. Fixed Header Positioning

**Current behavior**: Headers use `sticky top-0` inside the `<main>` element which has `pt-6`. The 24px top padding causes headers to scroll 24px before sticking — this is the "moves a bit then sticks" effect.

**Target behavior**: Headers are `fixed top-0` and never move. Content scrolls underneath from the start.

**Approach**:
- Change header divs from `sticky top-0` to `fixed top-0 inset-x-0`.
- Each fixed header gets `max-w-lg mx-auto px-5` on its inner content to match the layout's centered container width.
- Remove the `-mx-4` negative margin hack (no longer needed — fixed positioning already spans full width).
- Add a spacer `<div>` below each fixed header to prevent content from hiding behind it. The spacer height matches the header height (approximately `py-4` + content = ~56px).
- The layout's `pt-6` top padding is replaced with padding that accounts for the fixed header.

**Why not keep sticky**: The user explicitly requested headers that "never move" to match AI Studio. `sticky` inherently scrolls before sticking when there's space above it. Only `fixed` gives true zero-movement behavior.

**Why not move headers to layout**: Each page has a different header (title text, back button, status badge). Keeping headers in page components is simpler than a layout-level abstraction with prop passing.

### 3. Z-Index Layering

Current z-index usage:
- Bottom nav: `z-50` (fixed)
- Page headers: `z-20` (sticky → will be fixed)

No conflicts — headers at top, bottom nav at bottom. Keep `z-20` for headers.

## Complexity Tracking

No constitution violations. No complexity tracking needed.
