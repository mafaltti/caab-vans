# Data Model: OSRM Configurable Timeouts

**Date**: 2026-03-07
**Feature**: 050-osrm-configurable-timeouts

## Summary

No database schema changes required. This feature modifies only runtime configuration (environment variables parsed at module load time in `osrm.ts`).

## Configuration Model

### OSRM Timeout Settings

| Setting | Env Variable | Type | Default | Constraints |
|---------|-------------|------|---------|-------------|
| Route calculation timeout | `OSRM_ROUTE_TIMEOUT_MS` | Positive integer (ms) | 300 | Must be > 0; invalid values fall back to default |
| Road-snapping (match) timeout | `OSRM_MATCH_TIMEOUT_MS` | Positive integer (ms) | 200 | Must be > 0; invalid values fall back to default |

### Validation Rules

- Value must parse as a finite positive integer via `Number(value)` with `Number.isInteger()` check
- `NaN`, `0`, negative numbers, non-numeric strings, and mixed strings (e.g., `"200abc"`) are rejected → use default
- Upper bound enforced at `2^31−1` (setTimeout max); values exceeding this fall back to default

### Existing Related Configuration

| Setting | Env Variable | Relationship |
|---------|-------------|-------------|
| OSRM server URL | `OSRM_BASE_URL` | If not set, OSRM is disabled entirely (timeouts become irrelevant) |

## State Transitions

N/A — no state machines or lifecycle changes.
