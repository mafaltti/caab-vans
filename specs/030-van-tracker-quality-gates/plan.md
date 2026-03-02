# Implementation Plan: Van Tracker Quality Gates

**Branch**: `030-van-tracker-quality-gates` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/030-van-tracker-quality-gates/spec.md`

## Summary

Add `lint`, `typecheck`, and `check` npm scripts to the van-tracker Expo app (`apps/van-tracker/package.json`) so developers can run quality gates locally before committing. Additionally, add `react-dom` and `react-native-web` as peer dependency fixes and update `apps/van-tracker/app.json` with Android permission and EAS configuration. This aligns the van-tracker with the root project's quality gate conventions (Constitution §IV).

## Technical Context

**Language/Version**: TypeScript ~5.9.2 (Expo SDK 55)
**Primary Dependencies**: ESLint ^9.39.3 (eslint-config-expo ^55.0.0), TypeScript ~5.9.2
**Storage**: N/A
**Testing**: Manual verification (run scripts, confirm exit codes)
**Target Platform**: Developer workstation (npm scripts)
**Project Type**: Mobile app (Expo React Native) — developer tooling change only
**Performance Goals**: Quality gates complete in < 30 seconds on clean codebase
**Constraints**: Scripts must work on Windows (bash via Git Bash) and macOS
**Scale/Scope**: 3 scripts added to `package.json`; peer deps and `app.json` config updated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | **PASS** | Adding 3 one-line scripts — minimal change, no abstraction |
| II. Explicit Trade-offs | **PASS** | PR will document: adds scripts matching root project pattern |
| III. Branch & Merge Discipline | **PASS** | Feature branch targeting `dev` |
| IV. Quality Gates | **PASS** | This feature *enables* Constitution §IV for van-tracker |
| V. Stack Constraints | **PASS** | Uses existing ESLint + TypeScript tooling; `react-dom` and `react-native-web` added to resolve peer dependency conflicts |
| Security Constraints | **PASS** | Android permissions in `app.json` updated (location, foreground service) — review required for permission scope |
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
├── package.json         # Add lint/typecheck/check scripts + peer deps
└── app.json             # Android permissions cleanup + EAS config
```

**Structure Decision**: No new files or directories. This feature modifies `package.json` (scripts and dependencies) and `app.json` (Android permissions and EAS configuration).

## Complexity Tracking

No violations to justify. This is a 3-line change to a JSON file.
