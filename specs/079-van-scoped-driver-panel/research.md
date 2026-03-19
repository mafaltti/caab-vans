# Research: Van-Scoped Driver Panel

## R1: Tracker WebView URL Construction

**Decision**: Pass `vanId` as a query parameter appended to the WebView URL.

**Rationale**: `getSettings()` already returns `{ apiBaseUrl, vanId, ingestionToken }` but the driver screen only uses `apiBaseUrl`. The `vanId` is available but discarded. Adding it as `?vanId=${vanId}` to the URL is the simplest change — no routing changes needed on the web side, and the web app reads it via `useSearchParams`.

**Alternatives considered**:
- Path segment (`/driver/${vanId}`) — requires Next.js dynamic route file, adds unnecessary complexity.
- PostMessage from WebView — more complex, less transparent, harder to debug.

**Current state**: `source={{ uri: \`${baseUrl}/driver\` }}` on line 141 of `driver.tsx`. State uses `useState` for `baseUrl` only; need to add `vanId` state alongside it.

## R2: Driver Routes Hook

**Decision**: Add optional `vanId` parameter to `useDriverRoutes` and include it in the query key and fetch URL.

**Rationale**: The hook currently takes no parameters. Adding `vanId?: string | null` is backward-compatible — callers without `vanId` get current behavior. The query key becomes `["driver-routes", vanId ?? null]` so TanStack Query caches per-van results correctly.

**Alternatives considered**:
- Separate hook for van-scoped queries — violates DRY, same logic with one extra filter.

**Current state**: `fetchWithDriverAuth("/api/driver/routes", { signal })` with query key `["driver-routes"]`. Refetch interval is 30s.

## R3: Driver Routes API Endpoint

**Decision**: Read optional `vanId` from `request.nextUrl.searchParams` and conditionally add `.eq("van_id", vanId)` to the routes query.

**Rationale**: The routes query at Stage 2 already filters by `route_ids` (from driver assignment). Adding a conditional `.eq("van_id", vanId)` simply narrows the result further. No new DB queries needed.

**Alternatives considered**:
- Filter client-side in the hook — moves logic to the wrong layer; the API already does the query.

**Current state**: `GET()` takes no parameters (needs `request: NextRequest`). `NextRequest` is not imported (only `NextResponse`). The routes query is at lines 39-55 using `.in("id", routeIds)`.

## R4: Driver Page Component

**Decision**: Wrap content in `<Suspense>`, extract inner content to `DriverPageContent`, read `vanId` via `useSearchParams`, pass to `useDriverRoutes(vanId)`.

**Rationale**: Next.js App Router requires `<Suspense>` boundary around components using `useSearchParams` (it triggers client-side rendering). The page currently has no `Suspense` or `useSearchParams`. The `queryClient.setQueryData` key must match the new query key `["driver-routes", vanId]`.

**Alternatives considered**:
- Read `vanId` from `window.location` directly — breaks SSR/hydration, non-idiomatic Next.js.
- Server component with `searchParams` prop — page is `"use client"`, would require restructuring.

**Current state**: Default export `DriverPage()` with `"use client"`. Uses `useDriverRoutes()` with no args. `queryClient.setQueryData` uses key `["driver-routes"]`. Auto-redirect logic for active shifts via `useEffect`.
