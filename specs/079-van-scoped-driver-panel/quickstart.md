# Quickstart: Van-Scoped Driver Panel

## Implementation Order

Each step is independently deployable. The feature activates when both web and tracker are deployed.

### Step 1: API — Backward-Compatible Filter
**File**: `src/app/api/driver/routes/route.ts`
- Import `NextRequest` alongside `NextResponse`
- Change `GET()` to `GET(request: NextRequest)`
- Read `vanId` from `request.nextUrl.searchParams.get("vanId")`
- If `vanId` is present and non-empty, add `.eq("van_id", vanId)` to the routes query
- If absent, query remains unchanged (backward compatible)

### Step 2: Hook — Accept Optional vanId
**File**: `src/lib/queries/use-driver-routes.ts`
- Add `vanId?: string | null` parameter to `useDriverRoutes`
- Update `queryKey` to `["driver-routes", vanId ?? null]`
- In `fetchDriverRoutes`, append `?vanId=${vanId}` to URL when `vanId` is truthy

### Step 3: Page — Read vanId from URL
**File**: `src/app/driver/(protected)/page.tsx`
- Import `Suspense` from React and `useSearchParams` from `next/navigation`
- Extract page body into `DriverPageContent` component
- Default export wraps `DriverPageContent` in `<Suspense>`
- In `DriverPageContent`, read `vanId` via `useSearchParams().get("vanId")`
- Pass `vanId` to `useDriverRoutes(vanId)`
- Update `queryClient.setQueryData` key to `["driver-routes", vanId ?? null]`

### Step 4: Tracker — Send vanId in URL
**File**: `apps/van-tracker/app/driver.tsx`
- Add `useState` for `vanId`, populated from `getSettings()` alongside `baseUrl`
- Change WebView source from `${baseUrl}/driver` to `${baseUrl}/driver?vanId=${vanId}`

## Verification

1. `GET /api/driver/routes` (no vanId) → returns all assigned routes
2. `GET /api/driver/routes?vanId=<valid>` → returns only that van's route
3. `GET /api/driver/routes?vanId=<invalid>` → returns empty routes
4. Tracker WebView URL includes `?vanId=...` (inspect in dev tools)
5. `npx tsc --noEmit` passes
6. `npx eslint .` passes
7. `npx next build` passes
