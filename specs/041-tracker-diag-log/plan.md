# Implementation Plan: Tracker Diagnostic Log

**Branch**: `041-tracker-diag-log` | **Date**: 2026-03-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/041-tracker-diag-log/spec.md`

## Summary

Add a lightweight diagnostic log to the van-tracker Expo app that records tracker activity using two-tier storage: minute-level summaries for routine events and individual entries for state changes/errors. The log persists to AsyncStorage (max 1,100 entries, ~75KB), is viewable in-app via a new diagnostics screen, and can be shared as a JSON file via the native share sheet. This enables support staff and drivers to diagnose tracking failures without physical device access.

## Technical Context

**Language/Version**: TypeScript ~5.x, React Native 0.83.2, Expo SDK 55
**Primary Dependencies**: `@react-native-async-storage/async-storage` (existing), `expo-file-system`, `expo-sharing`
**Storage**: AsyncStorage (key: `@diagLog`, max 1,100 JSON entries, ~75KB)
**Testing**: Manual testing on Android device/emulator (no test framework in van-tracker currently)
**Target Platform**: Android (Expo managed workflow)
**Project Type**: Mobile app (Expo/React Native)
**Performance Goals**: Zero I/O in GPS callback hot path; ~1 AsyncStorage write per minute
**Constraints**: Must cover 15-hour shift without data loss; storage under 100KB
**Scale/Scope**: Single device, single driver, ~1,000 log entries per day

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Single module (~100 LOC), no new abstractions, no speculative features. Two-tier log is the minimum viable design for 15h coverage. |
| II. Explicit Trade-offs | PASS | Trade-off documented: ~1 minute of data loss on crash vs. zero disk I/O in hot path. |
| III. Branch & Merge Discipline | PASS | Feature branch `041-tracker-diag-log` targets `dev`. |
| IV. Quality Gates | PASS | Will run lint + typecheck before PR. No existing test suite in van-tracker. |
| V. Stack Constraints | PASS | Uses existing stack (Expo, AsyncStorage, Expo Router). No new native modules. expo-file-system and expo-sharing are Expo-managed packages. |
| Security Constraints | PASS | No server communication, no credentials in logs. Log data is device-local. |
| Timezone | N/A | Timestamps are Unix epoch (Date.now()), displayed in device local time on the diagnostics screen. |

**Post-Phase 1 re-check**: PASS — no new violations introduced by data model or integration design.

## Project Structure

### Documentation (this feature)

```text
specs/041-tracker-diag-log/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: dev setup guide
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (apps/van-tracker/)

```text
apps/van-tracker/
├── app/
│   ├── _layout.tsx          # MODIFY: register diagnostics route
│   ├── index.tsx            # (unchanged)
│   ├── settings.tsx         # MODIFY: add navigation to diagnostics
│   └── diagnostics.tsx      # CREATE: diagnostics screen UI
└── src/
    ├── location/
    │   ├── task.ts          # MODIFY: add diag-log calls at ~18 integration points
    │   └── tracking.ts      # MODIFY: add start/stop events + flush
    └── storage/
        ├── buffer.ts        # (unchanged)
        ├── device-id.ts     # (unchanged)
        ├── settings.ts      # (unchanged)
        ├── tracking-state.ts # (unchanged)
        └── diag-log.ts      # CREATE: two-tier diagnostic log module
```

**Structure Decision**: Follows existing van-tracker conventions. New storage module in `src/storage/`, new screen in `app/`. No new directories needed.
