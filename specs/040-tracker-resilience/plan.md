# Implementation Plan: Tracker Resilience

**Branch**: `040-tracker-resilience` | **Date**: 2026-03-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/040-tracker-resilience/spec.md`

## Summary

Improve the van tracker app's resilience to failures, efficiency with resources, and observability by operations. Changes span both the Expo tracker app (client) and the Next.js server (API + database). Key deliverables: eliminate silent data loss on 5xx errors, add batch flush endpoint, implement exponential backoff, detect Android task kill, piggyback health metadata on pings, add battery-adaptive GPS, sequence numbering, and engineering hygiene (Sentry, SecureStore, buffer mutex).

## Technical Context

**Language/Version**: TypeScript ~5.9 (both client and server)
**Primary Dependencies**: Expo SDK 55 (React Native 0.83), Next.js (App Router), Supabase (Postgres)
**Storage**: AsyncStorage (client buffer/state), PostgreSQL via Supabase (server pings)
**Testing**: Manual testing on Android device/emulator; vitest (server unit tests)
**Target Platform**: Android (primary), iOS (secondary) for tracker; Linux server for API
**Project Type**: Mobile app (Expo) + web service (Next.js BFF)
**Performance Goals**: Batch flush in single round trip; backoff cap 5 min; task kill detection within 60s
**Constraints**: Offline-capable, low battery tolerance, shared 3G hotspot, low-end Android devices
**Scale/Scope**: ~10 active vans, 12 pings/min per van moving, 1 ping/min stationary

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. KISS | PASS | All changes are targeted fixes to existing code. No speculative abstractions. |
| I. DRY | PASS | Buffer mutex (FR-020) is the only new abstraction; justified by confirmed race condition. |
| I. YAGNI | PASS | All features from confirmed analysis doc. No "just in case" additions. |
| II. Explicit Trade-offs | PASS | Trade-offs documented in research.md (D1-D10). |
| III. Branch & Merge | PASS | Feature branch `040-tracker-resilience` targets `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests required before merge. |
| V. Stack Constraints | PASS | Server changes follow Next.js Route Handlers. No Edge Functions. Tracker is Expo (outside web stack scope but consistent with project conventions). |
| Security | PASS | FR-019 improves security posture (SecureStore). Service role stays server-only. Ingestion token auth unchanged. |

**Post-Phase 1 re-check**: No violations introduced. Batch endpoint follows existing single-ping pattern. New columns are nullable (backward compatible). No new abstractions beyond buffer mutex.

## Project Structure

### Documentation (this feature)

```text
specs/040-tracker-resilience/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: decisions and rationale
├── data-model.md        # Phase 1: schema and type changes
├── quickstart.md        # Phase 1: dev setup and testing guide
├── contracts/
│   └── batch-tracking-api.md  # Phase 1: batch endpoint contract
├── checklists/
│   └── requirements.md  # Specification quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# Tracker App (Expo / React Native)
apps/van-tracker/
├── app/
│   ├── _layout.tsx              # Root layout (auto-resume)
│   ├── index.tsx                # Home screen (status, alerts, restart action)
│   └── settings.tsx             # Settings (token config)
├── src/
│   ├── api/
│   │   └── client.ts            # HTTP client (timeout, batch send)
│   ├── location/
│   │   ├── task.ts              # Background task (backoff, seq, health, 5xx fix)
│   │   └── tracking.ts          # GPS config (battery-adaptive accuracy)
│   ├── storage/
│   │   ├── buffer.ts            # Offline buffer (size, TTL, mutex)
│   │   ├── settings.ts          # Settings (SecureStore migration)
│   │   ├── tracking-state.ts    # State persistence
│   │   └── device-id.ts         # Device UUID
│   ├── lib/
│   │   └── haversine.ts         # Distance calculation
│   └── types.ts                 # LocationPoint (new fields)
└── package.json                 # Dependencies (expo-battery, expo-secure-store, sentry-expo)

# Server (Next.js)
src/
├── app/api/
│   ├── tracking/[vanId]/route.ts         # Existing endpoint (extended schema)
│   └── tracking-batch/[vanId]/route.ts   # New batch endpoint
├── lib/
│   ├── validators/tracking.ts            # Zod schema (new optional fields)
│   ├── tracking/osrm.ts                  # OSRM snap-to-road (unchanged)
│   └── tracking/infer-stop-progress.ts   # Geofence detection (unchanged)
└── ...

# Database
supabase/migrations/
└── 00007_tracker_resilience.sql  # New columns on van_location_pings
```

**Structure Decision**: Existing mobile + API structure. No new directories needed. Changes modify existing files plus one new API route and one migration.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
