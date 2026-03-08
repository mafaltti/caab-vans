# Research: Fix Stale GPS Guard

**Date**: 2026-03-06
**Feature**: 043-fix-stale-gps-guard

## R1: Cold-Start GPS Behavior on Android

**Decision**: Use gap-based detection (`Date.now() - lastSentTime > 120_000`) rather than a cold-start flag.

**Rationale**: The `lastSentTime` variable is persisted to AsyncStorage (`@lastSentAt`) and restored on every cold start. A simple `lastSentTime === 0` check would only work on first-ever install. The gap-based approach correctly identifies cold-start scenarios regardless of how the app was started (manual launch, boot restart, OS respawn) by checking if the tracker has been silent for >2 minutes.

**Alternatives considered**:
- `lastSentTime === 0` — Broken: value is restored from AsyncStorage on cold start, so it's only 0 on first-ever run.
- Dedicated cold-start flag — Unnecessary complexity; the gap check covers all scenarios including first run (where `lastSentTime` defaults to 0).

## R2: Speed Threshold for Stationary Detection

**Decision**: Use `speed <= 1` (m/s, ~3.6 km/h) or `speed === null` as "stationary".

**Rationale**: Real-world data from Van 01 showed `speed: 0.08` while parked at CAAB. GPS drift commonly produces small non-zero speeds. A 1 m/s threshold safely separates drift from actual vehicle movement (walking speed is ~1.4 m/s, city driving is >8 m/s).

**Alternatives considered**:
- Strict `speed === 0 || speed === null` — Would miss parked vans with GPS drift, failing to activate in the exact scenario causing the bug.
- Higher threshold (2+ m/s) — Risks accepting stale fixes from slowly moving vans where position error matters.

## R3: Stale Threshold Values

**Decision**: 60s normal, 120s relaxed (cold-gap + stationary).

**Rationale**: Android GPS hardware typically acquires fresh satellite lock within 30-120 seconds after cold start. The 120s relaxed threshold covers the worst case while limiting maximum position staleness. For stationary vans, the position doesn't change, so a 120s-old fix is still accurate.

**Alternatives considered**:
- 90s relaxed — May be too short for indoor/garage scenarios.
- 180s relaxed — Unnecessarily long; 120s covers observed real-world acquisition times.

## R4: Diagnostic Filter Reason Approach

**Decision**: Extend `MinuteSummary` with per-reason counters (`flt_acc`, `flt_dup`, `flt_stale`) and add `reason` parameter to `logFiltered()`.

**Rationale**: The incident proved that a single `flt` counter is insufficient for field diagnosis. Per-reason counters in the existing summary format preserve the compact one-row-per-minute design (no log bloat) while adding needed granularity.

**Alternatives considered**:
- Individual `logEvent("state_change", ...)` per filtered fix — Log spam: ~9 filtered fixes/minute would fill the 1100-entry log in ~2 hours.
- Separate event type per filter — Same log spam problem.
- Bitmap/flags approach — Overcomplicated for 3 distinct reasons.

## R5: Affected Files

| File | Change |
|------|--------|
| `apps/van-tracker/src/storage/diag-log.ts` | Extend `MinuteSummary` interface, update `logFiltered()` signature, update `ensureCurrentMinute()` defaults, update `countOf()` |
| `apps/van-tracker/src/location/task.ts` | Update stale fix guard logic (lines 261-265), pass reason to all `logFiltered()` call sites (lines 251, 257, 263) |
| `apps/van-tracker/app/diagnostics.tsx` | Update `MinuteRow` format string, update `SummaryBar` totals |

No new files needed. No server-side changes. No new dependencies.
