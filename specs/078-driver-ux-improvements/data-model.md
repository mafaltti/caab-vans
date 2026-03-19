# Data Model: Driver UX Improvements

**Feature**: 078-driver-ux-improvements
**Date**: 2026-03-19

## New Table: `driver_pins`

Stores hashed PIN credentials for driver quick-login. One PIN per driver, globally unique.

### Fields

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | UUID | PK, FK → auth.users(id) | Driver's auth user ID |
| pin_hash | TEXT | NOT NULL | Bcrypt hash for verification |
| pin_digest | CHAR(64) | NOT NULL, UNIQUE | SHA-256 hex digest for lookup + uniqueness |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Last PIN change timestamp |

### Relationships

- **1:1 with auth.users**: Each driver can have at most one PIN. The `user_id` is both PK and FK.
- **No cascade delete**: If a user is deactivated (`app_metadata.is_active = false`), the PIN record is retained but login is rejected at the API level (role/active check).

### Access Control

- **RLS enabled, no client policies**: The `driver_pins` table is accessed only via service-role queries in API route handlers. No RLS policies are defined (service role bypasses RLS).
- **No direct client access**: Drivers and admins never query this table directly.

### Indexes

- **PK index** on `user_id` (implicit from PRIMARY KEY)
- **UNIQUE index** on `pin_digest` (implicit from UNIQUE constraint) — enables O(1) PIN lookup

### State Transitions

```
No PIN → PIN Set (admin creates via POST /api/admin/drivers/[userId]/pin)
PIN Set → PIN Reset (admin changes via same endpoint, upsert)
PIN Set → Account Deactivated (PIN record retained, login blocked by role check)
```

### Validation Rules

- PIN must be exactly 6 digits (validated at API level before hashing)
- `pin_digest` must be unique across all rows (DB constraint)
- `pin_hash` is bcrypt with default cost factor (10 rounds)
- `pin_digest` is `SHA-256(pin_plaintext)` as lowercase hex string

---

## Existing Entities Used (No Changes)

### route_shifts (read-only for this feature)

Used for shift duration timer and shift-end summary. Key fields:
- `started_at`: Shift start timestamp → used as `shiftStartedAt` in `RouteProgress`
- `ended_at`: NULL for active shift, set when shift ends

### route_run_stops (read-only for this feature)

Used for progress indicator and shift-end summary. Key fields:
- `status`: `'pending'` | `'passed'` | `'skipped'`
- `passed_at`: Timestamp when stop was marked passed (NULL for pending/skipped)

### RouteProgress (computed BFF type, no changes)

Already provides all fields needed for Phase 1 and Phase 2 features:
- `shiftStartedAt`: From active `route_shifts.started_at`
- `nextStopId`: From `route_runs.next_stop_id`
- `passedStopIds`: Contiguous prefix of passed stops
- `skippedStopIds`: All skipped stops
- `runStatus`: Derived from shift state + schedule window

### DriverRoute (computed BFF type, no changes)

Already provides fields needed for auto-redirect:
- `activeShift`: `{ id, driverId, startedAt }` — identifies which driver owns the active shift
- `runStatus`: Route execution state
