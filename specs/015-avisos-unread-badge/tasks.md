# Tasks: Functional Unread Badge for Avisos Tab

**Input**: Design documents from `/specs/015-avisos-unread-badge/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Not explicitly requested in feature specification. Omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Hook Creation)

**Purpose**: Create the shared `useAvisosReadState` hook that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 Create `useAvisosReadState` hook in `src/lib/hooks/use-avisos-read-state.ts` — implement `useState` + `useEffect` to read `avisos_last_seen_at` from localStorage on mount (SSR-safe), expose `lastSeenAt: string | null`, `markAsSeen(): void` (writes `new Date().toISOString()` to localStorage and updates state), and `hasUnread(announcements: AnnouncementResponse[]): boolean` (returns true if any `announcement.createdAt > lastSeenAt`, or if `lastSeenAt` is null and announcements exist)

**Checkpoint**: Hook is created and importable. No visible behavior change yet.

---

## Phase 2: User Story 1 — Badge Alerts User to New Notices (Priority: P1) 🎯 MVP

**Goal**: Replace the current "urgent-only" badge with an unread-based badge that appears when new announcements exist since the user's last visit. Reposition the dot closer to the bell icon.

**Independent Test**: Publish a new announcement → badge appears for users who haven't visited Avisos. No active announcements → no badge. First-time visitor with announcements → badge shows.

### Implementation for User Story 1

- [x] T002 [US1] Update badge logic in `src/components/public/bottom-nav.tsx` — import `useAvisosReadState`, replace `hasUrgent` (line 17: `data?.announcements?.some((a) => a.isUrgent)`) with `hasUnread(data?.announcements ?? [])` from the hook, remove the `isUrgent`-based derivation
- [x] T003 [US1] Reposition badge dot in `src/components/public/bottom-nav.tsx` — adjust the badge `<span>` positioning classes (currently `absolute -right-0.5 -top-0.5`) to sit tighter on the bell icon, visually matching Google AI Studio's badge placement (e.g., `absolute right-0.5 top-0.5` or tuned by visual inspection)

**Checkpoint**: Badge now shows based on unread state (localStorage comparison). Badge position is closer to the icon. Visiting Avisos does NOT yet clear the badge (US2 not implemented).

---

## Phase 3: User Story 2 — Badge Disappears After Viewing Notices (Priority: P1)

**Goal**: Clear the badge when the user visits the Avisos tab and the announcement data loads successfully.

**Independent Test**: See badge → navigate to Avisos → badge disappears. Navigate away → badge stays hidden. New announcement published → badge reappears on next poll.

### Implementation for User Story 2

- [x] T004 [US2] Mark announcements as seen in `src/app/(public)/avisos/page.tsx` — import `useAvisosReadState`, call `markAsSeen()` inside a `useEffect` that triggers when `data` is available and `isLoading` is false (ensuring timestamp is only set after announcements are visible, not during loading/error states)

**Checkpoint**: Full badge lifecycle works — shows for new announcements, clears on visit, reappears when new content arrives.

---

## Phase 4: User Story 3 — Badge Persists Across Browser Sessions (Priority: P2)

**Goal**: Read state survives browser close/reopen because localStorage persists by default.

**Independent Test**: Visit Avisos → close browser → reopen → badge stays hidden. Clear browser storage → badge reappears.

> **Note**: This user story is inherently satisfied by the localStorage implementation in T001. No additional code changes are needed. This phase exists only for verification.

- [x] T005 [US3] Verify persistence behavior — manually test: (1) visit Avisos, (2) close browser tab, (3) reopen app, (4) confirm badge remains hidden. Then (5) clear localStorage via DevTools, (6) confirm badge reappears if announcements exist.

**Checkpoint**: All three user stories are complete and independently verified.

---

## Phase 5: Polish & Quality Gates

**Purpose**: Ensure all quality gates pass before PR

- [x] T006 Run lint check (`npx eslint .`) and fix any issues
- [x] T007 Run type check (`npx tsc --noEmit`) and fix any issues
- [x] T008 Run build (`npx next build`) and verify success
- [x] T009 Run existing tests (`npx vitest run`) and verify nothing is broken

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **User Story 1 (Phase 2)**: Depends on Phase 1 (hook must exist)
- **User Story 2 (Phase 3)**: Depends on Phase 1 (hook must exist). Independent of US1 — can run in parallel with Phase 2
- **User Story 3 (Phase 4)**: Depends on Phases 1–3 (verification only)
- **Polish (Phase 5)**: Depends on all implementation phases

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T001 (hook). Modifies `bottom-nav.tsx`.
- **User Story 2 (P1)**: Depends on T001 (hook). Modifies `avisos/page.tsx`. Independent of US1 (different file).
- **User Story 3 (P2)**: No code changes. Verification depends on US1 + US2 being complete.

### Parallel Opportunities

- **T002 + T003**: Can run sequentially in same file (`bottom-nav.tsx`) or as a single edit pass
- **T002/T003 + T004**: Can run in parallel — different files (`bottom-nav.tsx` vs `avisos/page.tsx`)
- **T006 + T007 + T008 + T009**: Quality gate checks can run in parallel

---

## Parallel Example: User Stories 1 & 2

```text
# After T001 (hook) is complete, launch US1 and US2 in parallel:

# US1 (bottom-nav.tsx):
T002: Update badge logic to use hasUnread
T003: Reposition badge dot

# US2 (avisos/page.tsx) — PARALLEL with above:
T004: Add markAsSeen on page mount
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete T001: Create hook (foundational)
2. Complete T002 + T003: Badge shows for unread + repositioned (US1)
3. Complete T004: Badge clears on visit (US2)
4. **STOP and VALIDATE**: Full badge lifecycle works end-to-end
5. Complete T005: Verify persistence (US3)
6. Complete T006–T009: Quality gates

### Incremental Delivery

1. T001 → Hook ready (no visible change)
2. T002 + T003 → Badge logic + position updated (US1 testable)
3. T004 → Badge clears on visit (US2 testable, full cycle complete)
4. T005 → Persistence verified (US3 confirmed)
5. T006–T009 → Ready for PR

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US3 requires no code — localStorage persistence is inherent in the hook design
- Total code changes: 1 new file, 2 modified files
- Commit after each phase for clean git history
