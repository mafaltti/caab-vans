# Implementation Plan: Fix Stale GPS Guard Blocking All Pings

**Branch**: `043-fix-stale-gps-guard` | **Date**: 2026-03-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/043-fix-stale-gps-guard/spec.md`

## Summary

Fix the stale GPS fix guard that rejects 100% of GPS callbacks after cold start by using a gap-based detection with a relaxed 120-second threshold for stationary vans. Add per-reason filter counters to the diagnostic log for field diagnosis.

## Technical Context

**Language/Version**: TypeScript ~5.x (Expo/React Native)
**Primary Dependencies**: expo-location, expo-task-manager, AsyncStorage
**Storage**: AsyncStorage (local state persistence), no DB changes
**Testing**: Manual device testing (no automated test suite for tracker)
**Target Platform**: Android (Expo bare workflow)
**Project Type**: Mobile app (background location tracker)
**Performance Goals**: GPS callback processing <10ms; no added latency
**Constraints**: Background task — must remain lightweight; no new dependencies
**Scale/Scope**: 3 files modified, ~30 lines changed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal change: ~30 lines across 3 files. No new abstractions, no new files, no new dependencies. |
| II. Explicit Trade-offs | PASS | Trade-off: accepting slightly older GPS fixes for stationary vans vs. zero data. Documented in spec and research. |
| III. Branch & Merge Discipline | PASS | Feature branch `043-fix-stale-gps-guard`, PR will target `dev`. |
| IV. Quality Gates | PASS | TypeScript type-check + lint will be verified. No existing test suite to break. |
| V. Stack Constraints | N/A | Change is in the tracker app (Expo/RN), not the web app. No web stack constraints affected. |
| Security Constraints | N/A | No auth, keys, or API changes. Tracker-only logic. |
| Timezone | N/A | Uses `Date.now()` for age comparison, not displayed times. |

**Post-Phase 1 re-check**: Still PASS. No new entities, no schema changes, no API changes.

## Project Structure

### Documentation (this feature)

```text
specs/043-fix-stale-gps-guard/
├── plan.md              # This file
├── research.md          # Phase 0 output — completed
├── data-model.md        # Phase 1 output — completed
├── quickstart.md        # Phase 1 output — completed
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (affected files)

```text
apps/van-tracker/
├── src/
│   ├── storage/
│   │   └── diag-log.ts          # Extend MinuteSummary, update logFiltered()
│   └── location/
│       └── task.ts              # Update stale fix guard, pass filter reasons
└── app/
    └── diagnostics.tsx          # Update display format strings
```

**Structure Decision**: No new files or directories. All changes are modifications to existing files in the tracker app.

## Complexity Tracking

No violations to justify. The change is minimal and focused.
