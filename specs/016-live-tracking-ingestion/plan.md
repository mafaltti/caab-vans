# Implementation Plan: Live Tracking Ingestion

**Branch**: `016-live-tracking-ingestion` | **Date**: 2026-03-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/016-live-tracking-ingestion/spec.md`

## Summary

Add database tables for live tracking (location ping history, route runs, route run stops) and geofence/position columns on existing tables. Implement a `POST /api/tracking/[vanId]` endpoint that authenticates via ingestion token, validates GPS ping data with Zod, stores pings, and updates the van's latest position. Follows the established pattern from the existing ingest endpoint.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js
**Primary Dependencies**: Next.js 16 (App Router), Zod 4, Luxon 3, @supabase/supabase-js 2
**Storage**: Supabase self-hosted PostgreSQL
**Testing**: Vitest 4 (configured, no existing tests)
**Target Platform**: Linux server (Next.js SSR)
**Project Type**: Web service (BFF + frontend)
**Performance Goals**: <500ms per ping ingestion, 25 req/min/van sustained
**Constraints**: America/Bahia timezone for all date comparisons, service role key server-only, no Edge Functions
**Scale/Scope**: ~10 concurrent vans, ~1,200 pings/hour/van

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Follows existing ingest endpoint pattern. No new abstractions — only 2nd endpoint using token auth (below DRY threshold of 3). Migration adds only what's needed. |
| II. Explicit Trade-offs | PASS | Research.md documents all decisions with rationale and rejected alternatives. |
| III. Branch & Merge Discipline | PASS | Working on feature branch `016-live-tracking-ingestion`, PR will target `dev`. |
| IV. Quality Gates | PASS | Lint, type-check, build must pass. No tests in this phase (testing infra ready for Phase 2). |
| V. Stack Constraints | PASS | Uses Next.js Route Handlers, Zod validation, Luxon for timezone, Supabase service client. No Edge Functions. |
| Security Constraints | PASS | Service role key server-only. RLS enabled on new tables with no anon policies. Token auth via existing ingestion_token field. |
| Timezone & Data Consistency | PASS | Device timestamps converted via Luxon. 24h future cap uses server time. Service date derived in America/Bahia. |

**Post-design re-check**: All gates still pass. No new abstractions, no additional dependencies, no violations.

## Project Structure

### Documentation (this feature)

```text
specs/016-live-tracking-ingestion/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── tracking-endpoint.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    ├── 00001_initial_schema.sql     # Existing
    └── 00002_live_tracking.sql      # NEW — migration

src/
├── app/
│   └── api/
│       ├── ingest/[vanId]/route.ts  # Existing (reference pattern)
│       └── tracking/[vanId]/
│           └── route.ts             # NEW — tracking endpoint
├── lib/
│   ├── api/
│   │   ├── errors.ts               # Existing (reuse apiError, validationError)
│   │   └── rate-limit.ts           # Existing (reuse createRateLimiter)
│   ├── supabase/
│   │   └── server.ts               # Existing (reuse createServiceClient)
│   ├── validators/
│   │   ├── ingestion.ts            # Existing (reference pattern)
│   │   └── tracking.ts             # NEW — Zod schema for tracking pings
│   └── time.ts                     # Existing (reuse nowBahia)
└── types/
    └── index.ts                    # MODIFY — extend Van, ScheduleEntry, add new types
```

**Structure Decision**: Follows existing project layout. New files go in the same directories as their existing counterparts. No new directories needed except `src/app/api/tracking/[vanId]/`.

## Complexity Tracking

No constitution violations to justify. All changes follow existing patterns with minimal additions.
