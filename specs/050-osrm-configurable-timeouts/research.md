# Research: OSRM Configurable Timeouts

**Date**: 2026-03-07
**Feature**: 050-osrm-configurable-timeouts

## Research Questions & Findings

### RQ-1: What are the current OSRM timeout values and where are they set?

**Decision**: Two hardcoded timeouts exist in `src/lib/tracking/osrm.ts`.

| Function | Line | Current Timeout | Purpose |
|----------|------|----------------|---------|
| `osrmRoute` | 19 | 100ms | ETA route distance/duration calculation |
| `snapToRoad` | 69 | 50ms | Road-snapping via OSRM `/match` endpoint |

Both use `AbortController` + `setTimeout` pattern. On timeout or error, both return `null`.

**Batch scripts** (`scripts/precompute-stop-distances.ts:25`, `scripts/compute-time-factors.ts:35`) use 500ms — hardcoded as local constants, not from env. These are out of scope.

### RQ-2: Who calls these functions and what happens on fallback?

| Caller | File:Line | On `null` return |
|--------|-----------|------------------|
| `computeEta()` | `src/lib/tracking/eta.ts:117` | Falls back to haversine × ROAD_FACTOR (1.3) for ETA |
| Single ping handler | `src/app/api/tracking/[vanId]/route.ts:147` | `snappedLat`/`snappedLng` remain null; raw GPS used |
| Batch ping handler | `src/app/api/tracking-batch/[vanId]/route.ts:157` | Same as single ping |

No caller needs to change — they already handle `null` gracefully.

### RQ-3: What env var patterns does the project use?

**Decision**: Follow existing inline `process.env` access pattern. No centralized config module.

**Current patterns observed**:
- **Required vars**: Non-null assertion (`process.env.VAR!`) — Supabase clients
- **Optional feature toggle**: Conditional check (`if (process.env.VAR)`) — `OSRM_BASE_URL`
- **Optional with default**: Nullish coalescing (`process.env.VAR ?? "default"`) — `APP_URL`
- **No parseInt patterns exist** in the codebase — all current env vars are strings

**For this feature**: Use `Number(process.env.VAR ?? "default")` with strict validation via `Number.isInteger(n) && n > 0 && n <= MAX_TIMEOUT_MS` (must be a pure positive integer, else fall back to default). Uses `Number()` instead of `parseInt()` to reject malformed values like `"200abc"`. This satisfies FR-005.

### RQ-4: What env var names to use?

**Decision**: `OSRM_ROUTE_TIMEOUT_MS` and `OSRM_MATCH_TIMEOUT_MS`

**Rationale**:
- Prefix `OSRM_` groups with existing `OSRM_BASE_URL`
- Suffix `_MS` makes the unit explicit (prevents seconds vs. milliseconds confusion)
- Names match the OSRM endpoint semantics: `/route` for ETA, `/match` for snapping

**Alternatives considered**:
- `OSRM_TIMEOUT_MS` (single var) — rejected because route and match have different latency profiles
- `OSRM_SNAP_TIMEOUT_MS` — "match" aligns better with the OSRM API endpoint name

### RQ-5: What default values to use?

**Decision**: 300ms (route), 200ms (match)

**Rationale** (from Finding #5 analysis):
- Current 50ms/100ms cause ~5-20% timeout rate on localhost OSRM under load
- Batch scripts use 500ms successfully
- 200-300ms gives ~3-6x headroom over typical local OSRM response times (~30-50ms unloaded)
- Still well under the ~500ms threshold where users would notice API latency
- Matches the Finding #5 recommendation

### RQ-6: Should a centralized config/env module be created?

**Decision**: No.

**Rationale**: YAGNI. The project has ~7 env vars, none using parseInt. Creating a centralized module for 2 new integer env vars would be over-engineering. If a future feature adds many more typed env vars, that's the time to consolidate.
