# Tasks: Clarify Next Stop Label

**Input**: Design documents from `/specs/013-clarify-next-stop-label/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, quickstart.md

**Tests**: Not requested — no test tasks included.

**Organization**: Single user story (P1). No setup or foundational phases needed — this is a text change in an existing component.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 - Unambiguous Next Stop Label (Priority: P1) 🎯 MVP

**Goal**: Replace the ambiguous "Parada atual / Próxima" label with "Próxima parada" in the schedule timeline to align with the hero card and eliminate user confusion.

**Independent Test**: Open any active route detail page → scroll to the schedule timeline → confirm the highlighted (current) stop shows "Próxima parada".

### Implementation for User Story 1

- [x] T001 [US1] Replace label text "Parada atual / Próxima" with "Próxima parada" in `src/components/public/schedule-timeline.tsx` (line 145)
  - **Goal**: Change the string literal from `Parada atual / Próxima` to `Próxima parada` inside the `<p>` tag rendered when `stop.status === "current"`.
  - **Files**: `src/components/public/schedule-timeline.tsx`
  - **Verify**: `npm run build` passes; visually confirm label reads "Próxima parada" on the current stop in the timeline.

**Checkpoint**: User Story 1 is complete — the timeline label is now consistent with the hero card.

---

## Phase 2: Polish & Quality Gates

**Purpose**: Run all quality gates required by the constitution before PR.

- [x] T002 Run lint, type-check, build, and tests to confirm no regressions
  - **Goal**: Ensure all quality gates pass: `eslint`, `tsc --noEmit`, `next build`, `vitest run`.
  - **Verify**: All four commands exit with zero errors.

- [ ] T003 Commit change and open PR targeting `dev` with summary and test plan
  - **Goal**: Create an atomic commit (`fix(public): clarify next stop label in schedule timeline`) and open a PR targeting `dev`.
  - **Verify**: PR is open on GitHub targeting `dev` with description including what changed, why, and how to test.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately.
- **Phase 2 (Polish)**: Depends on T001 completion.

### Execution Order

```
T001 → T002 → T003
```

All tasks are sequential — single file, single change, linear flow.

---

## Implementation Strategy

### MVP (Complete Feature)

1. Complete T001: Change the label text
2. Complete T002: Validate quality gates
3. Complete T003: Commit and open PR
4. **Done** — feature is a single atomic change

---

## Notes

- This is a 1-file, 1-line change — no parallelism opportunities.
- No data model, API, or structural changes.
- Commit after T001 as a single atomic change.
