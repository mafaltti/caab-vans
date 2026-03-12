# Tasks: Remove Misleading Skipped-Stop Warning Banner

**Input**: Design documents from `/specs/069-remove-skip-banner/`
**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: Not requested — no test tasks included.

**Organization**: Single user story (P1), no setup or foundational phases needed (existing project, no new dependencies).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Commuter views route without misleading banner (Priority: P1)

**Goal**: Remove the "Tempo estimado pode variar — parada(s) com alteração" banner from all commuter-facing views while preserving the detour banner and skipped-stop visual markers in the timeline.

**Independent Test**: Open a route detail page for a running route with skipped stops — verify no "parada(s) com alteração" banner appears. Open a route with an active detour — verify "Rota em desvio" banner still shows.

### Implementation

- [x] T001 [P] [US1] Remove `hasExceptions` variable and both `{hasExceptions && !isDetourActive && ...}` banner blocks (map layout + card layout) in `src/app/(public)/routes/[routeId]/page.tsx`
- [x] T002 [P] [US1] Replace `hasExceptions` with detour-only check and remove "Parada(s) com alteração" text branch in `src/components/public/route-card.tsx`

**Checkpoint**: No "parada(s) com alteração" banner renders anywhere. Detour banner and skipped-stop timeline markers remain functional.

---

## Phase 2: Polish & Cross-Cutting Concerns

- [x] T003 Run quality gates: lint, typecheck, and build (`eslint`, `tsc --noEmit`, `next build`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies — can start immediately
- **Phase 2**: Depends on Phase 1 completion

### Parallel Opportunities

- T001 and T002 can run in parallel (different files, no shared state)

---

## Implementation Strategy

### MVP (single pass)

1. Complete T001 + T002 in parallel
2. Run T003 (quality gates)
3. Done — ready for PR

---

## Notes

- T001 and T002 touch different files with no shared imports — safe to parallelize
- No backend or API changes needed
- `skippedStopIds` variable in `page.tsx` is still used by `ScheduleTimeline` — do NOT remove it
- `isDetourActive`, `detourReasonCode`, and `DETOUR_PUBLIC_LABELS` in `page.tsx` are still used by detour banners — do NOT remove them
