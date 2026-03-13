# Research: Route-Based Driver Assignment

## R1: Migration strategy for route_drivers table

**Decision**: Create `route_drivers` as a new table mirroring the `van_drivers` schema, with `route_id` replacing `van_id`. Backfill via a single INSERT...SELECT joining `van_drivers` to `routes` on `van_id`.

**Rationale**: The existing `van_drivers` table (migration 00004) established the pattern: composite PK, no FK to `auth.users`, index on `driver_id`, RLS enabled with no policies. Reusing this exact pattern keeps the migration trivial and the codebase consistent.

**Alternatives considered**:
- Adding `route_id` to `van_drivers` and repurposing it: rejected because it conflates two concepts and makes the later cleanup (dropping van_drivers) harder.
- Creating a view over `van_drivers JOIN routes`: rejected because the spec requires `van_drivers` to stop being read/written entirely.

## R2: Auth level for GET /api/admin/drivers

**Decision**: Use `requireRole("admin")` which allows both admin and superuser roles (per the existing `requireRole` implementation in `src/lib/api/auth.ts:39-48`).

**Rationale**: The existing `requireRole("admin")` function already permits superuser access (superuser is a superset of admin). This matches the spec requirement "admin + superuser only" with zero new code.

**Alternatives considered**:
- A custom dual-role check: rejected because `requireRole("admin")` already handles this.
- Reusing `GET /api/admin/users` and filtering client-side: rejected because that endpoint is superuser-only (FR-009 requires admin access).

## R3: Driver validation in route APIs

**Decision**: Reuse the exact validation pattern from `PUT /api/admin/vans/[vanId]` — call `supabase.auth.admin.getUserById()` per driver ID, check `role === "driver"` and `is_active !== false`.

**Rationale**: This pattern is proven, handles all edge cases (missing user, wrong role, inactive), and the code can be extracted if needed (currently only 2 occurrences, so DRY threshold of 3 not reached — keep inline).

**Alternatives considered**:
- Batch-fetching via `listUsers()` and filtering: rejected because Supabase's `listUsers()` returns all users with no filter, which is wasteful for a small set of IDs.
- Extracting a shared `validateDriverIds()` helper now: rejected per KISS/DRY — only 2 call sites (van PUT being removed leaves 1). If a third site emerges, extract then.

## R4: Driver route discovery simplification

**Decision**: Replace the current 3-step chain (`van_drivers → van_ids → routes.where(van_id IN ...)`) with a direct 2-step query (`route_drivers.where(driver_id) → route_ids → routes.where(id IN ...)`).

**Rationale**: This eliminates one database query (no longer need to look up van IDs) and simplifies the code. The `van_id` is still needed for the response (van name), but it comes from the route's join to vans.

**Alternatives considered**:
- Keeping a 3-step chain but via route_drivers: unnecessary since route_drivers gives route_ids directly.

## R5: Handling van_drivers removal from application code

**Decision**: Remove all reads/writes to `van_drivers` in the same release. Keep the physical table in the database for deploy safety. No application-level fallback.

**Rationale**: The spec is explicit: "No runtime compatibility fallback to `van_drivers` is allowed after cutover." The table stays so rollback doesn't lose data, but the app never touches it. A follow-up migration will drop it after deployment verification.

**Alternatives considered**:
- Dual-write to both tables during transition: rejected per spec — no fallback, and it adds complexity for zero benefit given the atomic deploy.
