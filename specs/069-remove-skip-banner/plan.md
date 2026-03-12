# Implementation Plan: Remove Misleading Skipped-Stop Warning Banner

**Branch**: `069-remove-skip-banner` | **Date**: 2026-03-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/069-remove-skip-banner/spec.md`

## Summary

Remove the "Tempo estimado pode variar — parada(s) com alteração" banner from the commuter route detail page and route card. The ETA engine already filters out skipped stops, making this warning misleading. The detour banner ("Rota em desvio") is preserved. Dead code left behind (`hasExceptions` variable when only used for the skipped-stop banner) is cleaned up.

## Technical Context

**Language/Version**: TypeScript 5, React 19
**Primary Dependencies**: Next.js 16 (App Router), Tailwind CSS 4, Lucide icons
**Storage**: N/A — no data changes
**Testing**: Vitest (unit tests if existing tests cover affected components)
**Target Platform**: Mobile web (public commuter pages)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: N/A — removal only, no new rendering
**Constraints**: None — pure deletion of UI elements and dead code
**Scale/Scope**: 2 files affected, ~30 lines removed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Removing unnecessary UI and dead code — net simplification |
| II. Explicit Trade-offs in PRs | PASS | PR will state: KISS applied — removing misleading banner, no trade-offs |
| III. Branch & Merge Discipline | PASS | Feature branch targets `dev` |
| IV. Quality Gates | PASS | Lint, typecheck, build, tests must pass before merge |
| V. Stack Constraints | N/A | No technology changes |
| Security Constraints | N/A | No security surface affected |
| Timezone & Data Consistency | N/A | No time display changes |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/069-remove-skip-banner/
├── plan.md              # This file
├── spec.md              # Feature specification
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (affected files)

```text
src/
├── app/(public)/routes/[routeId]/
│   └── page.tsx                    # Route detail page — remove 2 banner blocks + hasExceptions
└── components/public/
    └── route-card.tsx              # Route list card — change banner to detour-only
```

## Changes

### File 1: `src/app/(public)/routes/[routeId]/page.tsx`

**Remove:**
1. The `hasExceptions` variable (line ~128) — only consumer was the skipped-stop banner.
2. The skipped-stop banner block in the map layout (lines ~249-256) — the `{hasExceptions && !isDetourActive && ...}` block.
3. The skipped-stop banner block in the card layout (lines ~307-314) — the identical `{hasExceptions && !isDetourActive && ...}` block.

**Keep intact:**
- The detour banner blocks (`{isDetourActive && ...}`) in both layouts.
- The `isDetourActive` and `detourReasonCode` variables (still used by detour banners).
- The `skippedStopIds` variable (still passed to `ScheduleTimeline`).
- The `DETOUR_PUBLIC_LABELS` map (still used by detour banners).

### File 2: `src/components/public/route-card.tsx`

**Change:**
- The `hasExceptions` condition currently triggers for both `hasSkippedStops` and `isDetourActive`. Replace it with a detour-only check: show the amber pill only when `isDetourActive` is true, displaying "Rota em desvio". Remove the "Parada(s) com alteração" branch entirely.

**Keep intact:**
- The detour pill UI (amber background, AlertTriangle icon, "Rota em desvio" text).

## Verification

1. **Lint**: `npx eslint src/app/\(public\)/routes/\[routeId\]/page.tsx src/components/public/route-card.tsx`
2. **Typecheck**: `npx tsc --noEmit`
3. **Build**: `npx next build`
4. **Manual test**: Open a route with skipped stops — confirm no warning banner; open a route with active detour — confirm detour banner still shows.
