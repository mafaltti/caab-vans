# Implementation Plan: Public UX Alignment

**Branch**: `006-public-ux-alignment` | **Date**: 2026-02-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-public-ux-alignment/spec.md`

## Summary

Align all public-facing components to match the reference design from the AI Studio project. This involves updating 7 component files and 3 page files to adopt shadcn/ui primitives (Card, Badge, Button), adjust typography scale, refine timeline node styling, update the hero card CTA button, change the bottom nav icon and sizing, and add safe-area padding. No data model, API, routing, or state management changes.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: shadcn/ui (New York style, Zinc base), Tailwind CSS v4, Motion (motion/react), Lucide icons
**Storage**: N/A (no data changes)
**Testing**: Visual verification (no automated test framework for UI styling; quality gates: lint, typecheck, build)
**Target Platform**: Mobile-first web (responsive, supports safe-area insets)
**Project Type**: Web application (Next.js)
**Performance Goals**: N/A (visual-only changes, no performance impact)
**Constraints**: Must use zinc palette (not slate), must respect prefers-reduced-motion
**Scale/Scope**: 7 component files + 3 page files in the public section

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | No new abstractions introduced. Using existing shadcn/ui components (Card, Badge, Button) instead of custom HTML — reduces duplication of styling patterns. No speculative complexity. |
| II. Explicit Trade-offs | PASS | Trade-off: adopting shadcn wrappers adds component nesting but gains visual consistency and reuse across 7+ components. PR will include before/after for each component. |
| III. Branch & Merge Discipline | PASS | Working on feature branch `006-public-ux-alignment`. PR will target `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, and build will be verified before PR. No test suites exist for visual styling. |
| V. Stack Constraints | PASS | Using Tailwind CSS + shadcn/ui (New York, Zinc, Lucide, Geist). Motion library for animations. All within locked stack. |
| Security Constraints | PASS | No security-relevant changes. |
| Timezone | PASS | No time display logic changes. |

**Gate result**: ALL PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/006-public-ux-alignment/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (files to modify)

```text
src/
├── app/
│   ├── layout.tsx                           # Add viewport-fit=cover for safe-area
│   └── (public)/
│       ├── page.tsx                         # Update title typography
│       ├── avisos/page.tsx                  # Update title typography
│       └── routes/[routeId]/page.tsx        # Update back button to shadcn Button
├── components/
│   └── public/
│       ├── route-card.tsx                   # Wrap in Card/CardContent, update indicator/hover/time
│       ├── route-status-badge.tsx           # Update font-weight and tracking
│       ├── hero-card.tsx                    # Update CTA button, nav icon animation, timestamp layout
│       ├── schedule-timeline.tsx            # Update nodes, title, button, separators, line color
│       ├── announcement-card.tsx            # Wrap in Card/CardContent, use Badge, urgent styling
│       └── bottom-nav.tsx                   # Change icon, sizing, container shape, safe-area, layout
```

**Structure Decision**: No new files or directories. All changes are modifications to existing components within the established `src/components/public/` and `src/app/(public)/` structure.

## Component Change Map

### 1. route-card.tsx (FR-001, FR-002, FR-003, FR-004, FR-021)

**Current → Target**:
- Wrap in `Card` + `CardContent` (remove plain div with manual shadow/rounded)
- Remove `border-l-4 border-l-emerald-500` active indicator
- Keep bus icon bg color change as the only active indicator
- Add `group-hover:bg-blue-50/50 transition-colors` to next stop area
- Remove `Clock` icon import and usage from next stop row
- Change next stop time from `font-mono text-zinc-500` to `font-medium text-zinc-900`
- Change route name from `text-base` to `text-lg`

### 2. route-status-badge.tsx (FR-023)

**Current → Target**:
- Change `font-medium` to `font-semibold tracking-wide`

### 3. hero-card.tsx (FR-006, FR-007, FR-008)

**Current → Target**:
- Import `Button` from shadcn/ui
- Replace translucent `<a>` with full-width `Button` using `asChild` wrapping an `<a>`:
  - Classes: `w-full bg-white text-blue-700 hover:bg-blue-50 font-semibold py-6 rounded-xl shadow-sm`
- Add `animate-bounce` to `Navigation` icon
- Restructure timestamp: move below button, center it, add `opacity-80`
- Move outdated warning inline with timestamp (both centered)

### 4. schedule-timeline.tsx (FR-009 to FR-015, FR-012, FR-013)

**Current → Target**:
- Import `Button` from shadcn/ui
- **Title**: change from `text-sm font-medium text-zinc-500` to `text-lg font-bold text-zinc-900`
- **"Ver paradas" button**: replace plain `<button>` with `Button variant="secondary" size="sm"` styled `text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg`
- **Current node**: add `border-2 border-blue-600` and `shadow-sm shadow-blue-200`, change inner dot from `size-3` to `size-2`
- **Future node**: wrap in `size-6` container with `bg-white border-2 border-zinc-200`, add `group` class to row, add `group-hover:border-blue-300 transition-colors`
- **Past node**: change from `bg-zinc-200` to `bg-zinc-100 border-2 border-white`
- **Vertical line**: change from `bg-zinc-200` to `bg-zinc-100`
- **Row separators**: add `border-b border-zinc-50` to each row (except last)
- **Future stop text**: add `group-hover:text-zinc-900 transition-colors`

### 5. announcement-card.tsx (FR-016 to FR-019, FR-022)

**Current → Target**:
- Import `Card`, `CardContent` from shadcn/ui, `Badge` from shadcn/ui
- Wrap in `Card` (add `border-zinc-100` for default, `border-rose-200 shadow-rose-100/50` for urgent)
- Replace inner div with `CardContent`
- Replace custom badge spans with `Badge` component:
  - Urgent: `Badge variant="destructive"` with custom classes `bg-rose-100 text-rose-700 hover:bg-rose-100 border-none shadow-none rounded text-[10px]`
  - Info: `Badge variant="secondary"` with custom classes `bg-zinc-100 text-zinc-600 hover:bg-zinc-100 border-none shadow-none rounded text-[10px]`
- Change title from `text-base font-semibold` to `text-lg font-bold`
- Add `leading-relaxed` to body text
- Add `font-medium` to date text

### 6. bottom-nav.tsx (FR-024 to FR-027)

**Current → Target**:
- Replace `Megaphone` import with `Bell` from lucide-react
- Change icon className from `size-5` to `size-6` (24px)
- Change icon container from `rounded-lg` to `rounded-xl`
- Change nav item layout from `flex-1` to `w-20` with `justify-around` on container
- Add `pb-[env(safe-area-inset-bottom)]` to the nav element

### 7. Page files (FR-020)

**page.tsx (home)**: Change title from `text-xl` to `text-2xl`
**avisos/page.tsx**: Change title from `text-xl` to `text-2xl`
**routes/[routeId]/page.tsx (FR-005)**: Replace plain back `<button>` with shadcn `Button variant="ghost" size="icon"` with `className="rounded-full"`

### 8. layout.tsx — Viewport Config (R5)

**Root layout** (`src/app/layout.tsx`): Add Next.js `viewport` export with `viewportFit: "cover"` to enable `env(safe-area-inset-bottom)` on notched devices.

## Post-Design Constitution Re-Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | PASS | No new abstractions. Using existing shadcn components (Card, Badge, Button). `asChild` pattern for hero button preserves link semantics without adding complexity. |
| II. Explicit Trade-offs | PASS | Trade-off documented: shadcn wrappers add nesting but gain consistency. Badge `rounded` override is minimal and avoids new variants. |
| III. Branch & Merge | PASS | Feature branch, PR targets `dev`. |
| IV. Quality Gates | PASS | lint + typecheck + build. |
| V. Stack Constraints | PASS | All within locked stack. Zinc palette enforced (not slate). |

**Post-design gate result**: ALL PASS.

## Complexity Tracking

> No constitution violations to justify. All changes use existing components and patterns.
