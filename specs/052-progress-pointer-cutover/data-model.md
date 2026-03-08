# Data Model: Progress Pointer Cutover

**Feature**: 052-progress-pointer-cutover
**Date**: 2026-03-08

## Existing Entities (No Schema Changes)

This feature requires **no database schema changes**. All columns already exist from migration `00013_persist_progress_pointers.sql`.

### Route Run (modified read/write behavior)

| Field | Type | Status | Notes |
|-------|------|--------|-------|
| `id` | uuid PK | Existing | |
| `route_id` | uuid FK | Existing | References routes |
| `service_date` | date | Existing | Daily instance key |
| `started_at` | timestamptz | Existing | Shift start time |
| `ended_at` | timestamptz | Existing | Shift end time |
| `last_passed_stop_id` | uuid FK (nullable) | **Existing — promoted to authoritative** | References schedule_entries, ON DELETE SET NULL |
| `next_stop_id` | uuid FK (nullable) | **Existing — promoted to authoritative** | References schedule_entries, ON DELETE SET NULL |
| `progress_updated_at` | timestamptz (nullable) | **Existing — used for staleness check** | Must be < 30 min old to be trusted |

**Behavioral change**: `next_stop_id` transitions from "informational write" to "authoritative source of truth for ETA targeting" when `TRACKING_PROGRESS_SOURCE=persisted`.

### Route Run Stop (no changes)

| Field | Type | Notes |
|-------|------|-------|
| `run_id` | uuid FK | |
| `schedule_entry_id` | uuid FK | |
| `status` | text ('pending' / 'passed') | |
| `passed_at` | timestamptz | |
| `pass_source` | text | |
| `pass_confidence` | float | |

**Remains source of truth for**: `passedStopIds`, recent-run segment data, OSRM distances, and time factor blending. Not affected by cutover.

### Schedule Entry (no changes)

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | Referenced by pointers |
| `route_id` | uuid FK | |
| `stop_name` | text | |
| `time` | text (HH:mm) | |
| `stop_lat` / `stop_lng` | float | |
| `geofence_radius_m` | integer | Default 50m |
| `stop_group_id` | text (nullable) | Grouping key for repeated physical stops |

## State Transitions

### Pointer Trust State Machine

```text
┌──────────┐    pointer exists     ┌───────────┐    entry exists     ┌───────────┐
│  MISSING  │──── in route_runs ──→│  PRESENT   │─── in schedule  ──→│ VALIDATED  │
└──────────┘                       └───────────┘    entries           └───────────┘
     │                                  │                                  │
     │                                  │ entry deleted                    │ age > 30 min
     │                                  │ or not found                     │
     │                                  ↓                                  ↓
     │                             ┌───────────┐                      ┌───────────┐
     └────── all fall back ───────→│  INVALID   │←─────────────────── │   STALE    │
                                   └───────────┘                      └───────────┘
                                        │
                                        ↓
                                   Legacy recomputation
```

### Run Status (existing, unchanged)

```text
waiting ──(first shift started)──→ in_progress ──(shift ended, within window)──→ idle
                                       │                                          │
                                       │                    (new shift started)───┘
                                       │
                                  (past schedule window)──→ completed
```

**Pointer behavior per run status**:
- `waiting`: Pointer ignored (no active progress)
- `in_progress`: Pointer trusted if VALIDATED (primary use case)
- `idle`: Pointer retained but ETA suppressed
- `completed`: Pointer ignored (run finished)

## New Configuration Entity

### Progress Source Mode

| Value | Behavior |
|-------|----------|
| `legacy` (default) | Current time-based ETA target selection. Pointer ignored on read path. |
| `shadow` | Compute both legacy and persisted results. Serve legacy. Log mismatches. |
| `persisted` | Use validated pointer as ETA target. Fall back to legacy if MISSING/INVALID/STALE. |

Controlled by env var `TRACKING_PROGRESS_SOURCE`. Server-side only. Not persisted in database.
