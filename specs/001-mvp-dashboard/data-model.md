# Data Model: MVP Vans Dashboard

**Branch**: `001-mvp-dashboard` | **Date**: 2026-02-26

## Entity Relationship

```text
┌─────────┐  1    1  ┌─────────┐  1    *  ┌──────────────────┐
│  routes  │─────────│  vans   │         │  schedule_entries │
└─────────┘          └─────────┘         └──────────────────┘
                                              │
                                              └── belongs to route
                                                  (via route_id)

┌────────────────┐
│ announcements  │  (standalone, no FK relationships)
└────────────────┘

┌────────────────┐
│  auth.users    │  (Supabase Auth — role in app_metadata)
└────────────────┘
```

## Tables

### routes

| Column     | Type        | Constraints               | Notes |
|------------|-------------|---------------------------|-------|
| id         | uuid        | PK, default gen_random_uuid() | |
| name       | text        | NOT NULL                  | e.g., "Rota Centro" |
| van_id     | uuid        | FK → vans.id, UNIQUE, NOT NULL | 1:1 with van |
| created_at | timestamptz | NOT NULL, default now()   | |
| updated_at | timestamptz | NOT NULL, default now()   | |

**Indexes**: unique on `van_id`.

### vans

| Column              | Type        | Constraints               | Notes |
|---------------------|-------------|---------------------------|-------|
| id                  | uuid        | PK, default gen_random_uuid() | |
| name                | text        | NOT NULL                  | Admin reference label |
| location_url        | text        | NULLABLE                  | Latest live location link |
| location_updated_at | timestamptz | NULLABLE                  | When link was last ingested |
| ingestion_token     | text        | NOT NULL, UNIQUE          | Per-van shared secret |
| created_at          | timestamptz | NOT NULL, default now()   | |
| updated_at          | timestamptz | NOT NULL, default now()   | |

**Indexes**: unique on `ingestion_token`.

### schedule_entries

| Column    | Type        | Constraints               | Notes |
|-----------|-------------|---------------------------|-------|
| id        | uuid        | PK, default gen_random_uuid() | |
| route_id  | uuid        | FK → routes.id, ON DELETE CASCADE, NOT NULL | |
| stop_name | text        | NOT NULL                  | e.g., "Ponto Central" |
| time      | time        | NOT NULL                  | HH:mm (Postgres time type) |
| created_at| timestamptz | NOT NULL, default now()   | |

**Constraints**: UNIQUE on `(route_id, time)` — no duplicate times per route
(FR-013).

**Indexes**: composite on `(route_id, time)` for ordered queries.

### announcements

| Column     | Type        | Constraints               | Notes |
|------------|-------------|---------------------------|-------|
| id         | uuid        | PK, default gen_random_uuid() | |
| title      | text        | NOT NULL                  | |
| body       | text        | NOT NULL                  | |
| is_pinned  | boolean     | NOT NULL, default false   | |
| is_urgent  | boolean     | NOT NULL, default false   | |
| expires_at | timestamptz | NULLABLE                  | NULL = never expires |
| created_at | timestamptz | NOT NULL, default now()   | |
| updated_at | timestamptz | NOT NULL, default now()   | |

**Indexes**: composite on `(is_pinned DESC, created_at DESC)` for display
ordering (FR-006).

### auth.users (Supabase Auth — not a custom table)

Admin users are managed via Supabase Auth. Custom fields stored in
`raw_app_meta_data`:

```json
{
  "role": "admin" | "superuser",
  "is_active": true | false
}
```

- `role` determines permissions (FR-010).
- `is_active` controls login access (deactivated users cannot sign in).
- Only the service role key can write to `app_metadata` (security constraint).
- Initial superuser is seeded during deployment.

## Validation Rules

| Entity | Rule | Source |
|--------|------|--------|
| Route | name is non-empty, max 100 chars | FR-011 |
| Route | van_id must reference an existing van | FR-011 |
| Schedule Entry | time is valid HH:mm format | FR-012 |
| Schedule Entry | stop_name is non-empty, max 200 chars | FR-012 |
| Schedule Entry | (route_id, time) is unique | FR-013 |
| Announcement | title is non-empty, max 200 chars | FR-015 |
| Announcement | body is non-empty, max 2000 chars | FR-015 |
| Announcement | expires_at, if set, must be in the future | FR-007 |
| User | email is valid format | FR-009 |
| User | password meets minimum length (8 chars) | FR-009 |
| User | role is one of: admin, superuser | FR-010 |
| Ingestion | message text contains exactly 1 URL | FR-019 |
| Ingestion | vanId must reference an existing van | FR-018 |
| Ingestion | token must match van's ingestion_token | FR-020 |

## Computed Fields (BFF-only, not stored)

These are calculated in Route Handlers at request time:

| Field | Logic | Source |
|-------|-------|--------|
| `isRunning` | `currentTime` is between first and last schedule times AND `location_updated_at` date == today (America/Bahia) | FR-002 |
| `nextStop` | First schedule entry with time >= `currentTime` (America/Bahia). NULL if past last entry. | FR-003 |
| `isLocationOutdated` | `location_updated_at` date != today (America/Bahia) | FR-004 |
| `scheduleStatus` | "active" if within window, "ended" if past last entry, "not_started" if before first entry | FR-003 |

## RLS Policies

| Table | Operation | Policy |
|-------|-----------|--------|
| routes | SELECT | Allow for `anon` role (public read) |
| routes | INSERT/UPDATE/DELETE | Service role only (BFF handles RBAC) |
| vans | SELECT | Allow for `anon` role (public read) |
| vans | INSERT/UPDATE/DELETE | Service role only |
| schedule_entries | SELECT | Allow for `anon` role (public read) |
| schedule_entries | INSERT/UPDATE/DELETE | Service role only |
| announcements | SELECT | Allow for `anon` WHERE `expires_at IS NULL OR expires_at > now()` |
| announcements | INSERT/UPDATE/DELETE | Service role only |
