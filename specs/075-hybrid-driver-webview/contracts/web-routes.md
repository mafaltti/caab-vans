# Web Route Contracts: 075 Hybrid Driver WebView

**Date**: 2026-03-17

## New Route

### GET /driver/login

**Purpose**: Driver-branded login page.

**Auth**: Public (no session required).

**Behavior**:
- Renders a login form with driver-specific heading/copy.
- On submit: POST to existing `/api/admin/auth/login`.
- On success:
  - If `role === "driver"` → redirect to `/driver`.
  - If `role !== "driver"` → redirect to `/admin`.

**Layout**: Inherits only from root `app/layout.tsx`. Does NOT use the driver auth-guarded layout.

## Modified Redirect Targets

### Middleware (src/middleware.ts)

| Route Pattern | Before | After |
|---------------|--------|-------|
| Unauthenticated `/driver/*` (except login) | → `/admin/login` | → `/driver/login` |
| Unauthenticated `/admin/*` (except login) | → `/admin/login` | → `/admin/login` (unchanged) |
| `/driver/login` unauthenticated | N/A (page did not exist) | Allowed through (public page) |

### Client-Side 401 Handling

| Context | Before | After |
|---------|--------|-------|
| `fetchWithAuth` (admin pages) | → `/admin/login` | → `/admin/login` (unchanged) |
| `fetchWithDriverAuth` (driver pages) | N/A (helper did not exist) | → `/driver/login` |

### Logout Redirect

| Context | Before | After |
|---------|--------|-------|
| Logout from driver pages | → `/admin/login` | → `/driver/login` |
| Logout from admin pages | → `/admin/login` | → `/admin/login` (unchanged) |

## Unchanged API Contracts

No API endpoints are modified. The following are reused as-is:

- `POST /api/admin/auth/login` — login endpoint (returns role)
- `POST /api/admin/auth/logout` — logout endpoint
- `GET /api/driver/routes` — list driver's routes
- `GET /api/driver/routes/[routeId]` — route detail
- `POST /api/routes/[routeId]/start` — start shift
- `POST /api/routes/[routeId]/end` — end shift
- `POST /api/routes/[routeId]/skip-stop` — skip stop
- `POST /api/routes/[routeId]/detour` — start/end detour
- `POST /api/routes/[routeId]/confirm-start-stop` — cold-start confirmation
