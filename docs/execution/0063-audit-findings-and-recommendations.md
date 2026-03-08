# Audit Findings & Optimization Recommendations

## Findings (Ordered by Severity)

### 1. Critical: Admin API Authorization Is Too Broad

A logged-in driver can call admin mutations directly. `/api/admin/*` routes use `requireAuth()` (authenticated-only) instead of role checks, while middleware only protects page routes (`/admin/*`, `/driver/*`) and not `/api/*`.

**Refs:** `src/lib/api/auth.ts:9`, `src/middleware.ts:66`, `src/app/api/admin/vans/route.ts:13`, `src/app/api/admin/routes/route.ts:9`, `src/app/api/admin/announcements/route.ts:9`

### 2. Critical: Race Condition Can Create Multiple Active Shifts for the Same Run

`start` checks for an active shift, then inserts — with no DB-level uniqueness for "one active shift per run." Concurrent requests can pass the check and both insert.

**Refs:** `src/app/api/routes/[routeId]/start/route.ts:82`, `src/app/api/routes/[routeId]/start/route.ts:97`, `supabase/migrations/00004_multi_driver_shifts.sql:19`, `src/app/api/routes/[routeId]/end/route.ts:52`

### 3. High: Rate Limiter Is In-Memory and Per-Process

Limits are inconsistent in multi-instance/serverless deployments. Also keyed by logical IDs (`vanId`/`email`), not source identity (IP/device/session), making abuse easier.

**Refs:** `src/lib/api/rate-limit.ts:15`, `src/app/api/tracking/[vanId]/route.ts:20`, `src/app/api/tracking-batch/[vanId]/route.ts:20`, `src/app/api/ingest/[vanId]/route.ts:18`

### 4. High: Expensive Query Fan-Out in Route APIs + Repeated Sync File I/O in ETA Path

`/api/routes` runs per-route DB queries in a `Promise.all` loop, and ETA calls `getTimeFactor()` which does `readFileSync` on each call. This scales poorly with route count and request rate.

**Refs:** `src/app/api/routes/route.ts:60`, `src/app/api/routes/route.ts:127`, `src/app/api/routes/route.ts:163`, `src/lib/tracking/time-factors.ts:48`, `src/lib/tracking/eta.ts:113`

### 5. Medium: OSRM Timeouts Are Likely Too Aggressive (50ms/100ms)

This will frequently force haversine fallback and reduce ETA/snapping quality.

**Refs:** `src/lib/tracking/osrm.ts:19`, `src/lib/tracking/osrm.ts:69`

### 6. Medium: Error Code/Status Mismatches Reduce Client Correctness and Observability

Several endpoints return `NOT_FOUND` with HTTP 500.

**Refs:** `src/app/api/ingest/[vanId]/route.ts:77`, `src/app/api/admin/vans/route.ts:25`, `src/app/api/admin/routes/route.ts:21`, `src/app/api/admin/users/route.ts:21`

### 7. Medium: High Duplication + Hardcoded Values Across Critical Paths

Near-duplicate ingestion/token validation exists in 3 endpoints, and `/api/routes` vs `/api/routes/[routeId]` share large duplicated blocks. Hardcoded DSN and many repeated constants make config drift likely.

**Refs:** `app/_layout.tsx:10`

---

## Optimization Recommendations

1. **Enforce RBAC in API handlers** — replace `requireAuth()` with `requireRole("admin" | "superuser")` for all `/api/admin/*` write/read endpoints that are admin-only.
2. **Add DB constraint for active shifts** — partial unique index on `route_shifts(run_id) WHERE ended_at IS NULL`; wrap `start`/`end` in transaction/RPC.
3. **Replace in-memory rate limiter** — use a Redis/Postgres-based limiter keyed on source identity (`vanId` + token hash + IP/device).
4. **Refactor route aggregation** — fetch runs/shifts/stops in bulk (single-query batches), not per-route query loops.
5. **Cache time factors in memory** — use TTL/invalidation and avoid `readFileSync` in hot request paths.
6. **Unify error taxonomy** — use `INTERNAL_ERROR` for 5xx and centralize the API error builder.
7. **Extract shared ingestion pipeline** — auth/token/van lookup/body parse/timestamp guards into a reusable helper to remove drift.
8. **Move DSN/URLs/timeouts/thresholds to env/config modules** — keep one source of truth.

---

## Validation Run

1. `npm test -- --run`: passed (7 files, 73 tests)
2. `npm run typecheck`: passed
3. `npm run lint`: 2 warnings (`_token` unused in `apps/van-tracker/src/storage/settings.ts:25` and `apps/van-tracker/src/storage/settings.ts:53`)
