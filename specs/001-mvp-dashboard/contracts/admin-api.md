# Admin API Contracts

**Base path**: `/api/admin`
**Auth**: Supabase Auth session cookie (email/password login)
**Content-Type**: `application/json`
**RBAC**: All endpoints require `admin` or `superuser` role unless noted.

## Authentication

### POST /api/admin/auth/login

**Request**:

```json
{
  "email": "admin@caab.org.br",
  "password": "********"
}
```

**Response** `200 OK`:

```json
{
  "user": {
    "id": "uuid",
    "email": "admin@caab.org.br",
    "role": "admin" | "superuser"
  }
}
```

**Errors**:
- `401 Unauthorized`: Invalid credentials or deactivated account.
- `429 Too Many Requests`: Rate limited.

---

## Vans

### GET /api/admin/vans

List all vans.

**Response** `200 OK`:

```json
{
  "vans": [
    {
      "id": "uuid",
      "name": "Van 01",
      "ingestionToken": "tok_abc123",
      "locationUrl": "https://maps.app.goo.gl/..." | null,
      "locationUpdatedAt": "2026-02-26T14:20:00-03:00" | null,
      "createdAt": "2026-01-15T10:00:00-03:00"
    }
  ]
}
```

### POST /api/admin/vans

Create a new van. Generates a unique ingestion token automatically.

**Request**:

```json
{
  "name": "Van 01"
}
```

**Response** `201 Created`: Created van object (including generated `ingestionToken`).

**Errors**: `400 Bad Request` (empty name).

### PUT /api/admin/vans/:vanId

Update a van name or regenerate its ingestion token.

**Request** (all fields optional):

```json
{
  "name": "Van 01 Updated",
  "regenerateToken": true
}
```

**Response** `200 OK`: Updated van object.

**Errors**: `400 Bad Request`, `404 Not Found`.

### DELETE /api/admin/vans/:vanId

Hard delete a van. Fails if the van is assigned to a route.

**Response** `204 No Content`.

**Errors**:
- `404 Not Found`: Van does not exist.
- `409 Conflict`: Van is assigned to a route (delete the route first).

---

## Routes

### POST /api/admin/routes

Create a new route.

**Request**:

```json
{
  "name": "Rota Centro",
  "vanId": "uuid"
}
```

**Response** `201 Created`:

```json
{
  "route": { "id": "uuid", "name": "Rota Centro", "vanId": "uuid" }
}
```

**Errors**:
- `400 Bad Request`: Validation error (empty name, invalid vanId).
- `409 Conflict`: Van already assigned to another route.

### PUT /api/admin/routes/:routeId

Update a route.

**Request**:

```json
{
  "name": "Rota Centro Atualizada",
  "vanId": "uuid"
}
```

**Response** `200 OK`: Updated route object.

**Errors**: Same as POST + `404 Not Found`.

### DELETE /api/admin/routes/:routeId

Hard delete a route and its schedule entries (cascade).

**Response** `204 No Content`.

**Errors**: `404 Not Found`.

---

## Schedule Entries

### GET /api/admin/routes/:routeId/schedule

List schedule entries for a route (sorted by time).

**Response** `200 OK`:

```json
{
  "entries": [
    { "id": "uuid", "stopName": "Ponto Inicial", "time": "07:00" },
    { "id": "uuid", "stopName": "Ponto Central", "time": "07:30" }
  ]
}
```

### POST /api/admin/routes/:routeId/schedule

Create a schedule entry.

**Request**:

```json
{
  "stopName": "Ponto Central",
  "time": "07:30"
}
```

**Response** `201 Created`: Created entry object.

**Errors**:
- `400 Bad Request`: Invalid time format or empty stop name.
- `409 Conflict`: Duplicate time in this route's schedule (FR-013).

### PUT /api/admin/routes/:routeId/schedule/:entryId

Update a schedule entry.

**Request**:

```json
{
  "stopName": "Ponto Central Atualizado",
  "time": "07:35"
}
```

**Response** `200 OK`: Updated entry object.

**Errors**: Same as POST + `404 Not Found`.

### DELETE /api/admin/routes/:routeId/schedule/:entryId

Hard delete a schedule entry.

**Response** `204 No Content`.

**Errors**: `404 Not Found`.

---

## Announcements

### POST /api/admin/announcements

Create an announcement.

**Request**:

```json
{
  "title": "Rota suspensa amanhã",
  "body": "A rota Centro estará suspensa dia 27/02.",
  "isPinned": false,
  "isUrgent": false,
  "expiresAt": "2026-02-28T23:59:00-03:00" | null
}
```

**Response** `201 Created`: Created announcement object.

**Errors**: `400 Bad Request`.

### PUT /api/admin/announcements/:announcementId

Update an announcement.

**Request**: Same shape as POST.

**Response** `200 OK`: Updated announcement object.

**Errors**: `400 Bad Request`, `404 Not Found`.

### DELETE /api/admin/announcements/:announcementId

Hard delete an announcement.

**Response** `204 No Content`.

**Errors**: `404 Not Found`.

---

## User Management (Superuser Only)

**RBAC**: Requires `superuser` role. Returns `403 Forbidden` for `admin`.

### GET /api/admin/users

List all admin users.

**Response** `200 OK`:

```json
{
  "users": [
    {
      "id": "uuid",
      "email": "admin@caab.org.br",
      "role": "admin",
      "isActive": true,
      "createdAt": "2026-01-15T10:00:00-03:00"
    }
  ]
}
```

### POST /api/admin/users

Create a new admin user.

**Request**:

```json
{
  "email": "newadmin@caab.org.br",
  "password": "********",
  "role": "admin" | "superuser"
}
```

**Response** `201 Created`: Created user object (without password).

**Errors**: `400 Bad Request`, `409 Conflict` (email already exists).

### PUT /api/admin/users/:userId

Update a user (change role, reset password, deactivate/reactivate).

**Request** (all fields optional):

```json
{
  "role": "superuser",
  "password": "newpassword",
  "isActive": false
}
```

**Response** `200 OK`: Updated user object.

**Errors**:
- `400 Bad Request`: Invalid role value.
- `404 Not Found`: User does not exist.
- `409 Conflict`: Cannot deactivate the last active superuser (FR-017).

---

## Common Error Response Shape

All error responses follow this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "UNAUTHORIZED" | "FORBIDDEN" | "RATE_LIMITED",
    "message": "Human-readable error description in Portuguese"
  }
}
```
