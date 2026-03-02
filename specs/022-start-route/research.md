# Research: Start Route

## R1: Van–Driver Assignment Model

**Decision**: Add a nullable `driver_id` column to the `vans` table.

**Rationale**: The van-to-route relationship is already 1:1 (`routes.van_id UNIQUE`). A driver operates one van, so driver-to-van is also 1:1. A single column on `vans` keeps the data model flat and avoids a new junction table. Nullable because a van may not have an assigned driver.

**Alternatives considered**:
- New `van_drivers` junction table — overkill for 1:1, adds join complexity.
- `driver_id` on `routes` — wrong level; the driver is physically in the van, not bound to a route.
- Store van assignment in `app_metadata` — not queryable, hard to manage.

## R2: Route Run Lifecycle Columns

**Decision**: Add `started_at timestamptz` and `ended_at timestamptz` (both nullable) to `route_runs`.

**Rationale**: The run state is derivable from these two columns:
- `started_at IS NULL` → "waiting" (run exists from GPS pings but driver hasn't started)
- `started_at IS NOT NULL AND ended_at IS NULL` → "in_progress"
- `ended_at IS NOT NULL` → "completed"

No separate `status` column needed — derived state avoids synchronization bugs (KISS).

**Alternatives considered**:
- Enum `status` column — requires migration for new states, risks falling out of sync with timestamps.
- Separate `route_run_lifecycle` table — over-engineered for two timestamps.

## R3: Driver Role Integration

**Decision**: Extend the existing `app_metadata.role` enum to include `"driver"`. Same auth flow (email/password via Supabase Auth), same login page, role-based redirect after login.

**Rationale**: The auth system already uses `app_metadata.role` for `"admin"` and `"superuser"`. Adding `"driver"` follows the established pattern. No new auth mechanism needed.

**Key changes**:
- `AuthResult.role` type: `"admin" | "superuser" | "driver"`
- `createUserSchema.role`: add `"driver"` to the Zod enum
- `requireAuth()`: already returns any valid role — drivers pass
- `requireRole("superuser")`: already blocks non-superusers — drivers blocked
- New: `requireRole("driver")` check for driver-only endpoints

## R4: Driver Page Architecture

**Decision**: New `/driver` route group with its own layout, separate from `/admin`.

**Rationale**: The admin layout is designed for CRUD operations (sidebar nav, desktop-first tables). The driver page is a single-purpose mobile-focused page (see assigned routes, tap start/end). Sharing the admin layout would require complex conditional rendering and pollute the admin sidebar.

**Architecture**:
- `/admin/login` serves all roles (unchanged)
- Login handler checks role, client redirects: drivers → `/driver`, others → `/admin`
- Middleware extended to protect `/driver/*` (same pattern as `/admin/*`)
- Driver layout: minimal, mobile-first, no sidebar

## R5: Start/End API Design

**Decision**: `POST /api/routes/[routeId]/start` and `POST /api/routes/[routeId]/end` — authenticated driver endpoints that upsert/update route_runs.

**Rationale**: RESTful actions on an existing resource. The `[routeId]` path parameter matches existing API conventions.

**Start action logic**:
1. Authenticate driver (`requireAuth` + role check)
2. Verify driver is assigned to the van that owns this route
3. Upsert `route_runs` for `(route_id, today)` with `started_at = now()`
4. Return the updated run

**End action logic**:
1. Same auth + ownership check
2. Verify run exists with `started_at IS NOT NULL AND ended_at IS NULL`
3. Update `ended_at = now()`
4. Return the updated run

## R6: Progress Tracking Integration

**Decision**: When `route_runs.started_at` is set, use it as the time floor for stop filtering in both `inferStopProgress` and `computeEta`. When `started_at` is null, fall back to the existing Phase 1 time-aware filter (`time >= now`).

**Rationale**: The started_at provides a more accurate baseline than "current time" because it reflects when the driver actually began their shift. The Phase 1 filter remains as a safety net.

**Priority chain**: `started_at` (if set) > `current time` (Phase 1 fallback).

## R7: Public Page States

**Decision**: Extend `ScheduleStatus` to include route run lifecycle awareness:

| run exists? | started_at | ended_at | Public display |
|-------------|-----------|----------|----------------|
| No          | —         | —        | Existing behavior (schedule-based) |
| Yes         | null      | null     | "Waiting to start" |
| Yes         | set       | null     | Normal tracking (in progress) |
| Yes         | set       | set      | "Completed" |

**Rationale**: Passengers see a clear lifecycle instead of ambiguous "no data" states.

## R8: Existing Patterns to Follow

- **API handlers**: Zod validation → auth check → service client → DB operation → JSON response
- **Admin forms**: Separate `*-form.tsx` in `src/components/admin/`, Zod schema, local state
- **Data fetching (admin)**: Plain `fetch` + `fetchWithAuth`, no TanStack Query
- **Data fetching (public)**: TanStack Query with 30s polling
- **shadcn/ui**: Button, Card, Dialog, Select, Table, Badge, Switch available
- **Error handling**: `apiError()` helper, inline `<p className="text-sm text-red-600">`
- **Nav**: `SidebarNav` with `superuserOnly` flag pattern → extend with role visibility
