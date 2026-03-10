# Implementation Plan: Fix Rate-Limit 429 Cascade

**Branch**: `061-fix-rate-limit-cascade` | **Date**: 2026-03-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/061-fix-rate-limit-cascade/spec.md`

## Summary

Fix multi-minute van tracker blackouts caused by rate-limit 429 cascading into exponential backoff. Three-part fix: (1) raise server rate limit from 25 to 40 req/min per van, (2) buffer 429'd single pings instead of dropping them, (3) stop treating 429 as a server error in the tracker's backoff logic. Server fix deploys immediately; client fixes go into the next tracker build.

## Technical Context

**Language/Version**: TypeScript ~5 (Next.js 16 server + Expo SDK 55 tracker)
**Primary Dependencies**: Next.js Route Handlers (server), expo-task-manager + AsyncStorage (tracker)
**Storage**: In-memory sliding-window Map (rate limiter), AsyncStorage (tracker buffer/backoff state)
**Testing**: Vitest (server — existing tracking tests mock the rate limiter); van-tracker has no test suite
**Target Platform**: Linux VPS (server), Android (tracker)
**Project Type**: Web service (server) + mobile app (tracker)
**Performance Goals**: 160 req/min sustained (4 vans × 40/min), <500ms p95 per ping
**Constraints**: No app update required for Phase 1; Phase 2 requires EAS build + device deployment
**Scale/Scope**: 4 vans, ~10 lines of code changed total across 4 files + documentation updates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal changes: 2 config values (server), 3 lines logic (tracker). No new abstractions. |
| II. Explicit Trade-offs in PRs | PASS | Trade-off: higher rate limit increases DB load but well within capacity (16/100 connections). |
| III. Branch & Merge Discipline | PASS | Feature branch `061-fix-rate-limit-cascade` targeting `dev`. |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests will run. Existing tracking tests cover the server paths. |
| V. Stack Constraints | PASS | No new dependencies. Uses existing Next.js Route Handlers + Expo patterns. |

No violations. Complexity Tracking section not needed.

## Project Structure

### Documentation (this feature)

```text
specs/061-fix-rate-limit-cascade/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output (no new contracts — existing unchanged)
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files touched)

```text
# Server (Phase 1 — no app update)
src/app/api/tracking/[vanId]/route.ts          # Line 11: maxRequests 25→40
src/app/api/tracking-batch/[vanId]/route.ts    # Line 11: maxRequests 25→40

# Tracker (Phase 2 — requires app update)
apps/van-tracker/src/location/task.ts          # 429 handler: buffer + no backoff

# Documentation updates
docs/OPERATIONS.md                             # Line 191: rate limit reference
docs/android-app+tracking/live-tracking-spec.md  # Lines 78, 182
docs/android-app+tracking/expo-background-geolocation-app.md  # Lines 167, 185
specs/018-expo-tracker-app/contracts/tracking-api.md  # Lines 121, 181
specs/040-tracker-resilience/contracts/batch-tracking-api.md  # Line 102
```

**Structure Decision**: No new files or directories. All changes are modifications to existing files. Server changes are in `src/app/api/`, tracker changes in `apps/van-tracker/src/location/`, documentation across `docs/` and `specs/`.
