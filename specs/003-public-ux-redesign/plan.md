# Implementation Plan: Public Screens UX Redesign

**Branch**: `003-public-ux-redesign` | **Date**: 2026-02-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-public-ux-redesign/spec.md`

## Summary

Redesign all public-facing screens (routes list, route detail, announcements) to match the AI Studio prototype UX. Key changes: enhanced route cards with progress and icons, gradient hero card for next stop, vertical timeline replacing flat schedule list, redesigned announcement cards with urgency badges, enhanced bottom navigation with notification dot, and smooth page transition animations using the `motion` library. One minor additive BFF change (route progress fields). No database changes.

## Technical Context

**Language/Version**: TypeScript (Next.js 16.1.6, React 19.2.3)
**Primary Dependencies**: TanStack Query 5.90.21, Tailwind CSS 4, shadcn/ui 3.8.5, Lucide React 0.575.0, Luxon 3.7.2, `motion` (NEW — to be added)
**Storage**: Supabase (Postgres) via BFF — no schema changes
**Testing**: Vitest
**Target Platform**: Mobile-first web app (browser)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Page transitions < 400ms, interaction feedback < 100ms, tab switch < 300ms (per spec SC-006/SC-007)
**Constraints**: Constitution locks Zinc base + Blue theme for shadcn/ui; extend with emerald/rose for status colors
**Scale/Scope**: 4 public pages, ~8 components modified/created, 1 API response updated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. KISS** | PASS | Reuses existing component patterns. `motion` library handles animation complexity that would be worse with manual CSS. No unnecessary abstractions. |
| **II. Explicit Trade-offs** | PASS | Trade-offs documented in research.md (R2: zinc vs slate, R4: BFF vs client, R5: BFF rule exception). |
| **III. Branch & Merge** | PASS | Working on feature branch `003-public-ux-redesign`. PR targets `dev`. |
| **IV. Quality Gates** | PASS | ESLint, tsc, next build, vitest must pass before PR. |
| **V. Stack Constraints** | PASS | Next.js App Router, Tailwind + shadcn/ui, TanStack Query, Zod, Luxon, Lucide. Adding `motion` for animations (not replacing anything). Zinc base preserved. |
| **Security** | N/A | No auth, key, or data exposure changes. Frontend-only redesign. |
| **Timezone** | PASS | All time display uses existing Luxon + America/Bahia patterns. No changes. |

**Post-Phase 1 Re-check**: PASS — No violations introduced. The additive BFF fields (R4) follow existing patterns and the constitution's computed-fields-in-BFF rule.

## Project Structure

### Documentation (this feature)

```text
specs/003-public-ux-redesign/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: decisions and rationale
├── data-model.md        # Phase 1: entity changes
├── quickstart.md        # Phase 1: setup guide
├── contracts/
│   ├── api-changes.md   # BFF response changes
│   └── component-interfaces.md  # Component prop contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (public)/
│   │   ├── layout.tsx                    # UPDATE: add AnimatePresence wrapper
│   │   ├── page.tsx                      # UPDATE: use new RouteCard
│   │   ├── avisos/
│   │   │   └── page.tsx                  # NEW: moved from announcements/
│   │   ├── announcements/
│   │   │   └── page.tsx                  # UPDATE: redirect to /avisos
│   │   └── routes/
│   │       └── [routeId]/
│   │           └── page.tsx              # UPDATE: use HeroCard + ScheduleTimeline
│   └── api/
│       └── routes/
│           └── route.ts                  # UPDATE: add totalStops, currentStopIndex
├── components/
│   └── public/
│       ├── route-card.tsx                # REWRITE
│       ├── route-status-badge.tsx        # UPDATE: pulsing dot
│       ├── hero-card.tsx                 # NEW (replaces next-stop-display + location-link-cta)
│       ├── schedule-timeline.tsx         # NEW (replaces schedule-list)
│       ├── announcement-card.tsx         # REWRITE
│       ├── bottom-nav.tsx               # REWRITE
│       └── page-transition.tsx          # NEW: animation wrapper
├── types/
│   └── index.ts                         # UPDATE: add progress fields, TimelineStop type
└── lib/
    └── queries/                         # NO CHANGES (existing hooks work as-is)
```

**Structure Decision**: Follows the existing Next.js App Router structure. All changes are within the existing `(public)` route group and `components/public/` directory. No new directories beyond what the feature requires. Three components are replaced (old files deleted after new ones are verified), three are rewritten in-place, one new animation utility component added.

## Complexity Tracking

No constitution violations requiring justification. The single new dependency (`motion`) is warranted by the animation requirements and avoids more complex manual alternatives (see research.md R1).
