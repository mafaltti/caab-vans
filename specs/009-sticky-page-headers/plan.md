# Implementation Plan: Sticky Page Headers

**Branch**: `009-sticky-page-headers` | **Date**: 2026-02-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-sticky-page-headers/spec.md`

## Summary

Add sticky headers with frosted glass effect (semi-transparent background, backdrop blur, subtle bottom border) to the Rotas and Avisos public pages so the page title remains visible while scrolling. Both pages currently render the `<h1>` as a static element that scrolls away with the content; this change pins it to the top of the scroll container.

## Technical Context

**Language/Version**: TypeScript (Next.js App Router)
**Primary Dependencies**: Tailwind CSS, shadcn/ui (Zinc palette)
**Storage**: N/A (no data changes)
**Testing**: Vitest (visual behavior not unit-testable; manual verification + lint/typecheck/build gates)
**Target Platform**: Mobile web (responsive, max-w-lg container)
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A (pure CSS, no runtime impact)
**Constraints**: Sticky header must work within the existing `<main>` container that applies `px-4 pt-6`
**Scale/Scope**: 2 page files modified

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal CSS-only change. Two pages get the same sticky header treatment — only 2 occurrences so no abstraction warranted per DRY rule (< 3 repetitions). |
| II. Explicit Trade-offs | PASS | Trade-off: inline the sticky classes in each page rather than extracting a shared component (2 occurrences, KISS over premature abstraction). |
| III. Branch & Merge Discipline | PASS | Working on feature branch `009-sticky-page-headers`, PR will target `dev`. |
| IV. Quality Gates | PASS | Will run lint, typecheck, and build before PR. No test suites affected (UI-only change). |
| V. Stack Constraints | PASS | Uses Tailwind CSS utilities only. No new dependencies. Follows Zinc color palette. |

## Project Structure

### Documentation (this feature)

```text
specs/009-sticky-page-headers/
├── plan.md              # This file
├── research.md          # Phase 0 output (minimal — no unknowns)
├── spec.md              # Feature specification
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (files touched)

```text
src/app/(public)/
├── page.tsx             # Rotas page — add sticky header
├── avisos/
│   └── page.tsx         # Avisos page — add sticky header
└── layout.tsx           # Public layout (read-only reference — not modified)
```

**Structure Decision**: No new files or components. The change is inlined directly into the two existing page files. With only 2 occurrences and identical simple markup, a shared component would be premature abstraction per constitution principle I.

## Complexity Tracking

No violations — nothing to justify.

## Design Details

### Layout Constraint

The public layout (`layout.tsx`) applies `px-4 pt-6` to `<main>`. The sticky header lives inside this container, so:

- `sticky top-0` pins it within the `<main>` scroll container.
- To span full width (FR-006), the header uses negative horizontal margins (`-mx-4`) to break out of the parent padding, then applies its own `px-4` to restore inner padding.
- The `pt-6` on `<main>` is replaced: remove it from the layout, and instead apply top padding via the sticky header's own `py-4` (or equivalent) plus any remaining gap on the content below.

**Approach chosen**: Keep `pt-6` on layout. The sticky header uses `-mx-4 px-4` to span full width. It naturally absorbs the visual top spacing via its own `py-4`.

### Sticky Header Classes

Both pages apply the same set of Tailwind classes to a wrapper `<div>` around the `<h1>`:

```
sticky top-0 z-20 -mx-4 px-5 py-4 bg-zinc-50/90 backdrop-blur-md border-b border-zinc-200/50
```

- `sticky top-0 z-20` — pins to top, above card content
- `-mx-4 px-5` — breaks out of parent `px-4`, restores inner padding (px-5 matches reference)
- `py-4` — vertical padding for comfortable touch area
- `bg-zinc-50/90` — 90% opacity of the page background color (zinc palette)
- `backdrop-blur-md` — frosted glass blur effect
- `border-b border-zinc-200/50` — subtle bottom border at 50% opacity

### State Consistency (FR-005)

The sticky header is extracted out of the conditional rendering blocks. Currently both pages have the `<h1>` duplicated inside `if (isLoading)`, `if (error)`, and the default return. The refactored approach places the sticky header once, above the conditional content, so it renders in all states.

### Page Structure (after change)

```tsx
return (
  <div className="space-y-4">
    <div className="sticky top-0 z-20 -mx-4 px-5 py-4 bg-zinc-50/90 backdrop-blur-md border-b border-zinc-200/50">
      <h1 className="text-2xl font-bold text-zinc-900">Rotas</h1>
    </div>
    {/* conditional content: loading / error / empty / list */}
  </div>
);
```

Both loading and error early returns are removed in favor of a single return with conditional content, ensuring the sticky header is always present.
