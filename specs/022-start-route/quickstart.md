# Quickstart: Start Route

## Prerequisites

- Node.js + pnpm (existing dev setup)
- Supabase self-hosted stack running locally
- `.env.local` with Supabase URL, anon key, and service role key

## Setup

1. **Apply the migration**:
   ```bash
   # Connect to local Supabase Postgres and run:
   psql -h localhost -p 5432 -U postgres -d postgres -f supabase/migrations/00003_start_route.sql
   ```

2. **Create a test driver user** (via Studio or API):
   - Email: `driver@test.com`, Password: `test1234`
   - `app_metadata`: `{ "role": "driver", "is_active": true }`

3. **Assign driver to a van** (via Studio or API):
   ```sql
   UPDATE vans SET driver_id = '<driver-user-uuid>' WHERE name = '<van-name>';
   ```

4. **Start the dev server**:
   ```bash
   pnpm dev
   ```

## Testing the Feature

### Driver Flow

1. Open `http://localhost:3000/admin/login`
2. Log in as `driver@test.com` — should redirect to `/driver`
3. See assigned route(s) with "Start Route" button
4. Tap "Start Route" — route transitions to "in progress"
5. Open public route page in another tab — verify ETA reflects started_at
6. Return to driver page — tap "End Route" (confirm) — route shows "completed"

### Public Page States

| Scenario | Expected |
|----------|----------|
| No route_run for today | Normal schedule-based display |
| Route_run exists, no started_at | "Waiting to start" indicator |
| Route started | Live tracking with ETA |
| Route ended | "Completed" status |

### Admin Flow

1. Log in as superuser at `/admin/login`
2. Go to Users → New → select "Motorista" role
3. Go to Vans → edit a van → assign the driver
4. Verify driver cannot access `/admin/routes` (403 redirect)

## Key Files

| Area | Files |
|------|-------|
| Migration | `supabase/migrations/00003_start_route.sql` |
| Auth | `src/lib/api/auth.ts`, `src/lib/validators/user.ts` |
| Middleware | `src/middleware.ts` |
| Driver API | `src/app/api/routes/[routeId]/start/route.ts`, `.../end/route.ts`, `src/app/api/driver/routes/route.ts` |
| Driver UI | `src/app/driver/layout.tsx`, `src/app/driver/page.tsx` |
| Tracking | `src/lib/tracking/eta.ts`, `src/lib/tracking/infer-stop-progress.ts` |
| Public page | `src/app/(public)/routes/[routeId]/page.tsx`, `src/components/public/hero-card.tsx` |
| Admin updates | `src/components/admin/van-form.tsx`, `src/components/admin/user-form.tsx` |
| Types | `src/types/index.ts` |
