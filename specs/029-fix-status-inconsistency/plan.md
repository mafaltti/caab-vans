# Implementation Plan: Fix Status Inconsistency

**Branch**: `029-fix-status-inconsistency` | **Date**: 2026-03-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/029-fix-status-inconsistency/spec.md`

## Summary

Fix the route list status badge to use the shift lifecycle state (`runStatus`) instead of only `isRunning` (schedule window + GPS freshness). The badge currently shows "Em operação" for all vans within the schedule window, even if no shift has been started. The fix maps `runStatus` to 4 distinct badge variants: "Em operação" (green), "Aguardando início" (amber), "Encerrada" (muted emerald), "Fora de operação" (zinc). A minor backend fix is needed to stop nullifying `progress` when `runStatus === "completed"`.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: Next.js, React, TanStack Query, Tailwind CSS, shadcn/ui, Lucide icons
**Storage**: Supabase (Postgres) — no schema changes
**Testing**: Vitest (when applicable)
**Target Platform**: Mobile-first web app
**Project Type**: Web application (Next.js App Router with BFF)
**Performance Goals**: N/A (UI presentation fix, no performance impact)
**Constraints**: Constitution requires computed fields in BFF; badge logic is purely presentational
**Scale/Scope**: 7 files modified, ~120 lines changed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal change — expanding existing component, no new abstractions |
| II. Explicit Trade-offs | PASS | Consolidating waiting+idle into one badge (simpler UI vs. less granularity) |
| III. Branch & Merge Discipline | PASS | Working on feature branch, PR will target `dev` |
| IV. Quality Gates | PASS | Will run lint, typecheck, build before PR |
| V. Stack Constraints | PASS | Using existing stack (Tailwind, Lucide, Next.js). Computed runStatus stays in BFF |
| Security Constraints | PASS | No security changes |
| Timezone & Data Consistency | PASS | No time-related changes |

**Post-Phase 1 re-check**: No violations. The change modifies an existing component and two API response shapes. No new abstractions, dependencies, or architectural patterns introduced.

## Project Structure

### Documentation (this feature)

```text
specs/029-fix-status-inconsistency/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Research findings
├── data-model.md        # Phase 1: State-to-badge mapping
├── quickstart.md        # Phase 1: Testing guide
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (files to modify)

```text
src/
├── app/
│   ├── api/routes/
│   │   ├── route.ts                          # List API — stop nullifying progress on completed
│   │   └── [routeId]/route.ts                # Detail API — stop nullifying progress on completed
│   └── (public)/routes/[routeId]/page.tsx    # Detail page — pass runStatus to badge
├── components/public/
│   ├── route-status-badge.tsx                # Badge — accept runStatus, implement 4-variant mapping
│   ├── hero-card.tsx                         # Hero card — rewrite decision tree to match badge
│   └── route-card.tsx                        # List card — pass runStatus to badge
└── types/index.ts                            # No changes needed (types already exist)
```

**Structure Decision**: Existing Next.js App Router layout. All changes are modifications to existing files — no new files created.

## Implementation Approach

### Step 1: API fix — Stop nullifying progress on completed

**Files**: `src/app/api/routes/route.ts`, `src/app/api/routes/[routeId]/route.ts`

Both endpoints currently set `progress = null` when `runStatus === "completed"`. This prevents the frontend from receiving the "completed" status. Change to return a minimal progress object:

```typescript
// BEFORE:
if (runStatus === "completed") {
  progress = null;
}

// AFTER:
if (runStatus === "completed") {
  progress = {
    serviceDate,
    runStatus,
    shiftStartedAt: null,
    nextStopId: null,
    passedStopIds: [],
    etaNextStopISO: null,
    etaNextStopMinutes: null,
    delayMinutes: null,
    etaSource: null,
  };
}
```

### Step 2: Expand RouteStatusBadge component

**File**: `src/components/public/route-status-badge.tsx`

Change the component to accept optional `runStatus` and `scheduleStatus` props. Determine badge variant using priority-based mapping:

1. `runStatus === "in_progress"` → "Em operação" (emerald, pulsing dot)
2. `runStatus === "idle" && isRunning` → "Em operação" (emerald, pulsing dot) — between shifts but GPS fresh
3. `runStatus === "waiting" || "idle"` + `scheduleStatus === "ended"` → "Fora de operação" (zinc) — missed window
4. `runStatus === "waiting" || "idle"` → "Aguardando início" (amber)
5. `runStatus === "completed"` → "Encerrada" (muted emerald, no pulsing dot)
6. `scheduleStatus === "active"` → "Aguardando início" (amber) — no route_run, in schedule
7. Default → "Fora de operação" (zinc)

### Step 3: Pass runStatus through RouteCard

**File**: `src/components/public/route-card.tsx`

Pass `route.progress?.runStatus` and `route.scheduleStatus` to `RouteStatusBadge`.

### Step 4: Pass runStatus through detail page header

**File**: `src/app/(public)/routes/[routeId]/page.tsx`

Pass `route.progress?.runStatus` and `route.scheduleStatus` to `RouteStatusBadge` in the header section.

### Step 5: Rewrite HeroCard decision tree

**File**: `src/components/public/hero-card.tsx`

The original HeroCard had an incomplete decision tree — it didn't handle `runStatus === "idle"` and used a `!isRunning` catch-all that overrode meaningful `runStatus` information, causing badge/hero inconsistencies for 3 state combinations.

Rewrite the decision tree to match the badge mapping for all 13 reachable state combinations:

1. `completed` → "Rota encerrada por hoje" (emerald)
2. `in_progress && !isRunning` → "Em operação" + "Localização desatualizada" warning (blue card)
3. `waiting || (idle && !isRunning)` + `scheduleStatus === "ended"` → "Programação encerrada por hoje" (zinc)
4. `waiting || (idle && !isRunning)` → "Aguardando início da rota" (amber)
5. `scheduleStatus === "ended"` → "Programação encerrada por hoje" (zinc)
6. `!isRunning && scheduleStatus === "active"` → "Aguardando início da rota" (amber)
7. `!isRunning` → "Fora de operação" (zinc)
8. `!nextStop` → "Nenhum horário disponível" (zinc)
9. Full blue gradient card with next stop, ETA, location button

## Complexity Tracking

No constitution violations to justify.

**Implementation note**: The HeroCard rewrite (Step 5) was not in the original plan — it was discovered during testing that 3 of 13 state combinations had badge/hero inconsistencies. This is the biggest change (~40 lines) and was unplanned.
