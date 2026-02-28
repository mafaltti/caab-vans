# Implementation Plan: Sticky Route Detail Header

**Branch**: `005-sticky-route-header` | **Date**: 2026-02-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-sticky-route-header/spec.md`

## Summary

Make the route detail page header (back button, route name, status badge) stick to the top of the viewport when scrolling, with a frosted glass backdrop-blur effect and subtle border. This is a CSS-only change to a single page component — no data model, API, or logic changes.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router)
**Primary Dependencies**: Tailwind CSS, shadcn/ui (Zinc base), Lucide icons
**Storage**: N/A — no data changes
**Testing**: Visual/manual testing (CSS-only change, no logic)
**Target Platform**: Mobile web (iOS Safari, Android Chrome)
**Project Type**: Web application (Next.js)
**Performance Goals**: Zero CLS contribution from sticky transition
**Constraints**: Must work within existing `(public)/layout.tsx` scroll container (`max-w-lg` with `px-4 pb-20 pt-6`)
**Scale/Scope**: Single file change (`src/app/(public)/routes/[routeId]/page.tsx`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*
*Post-design re-check: ALL PASS — no changes from initial check.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | CSS class changes only. No new abstractions, components, or utilities. |
| II. Explicit Trade-offs in PRs | PASS | PR will include before/after of the header div. Minimal diff. |
| III. Branch & Merge Discipline | PASS | Working on `005-sticky-route-header` feature branch. PR targets `dev`. |
| IV. Quality Gates | PASS | Will run lint, type-check, and build before PR. No test suite impact. |
| V. Stack Constraints | PASS | Uses Tailwind CSS (existing stack). No new dependencies. |
| Security Constraints | PASS | N/A — no data, no keys, no auth changes. |
| Timezone & Data Consistency | PASS | N/A — no time/data logic changes. |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/005-sticky-route-header/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── spec.md              # Feature specification
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (affected files)

```text
src/app/(public)/routes/[routeId]/page.tsx   # Only file modified
```

Supporting context (read-only, not modified):

```text
src/app/(public)/layout.tsx                  # Scroll container context
src/app/(public)/template.tsx                # Page transition wrapper
src/components/public/route-status-badge.tsx  # Used in header
```

**Structure Decision**: No new files or directories needed. Single file modification within existing Next.js App Router page structure.

## Complexity Tracking

No violations to justify. This is the simplest possible implementation: CSS class changes on existing HTML elements.
