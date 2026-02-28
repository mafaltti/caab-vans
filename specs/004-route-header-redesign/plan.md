# Implementation Plan: Route Detail Header Redesign

**Branch**: `004-route-header-redesign` | **Date**: 2026-02-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-route-header-redesign/spec.md`

## Summary

Redesign the route detail page header by removing the current sticky header bar and integrating the back button inline with the route title and status badge in a single content-level row. The back button becomes icon-only (larger arrow, no "Voltar" text) with an `aria-label` for accessibility. Loading and error states are updated to match the new layout.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: Next.js, React, Tailwind CSS, Lucide icons, motion/react
**Storage**: N/A (no data changes)
**Testing**: Vitest (when applicable)
**Target Platform**: Mobile-first web (responsive, min 320px viewport)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: N/A (layout-only change, no performance impact)
**Constraints**: 44px minimum touch target, accessible labels for icon-only buttons
**Scale/Scope**: Single page modification (`src/app/(public)/routes/[routeId]/page.tsx`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| **I. KISS** | PASS | Removes complexity (sticky header bar) in favor of simpler inline layout |
| **II. Explicit Trade-offs** | PASS | Trade-off: lose persistent back button when scrolled, gain cleaner layout; users have browser back + bottom nav as alternatives |
| **III. Branch Discipline** | PASS | Feature branch `004-route-header-redesign`, PR targets `dev` |
| **IV. Quality Gates** | PASS | Lint, typecheck, build must pass before merge |
| **V. Stack Constraints** | PASS | Uses existing stack: Next.js, Tailwind CSS, Lucide icons |
| **Security** | N/A | No security-relevant changes |
| **Timezone** | N/A | No time-related changes |

**Result: All gates pass. No violations.**

## Project Structure

### Documentation (this feature)

```text
specs/004-route-header-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files affected)

```text
src/app/(public)/routes/[routeId]/page.tsx   # Route detail page (header, loading, error states)
```

**Structure Decision**: This feature modifies a single existing page file. No new files, components, or directories are needed. The route detail page already contains the header layout, loading skeleton, and error state — all three sections are updated in-place.

## Design Decisions

### 1. Inline Header Row Layout

**Before** (current):
- Sticky header bar with `bg-zinc-50/80 backdrop-blur-md` containing back button ("Voltar" text + small arrow) + route name + status badge
- Title and badge live inside the sticky bar

**After** (target):
- No sticky header
- Single `flex` row at the top of the content area: `[← icon (24px)] [Route Name (truncated)] ... [StatusBadge]`
- Back button: `rounded-full` touch target with `hover:bg-zinc-200/50`, `aria-label="Voltar"`, no text
- Arrow icon: `ArrowLeft size={24}` (up from current `size-4` / 16px)

### 2. Loading State Update

**Before**: Flat skeleton elements (back button placeholder, title placeholder)
**After**: Single row skeleton matching the inline layout (back area + title bar + badge placeholder)

### 3. Error State Update

**Before**: Back button with "Voltar" text label, no sticky header (already non-sticky in error state)
**After**: Icon-only back button matching the success state inline style
