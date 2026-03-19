# Implementation Plan: Driver UX Improvements

**Branch**: `078-driver-ux-improvements` | **Date**: 2026-03-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/078-driver-ux-improvements/spec.md`

## Summary

Improve the driver mobile experience across three phases: (1) fix navigation friction by auto-navigating after shift start, auto-redirecting to active shifts, adding header home link, and migrating the route list to TanStack Query with 30s polling; (2) enrich the active route page with a progress indicator, shift timer, connection awareness banner, stop advancement feedback, and shift-end summary; (3) add PIN-based authentication with a new `driver_pins` table, login/management API endpoints, a PIN pad login screen, and admin PIN management UI.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+
**Primary Dependencies**: Next.js 16 (App Router), React 19, TanStack Query v5, Tailwind CSS 4, shadcn/ui, Zod, Luxon
**Storage**: Supabase self-hosted (PostgreSQL), Supabase GoTrue Auth
**Testing**: Vitest
**Target Platform**: Mobile web browsers (Android Chrome primary)
**Project Type**: Web application (Next.js App Router with BFF)
**Performance Goals**: 5s polling on active route, 30s polling on route list, PIN login < 10s
**Constraints**: Single-instance deployment, in-memory rate limiting, cookie-based auth sessions
**Scale/Scope**: ~10-20 drivers, ~10 routes, single deployment

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | All changes are directly requested. No speculative features. New components (`ShiftTimer`, `ConnectionBanner`) have clear single responsibility. |
| II. Explicit Trade-offs in PRs | PASS | Will document in PR descriptions per constitution. |
| III. Branch & Merge Discipline | PASS | Feature branch `078-driver-ux-improvements` from `dev`. PRs target `dev`. |
| IV. Quality Gates | PASS | ESLint, tsc, next build, vitest will run before PR. |
| V. Stack Constraints | PASS | Uses locked stack: Next.js App Router, TanStack Query, Tailwind, shadcn/ui, Zod, Supabase. No Edge Functions. BFF logic stays in route handlers. |
| Security Constraints | PASS | Service role key stays server-only (PIN endpoints). No client-side PIN access. |
| Timezone & Data Consistency | PASS | Shift timer uses raw timestamp arithmetic (no timezone needed). Schedule times remain `HH:mm` in `America/Bahia`. |

### Post-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | PASS | `driver_pins` is a single flat table. No new abstractions beyond what's needed. Two new components, both with clear single purpose. |
| II. Explicit Trade-offs | PASS | DRY: shift duration computation appears in timer + end-shift summary — only 2 occurrences, not abstracting per constitution (≥3 rule). |
| V. Stack Constraints | PASS | New dependency: `bcryptjs` for PIN hashing. Required — no existing hashing in app code (Supabase handles password hashing internally). |
| Security | PASS | PINs stored as bcrypt hash + SHA-256 digest. Rate limiting via existing pattern. Generic error messages. RLS enabled, service-role only. |

## Project Structure

### Documentation (this feature)

```text
specs/078-driver-ux-improvements/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Phase 1 data model (driver_pins)
├── quickstart.md        # Phase 1 dev setup guide
├── contracts/
│   └── pin-auth-api.md  # PIN login + management API contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── driver/
│   │   ├── login/page.tsx                          # MODIFY: Add PIN pad + email fallback
│   │   └── (protected)/
│   │       ├── layout.tsx                          # MODIFY: Wrap h1 in Link
│   │       ├── page.tsx                            # MODIFY: Migrate to TanStack Query + auto-redirect
│   │       └── routes/[routeId]/page.tsx           # MODIFY: Progress bar, stop feedback, shift-end summary
│   └── api/
│       ├── driver/auth/pin-login/route.ts          # NEW: PIN login endpoint
│       └── admin/drivers/[userId]/
│           ├── pin/route.ts                        # NEW: Set/reset PIN
│           └── generate-pin/route.ts               # NEW: Generate random PIN
├── components/driver/
│   ├── route-card.tsx                              # MODIFY: Auto-navigate, non-dismissible cold-start, shift-end summary
│   └── active-route/
│       ├── next-stop-hero.tsx                      # MODIFY: Add highlighted prop
│       ├── shift-timer.tsx                         # NEW: Elapsed shift timer
│       └── connection-banner.tsx                   # NEW: Connectivity awareness banner
├── lib/
│   ├── api/rate-limit.ts                           # EXISTING: Reuse for PIN rate limiting
│   ├── api/auth.ts                                 # EXISTING: Reuse requireRole
│   ├── api/errors.ts                               # EXISTING: Reuse error helpers
│   └── queries/
│       └── use-driver-routes.ts                    # NEW: TanStack Query hook for driver route list
└── types/index.ts                                  # EXISTING: No changes needed

supabase/migrations/
└── 00024_driver_pins.sql                           # NEW: driver_pins table migration
```

**Structure Decision**: Follows existing Next.js App Router conventions. New API routes under `src/app/api/`. New components under `src/components/driver/active-route/`. New query hook under `src/lib/queries/` (matching existing `use-routes.ts`, `use-route-detail.ts` pattern). Migration numbered sequentially after existing migrations.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
