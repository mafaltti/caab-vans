# Data Model: Route-Based Driver Assignment

## New Table: route_drivers

```sql
CREATE TABLE route_drivers (
  route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (route_id, driver_id)
);

CREATE INDEX idx_route_drivers_driver ON route_drivers (driver_id);

ALTER TABLE route_drivers ENABLE ROW LEVEL SECURITY;
```

### Column Reference

| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| route_id | uuid | NOT NULL | — | PK, FK → routes(id) ON DELETE CASCADE |
| driver_id | uuid | NOT NULL | — | PK |
| created_at | timestamptz | NOT NULL | now() | — |

### Design Notes

- **No FK to `auth.users`**: Matches the existing pattern in `van_drivers` and `route_shifts`. Drivers are validated at the application layer via `supabase.auth.admin.getUserById()`.
- **ON DELETE CASCADE on route_id**: When a route is deleted, all its driver assignments are automatically removed (FR-013).
- **Index on `driver_id`**: Enables fast lookup for driver route discovery (`GET /api/driver/routes`).
- **RLS enabled, no policies**: Accessed only via service role in BFF Route Handlers, same as `van_drivers` and `route_shifts`.

## Data Migration

```sql
INSERT INTO route_drivers (route_id, driver_id)
SELECT r.id, vd.driver_id
FROM van_drivers vd
JOIN routes r ON r.van_id = vd.van_id;
```

### Migration Behavior

- Joins `van_drivers` to `routes` via `routes.van_id = van_drivers.van_id`.
- Only creates rows where the van has an associated route (FR-012: no orphaned records).
- Vans with assigned drivers but no route produce zero rows.
- Multiple drivers per van produce multiple rows per route (preserves M:N).

## ERD (Affected Entities)

```text
auth.users (Supabase GoTrue)
    │
    │ driver_id (logical, no FK)
    │
    ├── route_drivers ──── routes ──── vans
    │     (route_id, driver_id)    (van_id UNIQUE)
    │
    ├── route_shifts ──── route_runs ──── routes
    │     (run_id, driver_id)    (route_id, service_date)
    │
    └── van_drivers ──── vans          ← DEPRECATED (kept physically, no app reads/writes)
          (van_id, driver_id)
```

## TypeScript Type

```typescript
export type RouteDriver = {
  route_id: string;
  driver_id: string;
  created_at: string;
};
```

## Unchanged Tables

The following tables are NOT modified by this feature:

- **routes**: No schema change. `van_id` UNIQUE constraint stays.
- **route_runs**: No schema change.
- **route_shifts**: No schema change. Still references `run_id` and `driver_id`.
- **van_drivers**: Kept physically, no app code reads/writes. Drop is a follow-up.
- **vans**: No schema change.
- **schedule_entries**: No schema change.

## Validation Rules

| Rule | Enforced At | Source |
|------|-------------|--------|
| Driver must exist as active user with "driver" role | API layer (getUserById check) | FR-004 |
| Duplicate driver IDs in request collapse to one row | API layer (de-duplication before insert) | FR-003 |
| Route deletion cascades to route_drivers | Database (ON DELETE CASCADE) | FR-013 |
| Only one active shift per route run | API layer (existing shift conflict check) | FR-014 |
| Route assignment required to start shift | API layer (route_drivers lookup) | FR-006 |
