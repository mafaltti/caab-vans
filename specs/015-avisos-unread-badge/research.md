# Research: Functional Unread Badge for Avisos Tab

**Branch**: `015-avisos-unread-badge` | **Date**: 2026-03-01

## R1: Client-side read state storage mechanism

**Decision**: Use `localStorage` with a single ISO 8601 timestamp key.

**Rationale**: The app has no public user authentication, so server-side tracking would require inventing a device identity (cookie or fingerprint). localStorage is the simplest storage that persists across browser sessions. A single timestamp is sufficient because the badge is binary (dot/no-dot) — no per-announcement granularity is needed.

**Alternatives considered**:
- `sessionStorage` — rejected because read state would reset on every browser close, violating FR-006.
- Server-side `announcement_reads` table — rejected as overkill; no user identity exists for public users (YAGNI).
- Per-announcement ID set in localStorage — rejected because it requires pruning logic and adds complexity for no additional UX value (KISS).

## R2: Timestamp comparison approach

**Decision**: Compare ISO 8601 strings lexicographically (`announcement.createdAt > lastSeenAt`).

**Rationale**: The API already returns `createdAt` as an ISO 8601 string (e.g., `"2026-03-01T10:30:00.000Z"`). ISO 8601 strings sort correctly in lexicographic order. No Luxon or Date parsing is needed for the comparison itself.

**Alternatives considered**:
- Parse to `Date` objects and compare `.getTime()` — rejected as unnecessary overhead; string comparison is correct and simpler.
- Parse with Luxon for timezone-aware comparison — rejected because both timestamps are in UTC (server `created_at` and `new Date().toISOString()`), so timezone is irrelevant for ordering.

## R3: SSR safety for localStorage access

**Decision**: Read localStorage inside a `useEffect` (not during render/SSR).

**Rationale**: Next.js App Router can server-render `"use client"` components on the first load. `localStorage` is not available during SSR. Reading it in `useEffect` ensures it only runs in the browser. The hook initializes `lastSeenAt` as `null` (SSR-safe default) and updates after mount.

**Alternatives considered**:
- `typeof window !== "undefined"` guard during render — rejected because it can cause hydration mismatches (server renders without localStorage, client renders with it).
- Dynamic import with `ssr: false` — rejected as overly complex for a simple state read.

## R4: When to set the "last seen" timestamp

**Decision**: Set on Avisos page mount, after announcements data is loaded.

**Rationale**: Setting the timestamp after data loads ensures the user actually saw content. If we set it on page mount before data arrives, the user might see a loading spinner, leave, and the badge would incorrectly clear.

**Alternatives considered**:
- Set on page mount regardless — rejected because it clears badge even if user sees only a loading state.
- Set after a delay (e.g., 2 seconds) — rejected as arbitrary and unnecessarily complex (KISS).
- Set on scroll or visibility — rejected as overkill for a simple page view (YAGNI).

## R5: Existing codebase patterns

**Findings from exploration**:
- The project uses `"use client"` directive for interactive components.
- TanStack Query hooks follow the pattern in `src/lib/queries/use-announcements.ts`.
- Custom hooks don't have a dedicated directory yet, but `src/lib/hooks/` is the conventional Next.js location.
- The `BottomNav` already imports and uses `useAnnouncements()` — adding another hook is consistent.
- The Avisos page already imports `useAnnouncements()` — adding a second hook import is consistent.
