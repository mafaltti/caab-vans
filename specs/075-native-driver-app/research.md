# Research: Native Driver App

**Feature Branch**: `075-native-driver-app` | **Date**: 2026-03-16

## 1. Server Auth — Dual-Mode (Cookie + Bearer)

### Decision: Extend `requireAuth()` to accept bearer tokens via Supabase JWT validation

**Rationale**: The existing `requireAuth()` in `src/lib/api/auth.ts` uses `createSessionClient()` which reads cookies. For native callers, we pass the Supabase access token in `Authorization: Bearer <token>`. Supabase's `supabase.auth.getUser(token)` validates JWTs without cookies — no custom token table needed.

**Alternatives considered**:
- Custom `auth_tokens` table: Adds DB migration (violates FR-023), unnecessary complexity.
- Supabase custom JWT claims: Requires GoTrue config changes; SDK auto-refresh already handles standard tokens.

**Implementation approach**:
1. Modify `requireAuth()` to accept optional `NextRequest` parameter.
2. Check `Authorization` header first; if present, validate via `createClient()` with the bearer token.
3. Fall back to existing cookie-based `createSessionClient()` if no bearer header.
4. Return the same `AuthResult` shape — downstream code is unchanged.
5. All 7 driver endpoints pass `request` to `requireAuth(request)`.
6. Web callers without the header continue using cookies — zero behavioral change.

**Key files**: `src/lib/api/auth.ts`, `src/lib/supabase/server.ts`

## 2. Bound-Van Enforcement

### Decision: New `requireBoundVan()` helper using `x-bound-van-id` + `x-ingestion-token` headers

**Rationale**: Native callers send device-provisioned `vanId` and `ingestionToken` as headers. The helper validates the token against `vans.ingestion_token` in the DB (same pattern as tracking endpoints) and returns the bound van ID. If headers are absent (web caller), the helper returns `null` — endpoints skip filtering.

**Alternatives considered**:
- Embed van binding in the JWT claims: Requires auth config changes and ties van to user identity instead of device.
- Query parameter approach: Less secure, visible in logs.

**Implementation approach**:
1. New `requireBoundVan(request: NextRequest)` in `src/lib/api/auth.ts`.
2. Reads `x-bound-van-id` and `x-ingestion-token` headers.
3. If both present: validates token against `vans.ingestion_token` via service client.
4. If absent: returns `null` (web caller, no filtering applied).
5. Driver endpoints use the result to filter routes (GET list) or reject mutations (non-matching van).

**Key files**: `src/lib/api/auth.ts`, all 7 driver endpoint files

## 3. Expo Supabase Auth Client

### Decision: Install `@supabase/supabase-js` with AsyncStorage session adapter

**Rationale**: The tracker app currently has no Supabase client — it uses direct `fetch()` for tracking. For driver auth, we need `supabase.auth.signInWithPassword()` and automatic token refresh. The standard Supabase JS client with a custom storage adapter (AsyncStorage for session, SecureStore for tokens) provides this.

**Alternatives considered**:
- `@supabase/ssr`: Designed for server-side rendering, not React Native.
- Manual JWT refresh: Reinvents what the SDK does; error-prone.

**Implementation approach**:
1. Install `@supabase/supabase-js` in `apps/van-tracker`.
2. Create `src/lib/supabase-client.ts` with AsyncStorage-backed session persistence.
3. Auth functions: `signIn(email, password)`, `signOut()`, `getSession()`, `onAuthStateChange()`.
4. Post-login validation: check `app_metadata.role === 'driver'` and `app_metadata.is_active`.
5. Store access/refresh tokens in SecureStore for extra security.

**Key files**: New `apps/van-tracker/src/lib/supabase-client.ts`

## 4. Storage Architecture Split

### Decision: Split current `Settings` into `DeviceProvisioning`, `DriverSession`, and `ShiftState`

**Rationale**: Current settings conflate device config (support-managed) with app state. The native driver app needs three distinct storage domains with different lifecycles and access patterns.

**Implementation approach**:
- **DeviceProvisioning** (`src/storage/settings.ts` — refactor existing): `apiBaseUrl`, `vanId`, `ingestionToken`. Support-managed, persists across driver sessions.
- **DriverSession** (new `src/storage/driver-session.ts`): Supabase session tokens, user profile. Managed by auth flows. Cleared on logout.
- **ShiftState** (new `src/storage/shift-state.ts`): `activeRouteId`, `shiftActive`, `activeShiftId`. Persisted in both AsyncStorage and device-protected storage for reboot resilience.

**Key files**: `src/storage/settings.ts` (rename type), new `src/storage/driver-session.ts`, new `src/storage/shift-state.ts`, update `src/storage/device-protected-state.ts`

## 5. Tracking Lifecycle Decoupling

### Decision: Extract `requestLocationPermissions()` as independent function

**Rationale**: Currently `startTracking()` bundles permission requests, service start, geofence registration, battery listener, and health check. The driver workflow needs to: (1) check permissions before shift start, (2) start tracking after shift confirmation — two separate steps.

**Implementation approach**:
1. Extract `requestLocationPermissions()` from `startTracking()` — returns `boolean`.
2. Add optional `skipPermissions` parameter to `startTracking()`.
3. Boot recovery and health check call `startTracking(true)` (permissions already granted).
4. Driver UI calls `requestLocationPermissions()` first, then `startTracking(true)` after shift start succeeds.

**Key files**: `apps/van-tracker/src/location/tracking.ts`

## 6. Boot Recovery Gate on Shift State

### Decision: Change boot resume condition from `trackingEnabled && settingsComplete` to additionally require `shiftActive`

**Rationale**: Without shift gating, a device could resume tracking after a shift was ended on the server (e.g., admin ended it). Adding `shiftActive` to device-protected storage ensures boot recovery only fires when a shift was genuinely in progress.

**Implementation approach**:
1. Add `shiftActive` and `activeRouteId` to device-protected storage writes.
2. Boot recovery reads `shiftActive` from device-protected storage.
3. Condition: `wasTracking && settingsComplete && shiftActive`.
4. On app foreground: reconcile with server — if no active shift, clear local state and stop tracking.

**Key files**: `src/storage/device-protected-state.ts`, `DeviceProtectedStorage.kt`, `app/_layout.tsx`

## 7. Native Driver Screens

### Decision: Build screens with expo-router file-based routing, direct fetch + useEffect/useState for data

**Rationale**: The existing tracker app uses direct fetch (no TanStack Query). For consistency and simplicity, the driver screens will use the same pattern with `setInterval` for 5-second polling. Adding TanStack Query would be a significant new dependency for a small number of screens.

**Alternatives considered**:
- TanStack Query: Powerful but heavyweight for 2 polling screens. YAGNI for V1.
- SWR: Lighter but still a new dependency with learning curve for this codebase.

**Implementation approach**:
- New screens via expo-router: `app/login.tsx`, `app/(driver)/index.tsx` (route list), `app/(driver)/routes/[routeId].tsx` (active route), `app/device-setup.tsx`.
- Bootstrap gate in `app/_layout.tsx` redirects based on provisioning + session + shift state.
- API helper: `fetchWithDriverAuth(url, options)` adds bearer token + bound-van headers.
- 5-second polling via `setInterval` + `useEffect` cleanup.
- Bottom sheet for exception drawer using React Native Modal or a lightweight sheet.

**Key files**: Multiple new screen files in `apps/van-tracker/app/`

## 8. Server Reconciliation on Foreground

### Decision: New `useShiftReconciliation()` hook that runs on app foreground

**Rationale**: When the app returns to foreground (or restarts), local state may be stale. The hook fetches the server's view of the bound van's active shift and reconciles: if server has no active shift, stop tracking and clear local shift state. If server has an active shift, restore the active route screen.

**Implementation approach**:
1. Use `AppState` listener to detect foreground transitions.
2. On foreground: call `GET /api/driver/routes` with bound-van headers.
3. Compare server response with local `ShiftState`.
4. Mismatch → clear local state + stop tracking (if no server shift) or restore (if server shift exists).
5. Also run on initial app mount (bootstrap).

**Key files**: New `apps/van-tracker/src/hooks/use-shift-reconciliation.ts`
