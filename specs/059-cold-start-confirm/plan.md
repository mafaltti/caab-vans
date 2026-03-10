# Implementation Plan: Cold-Start Stop Confirmation

**Branch**: `059-cold-start-confirm` | **Date**: 2026-03-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/059-cold-start-confirm/spec.md`

## Summary

When a driver starts a shift mid-route (30+ minutes past the first scheduled stop), the system guesses their current stop using GPS + schedule time and presents a one-tap confirmation prompt. Confirming bulk-marks all earlier stops as passed with `pass_source: "manual"`, fixing the cold-start gap that causes the UI to show the wrong next stop. The solution enriches the existing start endpoint with an optional `coldStart` suggestion and adds a new confirmation endpoint that enforces the cold-start invariant, seeds stops if needed, and re-runs canonical prefix enforcement.

## Technical Context

**Language/Version**: TypeScript ~5.x (Next.js 16)
**Primary Dependencies**: Next.js App Router, Zod, Luxon, TanStack Query, Radix UI Dialog
**Storage**: PostgreSQL via Supabase (self-hosted) — no migration needed
**Testing**: Vitest
**Target Platform**: Web (mobile browser, driver dashboard)
**Project Type**: Web service (BFF + frontend)
**Performance Goals**: Confirmation reflected in public view within 3 seconds (SC-001)
**Constraints**: Canonical timezone `America/Bahia`; service role key server-only
**Scale/Scope**: ~5 routes, ~30 stops per route, ~5 drivers — low scale

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Canonical enforcement extracted (DRY ≥3: infer-stop-progress, resolve-route-progress, confirm-start-stop). Suggestion is simple two-pass filter. No speculative features. |
| II. Explicit Trade-offs | PASS | Trade-offs documented in research.md. PR will include before/after for refactored canonical logic. |
| III. Branch & Merge | PASS | Feature branch `059-cold-start-confirm`, PR targets `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests will be verified before merge. |
| V. Stack Constraints | PASS | Next.js Route Handlers, Zod validation, Luxon for time, Radix Dialog for modal. All within locked stack. |
| Security | PASS | Confirm endpoint uses `requireAuth()` + driver role + shift ownership. Service role key server-only. |
| Timezone | PASS | Schedule times in `HH:mm` format, all time comparisons in `America/Bahia` via Luxon. |

**Post-design re-check**: All gates still pass. The canonical enforcement extraction is the only structural change, justified by 3 consumers with identical logic.

## Project Structure

### Documentation (this feature)

```text
specs/059-cold-start-confirm/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # (Phase 2 — /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/api/routes/[routeId]/
│   ├── start/route.ts                    # MODIFY — add body parsing, cold-start detection, suggestion
│   └── confirm-start-stop/route.ts       # NEW — confirmation endpoint
├── lib/tracking/
│   ├── suggest-start-stop.ts             # NEW — two-pass suggestion algorithm
│   ├── enforce-canonical-prefix.ts       # NEW — extracted shared helper
│   ├── seed-route-run-stops.ts           # NEW — extracted seeding helper
│   ├── infer-stop-progress.ts            # MODIFY — use extracted helpers
│   └── haversine.ts                      # EXISTING — reuse haversineDistanceMeters
├── lib/validators/
│   └── route.ts                          # MODIFY — add Zod schemas
├── components/driver/
│   └── route-card.tsx                    # MODIFY — add confirmation modal
└── types/
    └── index.ts                          # EXISTING — PassSource already includes "manual"

src/__tests__/
├── lib/tracking/
│   ├── suggest-start-stop.test.ts        # NEW — unit tests for suggestion algorithm
│   └── enforce-canonical-prefix.test.ts  # NEW — unit tests for extracted helper
└── app/api/routes/
    └── confirm-start-stop.test.ts        # NEW — endpoint integration tests
```

**Structure Decision**: Follows existing Next.js App Router convention. New files go under `src/lib/tracking/` (business logic) and `src/app/api/routes/[routeId]/` (endpoint). Helpers extracted per DRY principle. No new directories beyond what's needed.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
