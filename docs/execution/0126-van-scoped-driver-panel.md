# Van-Scoped Driver Panel

## Context

Each physical van runs the tracker app. When a driver taps "Open Driver", the WebView opens the driver panel at `${baseUrl}/driver` — but no van context is passed. This means a driver assigned to multiple vans sees all their routes and can start shifts on any of them, regardless of which van they're physically in.

**Goal:** Scope the driver panel to the van whose tracker it was opened from. A driver on Van 01's tracker should only see Van 01's route.

## Approach

Pass `vanId` as a query parameter from the tracker WebView URL. The web panel reads it, forwards it to the API, and the API filters routes by that van. All changes are backward-compatible — omitting `vanId` preserves current behavior.

## Changes (4 files)

### 1. Tracker WebView — pass `vanId` in URL

**File:** `apps/van-tracker/app/driver.tsx`

- `getSettings()` already returns `{ apiBaseUrl, vanId, ingestionToken }` but only `apiBaseUrl` is used
- Store `vanId` alongside `baseUrl` in state (new `useState` for `vanId`)
- Change WebView source from `${baseUrl}/driver` to `${baseUrl}/driver?vanId=${vanId}`

### 2. Query hook — accept and forward `vanId`

**File:** `src/lib/queries/use-driver-routes.ts`

- `useDriverRoutes(vanId?: string | null)` — accept optional param
- `fetchDriverRoutes` appends `?vanId=${vanId}` to the URL when present
- Include `vanId` in `queryKey`: `["driver-routes", vanId ?? null]`

### 3. API — filter routes by `vanId`

**File:** `src/app/api/driver/routes/route.ts`

- Read optional `vanId` from `request.searchParams`
- Change function signature from `GET()` to `GET(request: NextRequest)`
- After fetching routes at line 39, add `.eq("van_id", vanId)` to the query when `vanId` is present
- No new DB queries needed — just an additional filter on the existing routes query

### 4. Driver page — read `vanId` from URL, pass to hook

**File:** `src/app/driver/(protected)/page.tsx`

- Wrap page content in `<Suspense>` (required by Next.js for `useSearchParams`)
- Extract inner content into a `DriverPageContent` component (same file)
- Read `vanId` from `useSearchParams()`
- Pass to `useDriverRoutes(vanId)`
- Update `queryClient.setQueryData` key to match new `queryKey` with `vanId`

## What Does NOT Change

- **Route detail API** (`/api/driver/routes/[routeId]`): Already validates driver assignment by `routeId`
- **Shift start/end APIs**: Already validate driver assignment via `route_drivers`
- **Route detail page**: Works by `routeId`, no van scoping needed
- **Route card component**: Renders whatever routes it receives
- **Types**: No new types needed
- **Layout/login**: No changes

## Edge Cases

| Scenario | Behavior |
|---|---|
| Tracker not updated (no `vanId` in URL) | API returns all routes — current behavior preserved |
| `vanId` for a van driver isn't assigned to | Empty routes list, shows existing "Nenhuma rota atribuída" state |
| Direct browser access (no `vanId`) | Shows all assigned routes — normal experience |
| Driver assigned to only one van | Same single route shown with or without `vanId` |

## Implementation Order

1. **API** (backward-compatible filter)
2. **Hook** (optional param)
3. **Page** (read from URL)
4. **Tracker** (send `vanId`)

Each step is independently deployable. The feature activates when both web + tracker are deployed.

## Verification

1. Without `vanId`: `GET /api/driver/routes` returns all assigned routes (regression check)
2. With `vanId`: `GET /api/driver/routes?vanId=<id>` returns only routes for that van
3. Invalid `vanId`: Returns empty routes list
4. Tracker WebView: Confirm URL includes `?vanId=...` in dev tools
5. Type-check: `npx tsc --noEmit`
6. Lint: `npx eslint`
7. Build: `npx next build`
