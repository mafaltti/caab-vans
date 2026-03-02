# Research: Faster Polling Intervals

**Feature**: 028-faster-polling
**Date**: 2026-03-02

## R1: Current Polling Configuration

**Decision**: Reduce polling intervals as specified in the feature spec.

**Current state** (4 files, 5 values to change):

| File | Setting | Current | Target |
|------|---------|---------|--------|
| `src/app/providers.tsx:12` | `staleTime` | `30 * 1000` (30s) | `10 * 1000` (10s) |
| `src/app/providers.tsx:13` | `refetchOnWindowFocus` | `false` | `true` |
| `src/lib/queries/use-routes.ts:23` | `refetchInterval` | `60_000` (60s) | `15_000` (15s) |
| `src/lib/queries/use-route-detail.ts:28` | `refetchInterval` | `30_000` (30s) | `15_000` (15s) |
| `src/lib/queries/use-announcements.ts:22` | `refetchInterval` | `60_000` (60s) | `60_000` (unchanged) |

**Rationale**: 15s provides near-real-time status updates for passengers without meaningful load increase.

**Alternatives considered**:
- 10s interval: Too aggressive, diminishing returns vs. load
- 30s for routes list: Still too slow for status transitions
- WebSockets/Supabase Realtime: Over-engineered for current user scale

## R2: Request Pile-Up Prevention (FR-006)

**Decision**: No custom implementation needed — TanStack Query v5 handles this automatically.

**Rationale**: TanStack Query v5 (`@tanstack/react-query@^5.90.21`) uses request deduplication at the cache level. When `refetchInterval` fires and a previous request is still in-flight, the pending refetch is automatically skipped. The library coalesces identical fetches per unique `queryKey`.

**Alternatives considered**:
- Custom AbortController logic: Unnecessary, duplicates built-in behavior
- Disabling polling on slow connections: Over-engineering for current scope

## R3: refetchOnWindowFocus Behavior

**Decision**: Enable `refetchOnWindowFocus: true` globally.

**Rationale**: This is TanStack Query's default (it was explicitly disabled in the current config). Enabling it gives users immediate data refresh when they return to the app/tab — the single biggest UX improvement for zero extra polling cost. Combined with the reduced `staleTime` of 10s, any data older than 10s triggers an immediate refetch on focus.

**Alternatives considered**:
- Per-query opt-in: Unnecessary complexity — all queries benefit from this
- Custom visibilitychange listener: Reinvents what TanStack Query provides natively
