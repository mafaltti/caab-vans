# Implementation Plan: Functional Unread Badge for Avisos Tab

**Branch**: `015-avisos-unread-badge` | **Date**: 2026-03-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-avisos-unread-badge/spec.md`

## Summary

Replace the current "urgent-only" badge logic on the Avisos tab with a timestamp-based unread indicator. The system stores the user's last visit time to `/avisos` in localStorage, compares it against the most recent announcement's `createdAt`, and shows/hides the red dot accordingly. Additionally, reposition the badge dot closer to the bell icon (aligned with Google AI Studio's badge placement). This is a pure client-side change — no database, API, or type modifications are needed.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router)
**Primary Dependencies**: React, TanStack Query (existing), localStorage (browser API)
**Storage**: Browser localStorage (single key: `avisos_last_seen_at`)
**Testing**: Vitest (unit tests for the hook logic)
**Target Platform**: Mobile web (modern browsers)
**Project Type**: Web application (Next.js)
**Performance Goals**: Badge state computed synchronously from cached data; no additional network requests
**Constraints**: Client-only; no SSR for localStorage reads (must run in `"use client"` components)
**Scale/Scope**: 3 files modified, 1 new hook file created

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | **PASS** | Single localStorage key + timestamp comparison. No abstractions, no server changes, no new dependencies. |
| II. Explicit Trade-offs | **PASS** | Trade-off: per-device only (no cross-device sync) — documented in spec Assumptions. |
| III. Branch & Merge Discipline | **PASS** | Feature branch `015-avisos-unread-badge` targets `dev`. |
| IV. Quality Gates | **PASS** | Lint, typecheck, build, tests will be run before PR. |
| V. Stack Constraints | **PASS** | Uses existing stack only (React hooks, TanStack Query, localStorage). No new dependencies. |
| Security Constraints | **PASS** | No secrets, no server changes, no PII stored. |
| Timezone & Data Consistency | **PASS** | Comparison uses ISO 8601 strings from server (`createdAt`) — no timezone conversion needed for greater-than comparison. |

**Post-Phase 1 re-check**: All gates still pass. No new dependencies or abstractions introduced.

## Project Structure

### Documentation (this feature)

```text
specs/015-avisos-unread-badge/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files touched)

```text
src/
├── app/
│   └── (public)/
│       └── avisos/
│           └── page.tsx              # MODIFY — mark as read on mount
├── components/
│   └── public/
│       └── bottom-nav.tsx            # MODIFY — replace badge logic
└── lib/
    └── hooks/
        └── use-avisos-read-state.ts  # CREATE — localStorage read state hook
```

**Structure Decision**: All changes fit within the existing project layout. The new hook goes in `src/lib/hooks/` alongside other custom hooks. No new directories beyond `hooks/` (if it doesn't already exist).

## Design Decisions

### D1: Single timestamp vs. per-announcement ID tracking

**Chosen**: Single `avisos_last_seen_at` timestamp in localStorage.

**Rationale**: Comparing one timestamp against `createdAt` is the simplest approach (KISS). Per-announcement ID tracking would require storing and pruning a growing set — unnecessary complexity for a dot/no-dot indicator.

### D2: Where to compute badge visibility

**Chosen**: Custom hook `useAvisosReadState` encapsulates both the localStorage access and the "has unread" derivation.

**Rationale**: The hook is consumed by `BottomNav` (to show/hide dot) and the Avisos page (to mark as read). Centralizing the logic in one hook avoids duplication (DRY) while keeping the API surface tiny.

### D3: When to record "last seen"

**Chosen**: On Avisos page mount (via `useEffect`).

**Rationale**: The simplest trigger. If the user navigates to `/avisos`, the content is visible and we record the timestamp. No need for scroll detection, visibility observers, or delays.

### D4: localStorage key format

**Chosen**: `avisos_last_seen_at` storing an ISO 8601 timestamp string.

**Rationale**: ISO strings are directly comparable with announcement `createdAt` values (lexicographic comparison works for ISO 8601). No parsing or timezone conversion needed.

## Implementation Approach

### Step 1: Create `useAvisosReadState` hook

**File**: `src/lib/hooks/use-avisos-read-state.ts` (new)

**Responsibilities**:
- Read `avisos_last_seen_at` from localStorage on mount
- Expose `lastSeenAt: string | null`
- Expose `markAsSeen(): void` — writes current ISO timestamp to localStorage and updates state
- Expose `hasUnread(announcements): boolean` — returns true if any announcement's `createdAt` is after `lastSeenAt` (or if `lastSeenAt` is null and announcements exist)

**Key details**:
- Uses `useState` + `useEffect` for SSR safety (read from localStorage only after mount)
- `markAsSeen` writes `new Date().toISOString()` to localStorage and updates React state
- `hasUnread` does a simple string comparison: `announcement.createdAt > lastSeenAt`

### Step 2: Update `BottomNav` badge logic and position

**File**: `src/components/public/bottom-nav.tsx`

**Changes**:
- Import `useAvisosReadState` instead of deriving `hasUrgent`
- Replace `hasUrgent` with `hasUnread(data?.announcements ?? [])` from the hook
- Remove the `isUrgent`-based check (line 17)
- Reposition the badge dot closer to the bell icon — adjust from `absolute -right-0.5 -top-0.5` to sit tighter on the icon (e.g., `absolute right-0.5 top-0.5` or similar, tuned visually to match Google AI Studio's badge placement)

### Step 3: Mark as read on Avisos page visit

**File**: `src/app/(public)/avisos/page.tsx`

**Changes**:
- Import `useAvisosReadState`
- Call `markAsSeen()` in a `useEffect` that runs when announcements data is successfully loaded (not during loading/error states)
- This ensures the timestamp is only set after the user can actually see content

## Complexity Tracking

> No constitution violations. Table intentionally empty.
