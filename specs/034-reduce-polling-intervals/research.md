# Research: Reduce Polling Intervals

**Feature**: 034-reduce-polling-intervals
**Date**: 2026-03-03

## No Unknowns Identified

This feature has no NEEDS CLARIFICATION items. All technical decisions are straightforward.

## Decision Log

### D1: Target polling interval for routes (list + detail)

- **Decision**: 5 seconds
- **Rationale**: 3x improvement over current 15s provides near-real-time feel for live van tracking. TanStack Query's built-in deduplication prevents overlapping requests, so 5s is safe. The van tracker app sends GPS pings frequently enough that 5s polling will surface fresh data on most polls.
- **Alternatives considered**:
  - **3 seconds**: More responsive but higher server load with diminishing UX returns. GPS pings may not arrive this frequently.
  - **10 seconds**: Modest improvement, less impactful for user experience.
  - **Real-time (WebSockets/Supabase Realtime)**: Would eliminate polling entirely but is a much larger scope change. Can be considered as a future enhancement.

### D2: Target polling interval for announcements

- **Decision**: 30 seconds
- **Rationale**: Announcements change infrequently (admin-published). 30s is fast enough that service disruption notices reach users promptly while keeping request volume low.
- **Alternatives considered**:
  - **15 seconds**: Unnecessary — announcements don't change often enough to justify.
  - **60 seconds (current)**: Too slow during active service disruptions.

### D3: Overlapping request handling

- **Decision**: Rely on TanStack Query's default behavior (no action needed).
- **Rationale**: TanStack Query automatically skips refetch if a query is already in-flight. This is the existing behavior and requires no code changes.
- **Alternatives considered**: None — the framework handles this correctly out of the box.
