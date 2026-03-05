# Implementation Plan: Fix Duplicate Pings

**Branch**: `039-fix-duplicate-pings` | **Date**: 2026-03-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/039-fix-duplicate-pings/spec.md`

## Summary

Eliminate duplicate location pings from the van tracker by adding client-side guards (duplicate timestamp rejection, stale fix guard, stationary suppression, cold-start state hydration, buffer dedup) and server-side safety nets (unique constraint on `(van_id, device_ts)`, upsert instead of insert, strict isNewest comparison, staleness guard). Also tune the location callback interval from 3s/5m to 5s/10m.

## Technical Context

**Language/Version**: TypeScript 5.x (both Next.js server and Expo React Native tracker)
**Primary Dependencies**: Next.js (App Router), Expo + expo-location ~55.1.2, Supabase JS client, AsyncStorage, Luxon, Zod
**Storage**: PostgreSQL (via Supabase self-hosted), AsyncStorage (tracker device)
**Testing**: Vitest 4.0.18 (server-side), no test infra in van-tracker yet
**Target Platform**: Android (tracker app), Linux server (Next.js BFF + Supabase)
**Project Type**: Mobile tracker app + web service (two codebases in one repo)
**Performance Goals**: Stationary van: max 1 ping/min. Moving van: ~12 pings/min. Server rejects duplicates in <50ms.
**Constraints**: Parked vans must never show "Localização desatualizada" (10-min threshold, 9-min safety margin). Offline buffer max 50 points.
**Scale/Scope**: ~5 vans active, single-digit concurrent tracking sessions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal guards added to existing code paths; no new abstractions |
| II. Explicit Trade-offs | PASS | PR will document: suppression interval (60s) vs freshness threshold (10min) |
| III. Branch & Merge | PASS | Feature branch `039-fix-duplicate-pings` targets `dev` |
| IV. Quality Gates | PASS | lint + typecheck + build + tests will run. New vitest tests for server upsert logic |
| V. Stack Constraints | PASS | Uses existing stack: Supabase Postgres, Luxon, Zod, AsyncStorage. No new deps |
| Security | PASS | No new public endpoints. Ingestion token auth unchanged. Service role key stays server-only |
| Timezone | N/A | No time display changes; device_ts comparison uses raw milliseconds |

## Project Structure

### Documentation (this feature)

```text
specs/039-fix-duplicate-pings/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── tracking-api-changes.md
└── tasks.md
```

### Source Code (files touched)

```text
# Tracker app (client-side fixes)
apps/van-tracker/src/
├── location/
│   ├── task.ts              # FR-001..004: Guards + state hydration
│   └── tracking.ts          # FR-006: Interval tuning (3s→5s, 5m→10m)
├── storage/
│   └── buffer.ts            # FR-005: Consecutive dedup
└── types.ts                 # No changes (LocationPoint already correct)

# Server (safety net fixes)
src/app/api/tracking/[vanId]/
└── route.ts                 # FR-009..011: Upsert, strict isNewest, staleness guard

# Database migration
supabase/migrations/
└── 00006_dedup_pings.sql    # FR-007..008: Cleanup + unique constraint

# Tests
src/__tests__/tracking/
└── tracking-dedup.test.ts   # New: upsert, staleness, isNewest tests
```

**Structure Decision**: No new directories or abstractions. All changes are edits to existing files plus one new migration and one new test file.

## Complexity Tracking

No constitution violations. No new abstractions needed.
