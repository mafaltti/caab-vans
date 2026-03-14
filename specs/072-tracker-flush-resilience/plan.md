# Implementation Plan: Tracker Flush Resilience

**Branch**: `072-tracker-flush-resilience` | **Date**: 2026-03-13 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/072-tracker-flush-resilience/spec.md`

## Summary

Fix three interrelated bugs in the van-tracker app identified via production log analysis: (1) concurrent flush storm sending 3,613 duplicate pings on startup, (2) missing backoff for 429 rate-limit responses, and (3) geofence event replay on cold start. All changes are confined to two existing files in the tracker app — no new files, dependencies, or API changes required.

## Technical Context

**Language/Version**: TypeScript ~5, Expo SDK 55, React Native
**Primary Dependencies**: expo-location, expo-task-manager, @react-native-async-storage/async-storage
**Storage**: AsyncStorage (local key-value, already used for buffer + backoff state)
**Testing**: Vitest (unit tests for pure logic; manual device testing for OS-level behavior)
**Target Platform**: Android (Expo managed workflow, EAS Build)
**Project Type**: Mobile tracker app (background GPS service)
**Performance Goals**: Flush completes within OS background task window (~30s); steady-state 1 ping every 3–20s
**Constraints**: Must work in background task context (no UI thread); AsyncStorage I/O is async; OS can kill process at any time
**Scale/Scope**: Single device per van; buffer max 100 points; 5 geofence regions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Reuses existing `onSendFailure()` for 429; flush guard is a single boolean flag; geofence grace is one timestamp comparison. No new abstractions. |
| II. Explicit Trade-offs | PASS | PR will document: skip-vs-queue trade-off (skip chosen — simpler, avoids wasted empty flushes). |
| III. Branch & Merge Discipline | PASS | Feature branch targets `dev`. Conventional commits. |
| IV. Quality Gates | PASS | Lint, typecheck, build must pass. Unit tests added for backoff and flush guard logic. |
| V. Stack Constraints | N/A | No stack changes. Tracker app is Expo/RN, not Next.js. |
| Security Constraints | N/A | No auth/key changes. |
| Timezone & Data Consistency | N/A | No time display changes. |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/072-tracker-flush-resilience/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── quickstart.md        # Phase 1 output
```

### Source Code (files to modify)

```text
apps/van-tracker/src/
├── location/
│   ├── task.ts            # US1: flush guard, US2: 429 backoff
│   └── geofence-task.ts   # US3: boot grace period + in-memory dedup
└── (no new files)
```

**Structure Decision**: All changes fit within the existing file structure. The three bugs map to two existing files. No new modules, utilities, or abstractions are needed.

## Implementation Details

### US1: Flush Guard (FR-001, FR-002, FR-003)

**File**: `apps/van-tracker/src/location/task.ts`

Add a module-level `let isFlushing = false` flag. At the top of `flushBuffer()`, check the flag — if true, return immediately (skip). Set to `true` before work, `false` in a `finally` block. This is in-memory only, so a process restart naturally resets it.

**Changes**:
- Add `isFlushing` variable near line 40 (with other module state)
- Wrap `flushBuffer()` body (lines 104-148) with guard + finally

### US2: 429 Backoff (FR-004, FR-005, FR-006, FR-007)

**File**: `apps/van-tracker/src/location/task.ts`

Call the existing `onSendFailure()` function when a 429 is received — same as 5xx handling. This activates the existing `BACKOFF_DELAYS` progression (5s → 10s → 30s → 60s → 120s → 300s) and the existing backoff check at line 303. The backoff state is already persisted to AsyncStorage and hydrated on cold start.

**Changes**:
- Single-point 429 handler (line 356-361): add `await onSendFailure()` call
- Batch flush 429 handler (line 130-133): add `await onSendFailure()` call
- Update log messages to include backoff delay for observability

### US3: Geofence Boot Grace Period (FR-008, FR-009, FR-010)

**File**: `apps/van-tracker/src/location/geofence-task.ts`

Add a module-level `let bootTimestamp = Date.now()` (set once when the module is first loaded — which happens on cold start). In the task callback, before the existing dedup check, add: if `Date.now() - bootTimestamp < 15_000`, return early (suppress). Also add an in-memory `Map<string, number>` for rapid-fire dedup that doesn't depend on AsyncStorage persistence timing.

**Changes**:
- Add `bootTimestamp` constant at module level
- Add `BOOT_GRACE_MS = 15_000` constant
- Add boot grace check before dedup logic
- Add in-memory `recentEnters: Map<string, number>` for sub-second dedup
- Check in-memory map before async buffer read

## Test Strategy

**Unit tests** (Vitest):
- `flushBuffer` returns immediately when `isFlushing` is true
- `onSendFailure` is called on 429 (both single and batch paths)
- Geofence events within 15s of boot are suppressed
- Geofence events after 15s of boot are processed normally
- In-memory dedup map prevents duplicate entries within window

**Manual device tests** (via diagnostic log):
- Start app with buffered pings → verify flush count in log = 1
- Trigger 429 via server config → verify backoff delays in log
- Kill and restart app → verify no geofence_enter events in first 15s
