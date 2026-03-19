# Data Model: Van-Scoped Driver Panel

## No Schema Changes

This feature does not modify the database schema. It adds an optional filter parameter to an existing API query.

## Existing Entities (Unchanged)

### vans
| Field | Type | Notes |
|-------|------|-------|
| id | uuid (PK) | Used as the `vanId` filter parameter |
| name | text | Display name (e.g., "Van 01") |
| driver_id | uuid (nullable, FK → auth.users) | Current driver assignment |

### routes
| Field | Type | Notes |
|-------|------|-------|
| id | uuid (PK) | Route identifier |
| van_id | uuid (FK → vans, UNIQUE) | 1:1 van-to-route relationship |
| name | text | Route display name |

### route_drivers
| Field | Type | Notes |
|-------|------|-------|
| route_id | uuid (FK → routes) | Which route |
| driver_id | uuid (FK → auth.users) | Which driver is assigned |

## Query Flow (Before → After)

### Before
```
route_drivers WHERE driver_id = auth.user.id
  → route_ids
routes WHERE id IN (route_ids)
  → all driver's routes
```

### After
```
route_drivers WHERE driver_id = auth.user.id
  → route_ids
routes WHERE id IN (route_ids) [AND van_id = vanId IF provided]
  → filtered routes (or all if vanId absent)
```

## Parameter Flow

```
Tracker App (vanId from settings)
  → WebView URL (?vanId=<uuid>)
    → Driver Page (useSearchParams)
      → useDriverRoutes(vanId)
        → GET /api/driver/routes?vanId=<uuid>
          → Supabase query with optional .eq("van_id", vanId)
```
