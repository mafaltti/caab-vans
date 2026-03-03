# Data Model: Reduce Polling Intervals

**Feature**: 034-reduce-polling-intervals
**Date**: 2026-03-03

## No Data Model Changes

This feature modifies client-side polling configuration only. No database tables, columns, relationships, or server-side data structures are affected.

### Existing entities referenced (read-only, unchanged)

- **routes** / **route detail**: Fetched via `GET /api/routes` and `GET /api/routes/[routeId]` — no changes to response shape.
- **announcements**: Fetched via `GET /api/announcements` — no changes to response shape.
