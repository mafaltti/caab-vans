# Implementation Plan: Tracking System Hardening

**Branch**: `054-tracking-system-hardening` | **Date**: 2026-03-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/054-tracking-system-hardening/spec.md`

## Summary

Close five correctness and consistency gaps in the tracking system through targeted changes to existing modules. Make stop-passage confidence deterministic by fetching evidence once per inference pass (ordered, no arbitrary limit). Wire `includeLastKnown` through top-level route summary with a `nextStopMode` discriminator. Replace misleading `0 min` ETA in degraded fallback branches with explicit `etaStatus = "overdue"`. Make snapped confidence monotonic with a tiered scoring model. Add a standalone reconciliation script to auto-close orphaned shifts. No schema changes; two new public API fields.

## Technical Context

**Language/Version**: TypeScript ~5, Node.js (Next.js 16)
**Primary Dependencies**: Next.js App Router, Supabase JS client, Luxon, Zod
**Storage**: PostgreSQL via Supabase self-hosted (no schema changes in this feature)
**Testing**: Vitest (unit tests in `src/__tests__/tracking/`)
**Target Platform**: Linux VPS (Next.js via systemd, Caddy reverse proxy)
**Project Type**: Web service (BFF + public pages)
**Performance Goals**: Evidence query must handle full 5-minute ping window without pagination
**Constraints**: No Supabase Edge Functions, no `pg_cron`, canonical timezone `America/Bahia`
**Scale/Scope**: Single-fleet van tracking (~10 routes, ~10 vans, ~60 pings/5-min window per van)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Simplicity (KISS/DRY/YAGNI)** | PASS | All five changes are targeted fixes to existing code. No new abstractions introduced. Confidence score table replaces an existing `if/else` with equivalent complexity. Reconciliation script follows existing script pattern. |
| **II. Explicit Trade-offs** | PASS | Each research decision documents alternatives considered and rejection rationale. |
| **III. Branch & Merge Discipline** | PASS | Feature branch targets `dev`. Conventional commits. |
| **IV. Quality Gates** | PASS | All changes include test coverage. Existing tests must continue passing. |
| **V. Stack Constraints** | PASS | Uses locked stack: TypeScript, Next.js Route Handlers, Supabase JS, Luxon, Vitest. No Edge Functions. |
| **Security Constraints** | PASS | Reconciliation script uses service-role key server-side only. No new public access patterns. |
| **Timezone & Data Consistency** | PASS | All schedule calculations use `America/Bahia` via Luxon. |

### Post-Design Re-Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Simplicity** | PASS | Two new API fields (`etaStatus`, `nextStopMode`). No new abstractions. Confidence refactor replaces existing branches, same line count. |
| **II. Trade-offs** | PASS | `etaNextStopMinutes = null` for overdue is a behavioral change; documented in contracts. |
| **V. Stack Constraints** | PASS | Reconciliation script uses `npx tsx` + Supabase JS client, matching existing scripts. |

No violations. Complexity Tracking section not needed.

## Project Structure

### Documentation (this feature)

```text
specs/054-tracking-system-hardening/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── route-api-changes.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # Created by /speckit.tasks
```

### Source Code (repository root)

```text
src/
├── lib/tracking/
│   ├── infer-stop-progress.ts    # Evidence query + confidence scoring changes
│   ├── eta.ts                     # etaStatus field + overdue semantics
│   └── resolve-route-progress.ts  # Pass etaStatus through RouteProgress
├── app/api/routes/
│   ├── route.ts                   # nextStopMode + last-known summary wiring
│   └── [routeId]/route.ts         # Same changes as list endpoint
├── types/
│   └── index.ts                   # RouteProgress + RouteWithStatus type updates
└── __tests__/tracking/
    ├── infer-stop-progress.test.ts # Deterministic evidence + monotonic confidence tests
    ├── eta.test.ts                  # Overdue ETA tests
    └── routes-api.test.ts           # includeLastKnown summary tests

scripts/
└── reconcile-orphaned-shifts.ts    # NEW: orphaned shift cleanup
```

**Structure Decision**: All changes fit within the existing Next.js App Router structure. No new directories. One new script file following the established `scripts/` pattern.
