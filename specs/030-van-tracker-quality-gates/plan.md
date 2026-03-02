# Implementation Plan: Van Tracker Quality Gates

**Branch**: `030-van-tracker-quality-gates` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/030-van-tracker-quality-gates/spec.md`

## Summary

Add `lint`, `typecheck`, and `check` npm scripts to the van-tracker Expo app (`apps/van-tracker/package.json`) so developers can run quality gates locally before committing. This aligns the van-tracker with the root project's quality gate conventions (Constitution §IV).

## Technical Context

**Language/Version**: TypeScript ~5.9.2 (Expo SDK 55)
**Primary Dependencies**: ESLint ^9.39.3 (eslint-config-expo ^55.0.0), TypeScript ~5.9.2
**Storage**: N/A
**Testing**: Manual verification (run scripts, confirm exit codes)
**Target Platform**: Developer workstation (npm scripts)
**Project Type**: Mobile app (Expo React Native) — developer tooling change only
**Performance Goals**: Quality gates complete in < 30 seconds on clean codebase
**Constraints**: Scripts must work on Windows (bash via Git Bash) and macOS
**Scale/Scope**: 3 scripts added to 1 file (`package.json`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | **PASS** | Adding 3 one-line scripts — minimal change, no abstraction |
| II. Explicit Trade-offs | **PASS** | PR will document: adds scripts matching root project pattern |
| III. Branch & Merge Discipline | **PASS** | Feature branch targeting `dev` |
| IV. Quality Gates | **PASS** | This feature *enables* Constitution §IV for van-tracker |
| V. Stack Constraints | **PASS** | Uses existing ESLint + TypeScript tooling, no new dependencies |
| Security Constraints | **N/A** | No security surface |
| Timezone & Data | **N/A** | No data or time operations |

**Gate result**: All gates pass. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/030-van-tracker-quality-gates/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
apps/van-tracker/
└── package.json         # Only file modified (add scripts)
```

**Structure Decision**: No new files or directories. This feature only modifies the existing `package.json` to add script entries.

## Complexity Tracking

No violations to justify. This is a 3-line change to a JSON file.
