# Research: Clean Time Format

## R-001: How does PostgreSQL `time` type serialize through Supabase JS client?

**Decision**: PostgreSQL `time` columns are returned as `HH:MM:SS` strings (e.g., `"12:40:00"`) by the Supabase JS client via PostgREST.

**Rationale**: The existing codebase already accounts for this — 3 admin schedule endpoints apply `.slice(0, 5)` to strip seconds. This confirms the raw format includes seconds.

**Alternatives considered**:
- SQL-level cast (`to_char(time, 'HH24:MI')`) — rejected because it would require raw SQL queries instead of the Supabase query builder, adding complexity for no benefit.
- Change column type from `time` to `text` — rejected because `time` provides built-in ordering and constraint validation at the DB level.

## R-002: Where are schedule times passed without formatting?

**Decision**: The issue affects 5 API endpoints, not just 3.

**Findings**:
- **3 admin endpoints** (GET/POST schedule, PUT entry) use `.slice(0, 5)` — fragile but functional.
- **2 public endpoints** (`/api/routes` and `/api/routes/[routeId]`) pass `e.time` directly from Supabase without any formatting. These return schedule times with seconds in the `nextStop.time` and `schedule[].time` response fields.

**Rationale**: The `parseTime` function (used internally for comparisons) handles `HH:MM:SS` input correctly because `split(":")` produces `[hours, minutes, seconds]` and only `[0]` and `[1]` are destructured. So internal logic works, but the API response leaks the raw seconds to clients.

## R-003: Best approach for consistent time string formatting

**Decision**: Add a `formatTimeString(time: string): string` function to `src/lib/time.ts` that takes a raw time string and returns `HH:MM` format.

**Rationale**:
- The function will use `.slice(0, 5)` internally — this is the simplest correct approach for a known `HH:MM:SS` → `HH:MM` conversion, and it's clearer when named and documented in one place.
- All 5 affected call sites will use this function instead of inline slicing or no formatting.
- Aligns with KISS (simplest solution) and DRY (>= 3 repetitions → extract).

**Alternatives considered**:
- Parse through Luxon (`parseTime` → `formatTime`) — rejected because it's unnecessarily heavy for simple string truncation and introduces timezone processing for a timezone-free operation.
- Regex replacement — rejected because `.slice(0, 5)` is simpler and equally correct for this fixed format.
