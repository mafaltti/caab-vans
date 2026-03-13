# API Contracts: Route-Based Driver Assignment

## New Endpoint

### GET /api/admin/drivers

**Auth**: `requireRole("admin")` (admin + superuser)

**Response** `200 OK`:
```json
{
  "drivers": [
    { "id": "uuid", "email": "driver@example.com" }
  ]
}
```

**Behavior**:
- Lists all users with `app_metadata.role === "driver"` and `app_metadata.is_active !== false`.
- Returns only `id` and `email` — no other user fields.
- Sorted alphabetically by email.

**Error responses**:
- `401` — not authenticated
- `403` — not admin or superuser

---

## Modified Endpoints

### GET /api/admin/routes

**Change**: Response now includes `driverIds` per route.

**Response** `200 OK`:
```json
{
  "routes": [
    {
      "id": "uuid",
      "name": "Rota Centro",
      "vanId": "uuid",
      "van": { "id": "uuid", "name": "Van 01" },
      "driverIds": ["uuid-1", "uuid-2"]
    }
  ]
}
```

**Behavior**:
- Fetches all `route_drivers` rows and groups by `route_id`.
- Routes with no assigned drivers return `driverIds: []`.

---

### POST /api/admin/routes

**Change**: Request body now accepts optional `driverIds`.

**Request body**:
```json
{
  "name": "Rota Centro",
  "vanId": "uuid",
  "driverIds": ["uuid-1", "uuid-2"]
}
```

**Validation**:
- `driverIds` is optional. If omitted or `undefined`, normalized to `[]`.
- Duplicate IDs are de-duplicated server-side.
- Each ID must be an active user with `role === "driver"`. If any ID fails validation, the entire request is rejected with `400`.

**Response** `201 Created`:
```json
{
  "route": {
    "id": "uuid",
    "name": "Rota Centro",
    "vanId": "uuid",
    "driverIds": ["uuid-1", "uuid-2"]
  }
}
```

**Behavior**:
- Creates the route, then inserts `route_drivers` rows for each valid driver ID.
- On validation failure for any driver ID, the route is NOT created (transactional intent — if route insert succeeds but driver validation later fails, the route is deleted).

---

### PUT /api/admin/routes/[routeId]

**Change**: Request body now accepts optional `driverIds`.

**Request body**:
```json
{
  "name": "Rota Centro",
  "vanId": "uuid",
  "driverIds": ["uuid-1"]
}
```

**Validation**: Same as POST (optional, normalized to `[]`, de-duplicated, validated).

**Response** `200 OK`:
```json
{
  "route": {
    "id": "uuid",
    "name": "Rota Centro",
    "vanId": "uuid",
    "driverIds": ["uuid-1"]
  }
}
```

**Behavior**:
- Full-replacement semantics: deletes all existing `route_drivers` for this route, inserts the new set.
- If `driverIds` is omitted, existing assignments are cleared (normalized to `[]`).

---

### GET /api/admin/vans

**Change**: Response no longer includes `driverIds`.

**Before**:
```json
{
  "vans": [
    { "id": "uuid", "name": "Van 01", "driverIds": ["uuid-1"], ... }
  ]
}
```

**After**:
```json
{
  "vans": [
    { "id": "uuid", "name": "Van 01", ... }
  ]
}
```

**Behavior**: No longer queries `van_drivers` table. All driver assignment fields removed.

---

### PUT /api/admin/vans/[vanId]

**Change**: No longer accepts or processes `driverIds`.

**Before** (accepted):
```json
{ "name": "Van 01", "driverIds": ["uuid-1"] }
```

**After** (accepted):
```json
{ "name": "Van 01", "regenerateToken": false }
```

**Behavior**: The `driverIds` field is silently ignored if sent (no error, but not persisted). No `van_drivers` reads or writes occur.

---

### GET /api/driver/routes

**Change**: Internal query source changes from `van_drivers` to `route_drivers`.

**Before** (internal):
```
van_drivers.where(driver_id) → van_ids → routes.where(van_id IN van_ids)
```

**After** (internal):
```
route_drivers.where(driver_id) → route_ids → routes.where(id IN route_ids)
```

**Response shape**: Unchanged. Same `DriverRoute` structure.

---

### POST /api/routes/[routeId]/start

**Change**: Authorization check changes from `van_drivers` to `route_drivers`.

**Before** (internal):
```
van_drivers.where(van_id = route.van.id AND driver_id = auth.user.id)
```

**After** (internal):
```
route_drivers.where(route_id = routeId AND driver_id = auth.user.id)
```

**Error message update**:
- Before: "You are not assigned to this route's van"
- After: "You are not assigned to this route"

**Response shape**: Unchanged.

---

## Unchanged Endpoints

- `POST /api/routes/[routeId]/end` — uses `route_shifts.driver_id`, not assignment tables
- `POST /api/routes/[routeId]/confirm-start-stop` — uses `route_shifts.driver_id`
- `GET /api/admin/users` — stays superuser-only
- `POST /api/admin/users` — stays superuser-only
- All tracker/ingestion endpoints — van-centric, unaffected
