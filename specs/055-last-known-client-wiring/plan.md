# Implementation Plan: Last-Known Progress Display

**Branch**: `055-last-known-client-wiring` | **Date**: 2026-03-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/055-last-known-client-wiring/spec.md`

## Summary

Wire the existing backend `includeLastKnown=true` parameter into client data-fetching hooks so non-running routes display their last-known progress position. Changes span 2 hooks (query param), 3 components (timeline reorder, route card label, hero card branch), and 1 parent page (prop threading). Review-driven fixes also required backend changes: suppressing last-known for waiting routes in both route handlers, and nulling leaked ETA fields in `resolve-route-progress.ts`.

## Technical Context

**Language/Version**: TypeScript ~5, React 19, Next.js 16
**Primary Dependencies**: TanStack Query (polling/caching), Tailwind CSS 4, Lucide icons, Motion
**Storage**: N/A (reads existing backend data)
**Testing**: Vitest 4 with jsdom; pure function extraction pattern
**Target Platform**: Mobile web (responsive)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: N/A (no new fetches; existing 5s polling unchanged)
**Constraints**: No `@testing-library/react`; tests use pure function extraction
**Scale/Scope**: 10 files modified (7 client + 3 backend), 1 new test file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Reuses existing branch logic; no new abstractions; branch reorder is minimal diff |
| II. Explicit Trade-offs in PRs | PASS | Will document in PR: branch reorder vs. duplicate logic |
| III. Branch & Merge Discipline | PASS | Feature branch targets `dev` |
| IV. Quality Gates | PASS | lint + typecheck + build + tests will run |
| V. Stack Constraints | PASS | Uses TanStack Query, Tailwind, Lucide — all approved stack |
| Security Constraints | PASS | No secrets exposed; read-only UI change |
| Timezone & Data | PASS | Times displayed in HH:mm from backend (America/Bahia) |

**Post-Phase 1 re-check**: PASS — no new patterns, dependencies, or abstractions introduced.

## Project Structure

### Documentation (this feature)

```text
specs/055-last-known-client-wiring/
├── plan.md
├── research.md
├── data-model.md
└── checklists/
    └── requirements.md
```

### Source Code (files to modify)

```text
src/
├── lib/queries/
│   ├── use-routes.ts            # Add ?includeLastKnown=true
│   └── use-route-detail.ts      # Add ?includeLastKnown=true
├── components/public/
│   ├── schedule-timeline.tsx     # Reorder branches + gray dot for last-known
│   ├── route-card.tsx            # Add "Última posição" label
│   └── hero-card.tsx             # Add last-known early-return branch
├── app/(public)/routes/
│   └── [routeId]/page.tsx        # Thread nextStopMode to HeroCard + ScheduleTimeline
└── __tests__/components/
    ├── schedule-timeline.test.ts # Update + add last-known test cases
    └── route-card-last-known.test.ts  # New: label gating tests
```

**Structure Decision**: All changes fit within existing directory structure. No new directories or patterns needed.

## Implementation Phases

### Phase A: Wire Query Parameter (FR-001)

**Files**: `src/lib/queries/use-routes.ts`, `src/lib/queries/use-route-detail.ts`

**Changes**:
1. `use-routes.ts` line ~12: Change `/api/routes` → `/api/routes?includeLastKnown=true`
2. `use-route-detail.ts` line ~15: Change `/api/routes/${routeId}` → `/api/routes/${routeId}?includeLastKnown=true`

**Risk**: None. Flag only affects non-running routes; running routes return identical data.

### Phase B: Reorder Timeline Branches (FR-005, FR-010, FR-011)

**File**: `src/components/public/schedule-timeline.tsx`

**Changes**:
1. Move the `passedStopIds.length > 0` branch (line 51) above the `!isRunning` catch-all (line 44)
2. Add `nextStopMode` to `ScheduleTimelineProps` (optional, for rendering only)
3. In `TimelineNode` rendering: when `status === "current"` and `nextStopMode === "last_known"`, use zinc styling instead of blue and suppress pulse animation

**New branch order**:
```
1. runStatus === "waiting"       → all neutral  (unchanged)
2. runStatus === "completed"     → all past      (unchanged)
3. passedStopIds.length > 0      → derive states (MOVED UP — now runs for non-running too)
4. !isRunning                    → all neutral   (catch-all for routes with no progress)
5. !nextStopId                   → all past      (unchanged)
6. nextStopId fallback           → derive states (unchanged)
```

**Key invariant**: `waiting` and `completed` branches still exit before `passedStopIds`, preserving FR-010 and FR-011.

### Phase C: Route Card Label (FR-002, FR-003, FR-004)

**File**: `src/components/public/route-card.tsx`

**Changes**:
1. In the `nextStop` rendering block (line ~56): when `route.nextStopMode === "last_known"`, show "Última posição" label prefix instead of the default display
2. Add `nextStopMode !== "last_known"` guard to ETA rendering (review fix: backend can leak ETA for stale pointers)
3. Progress counter already renders when `currentStopIndex !== null` (works as-is)

**Access**: `route.nextStopMode` is already available since the component receives the full `RouteWithStatus` object.

### Phase D: Hero Card Branch (FR-007, FR-008)

**File**: `src/components/public/hero-card.tsx`

**Changes**:
1. Add `nextStopMode?: "live" | "last_known" | null` to `HeroCardProps`
2. Insert new early-return branch after `completed` check (line 50) and before `in_progress + !isRunning` check (line 53):
   ```
   if (!isRunning && nextStopMode === "last_known" && nextStop) → muted gray card
   ```
3. Card renders: MapPin icon (zinc-400), "Última posição conhecida" label, stop name, "às {time}" — all in muted zinc palette. No ETA, no GPS.

### Phase E: Thread Props in Parent Page

**File**: `src/app/(public)/routes/[routeId]/page.tsx`

**Changes**:
1. Add `nextStopMode={route!.nextStopMode}` to the `<HeroCard>` call (line ~256)
2. Add `nextStopMode={route!.nextStopMode}` to both `<ScheduleTimeline>` calls (lines ~240, ~280)

**Access**: `route` is `RouteDetail` which extends `RouteWithStatus` — `nextStopMode` is already present.

### Phase F: Tests (Verification)

**File**: `src/__tests__/components/schedule-timeline.test.ts`

New test cases:
1. `deriveTimelineStops` returns past/current/future when `!isRunning` AND `passedStopIds` populated (the key behavioral change)
2. `deriveTimelineStops` still returns all-neutral for `runStatus === "waiting"` even with passedStopIds
3. `deriveTimelineStops` still returns all-past for `runStatus === "completed"`
4. Update existing "returns all neutral when not running" test to reflect new behavior (passedStopIds now takes precedence)

**File**: `src/__tests__/components/route-card-last-known.test.ts`

New test cases (pure function extraction pattern):
1. Last-known label shown when `nextStopMode === "last_known"`
2. No last-known label when `nextStopMode === "live"` or `null`

## Complexity Tracking

No constitution violations to justify. All changes use existing patterns with minimal diff.

## Dependencies & Ordering

```
Phase A (hooks) → independent, can go first
Phase B (timeline) → independent of A
Phase C (route card) → independent of A (data was already in type)
Phase D (hero card) → independent of A
Phase E (parent page) → depends on B and D (new props must exist first)
Phase F (tests) → depends on B and C (tests validate the logic changes)
```

Recommended commit order: A → B → C → D → E → F (or A, then B+C+D in parallel, then E, then F).

### Phase G: Review-Driven Fixes (FR-004, FR-010)

**Files**: `src/app/api/routes/route.ts`, `src/app/api/routes/[routeId]/route.ts`, `src/lib/tracking/resolve-route-progress.ts`, `src/components/public/route-card.tsx`, `src/components/public/schedule-timeline.tsx`, `src/__tests__/tracking/routes-api.test.ts`, `src/__tests__/tracking/resolve-route-progress-idle.test.ts`

**Changes** (identified via PR review):
1. **Waiting-route suppression**: Both route handlers now check `progress.runStatus !== "waiting"` before populating last-known data. This prevents waiting routes from showing stale progress alongside "Aguardando início" badges.
2. **ETA leak fix**: `resolve-route-progress.ts` stale-pointer safeguard now nulls `etaNextStopMinutes` and `etaNextStopISO` alongside `nextStopId` (previously only nulled `nextStopId`).
3. **Client-side ETA guards**: Route-card and schedule-timeline now also check `nextStopMode !== "last_known"` before rendering ETA (defense-in-depth).
4. **Test coverage**: Added 6 API-level tests for waiting-route last-known suppression; strengthened idle test to assert ETA fields are null.
