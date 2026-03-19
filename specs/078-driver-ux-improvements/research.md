# Research: Driver UX Improvements

**Feature**: 078-driver-ux-improvements
**Date**: 2026-03-19

## Phase 1 — Navigation Flow Fixes

### R1: Route list page data fetching pattern

**Decision**: Migrate from manual `useState` + `useRef` + `useEffect` fetch to TanStack Query `useQuery` with 30s polling.

**Rationale**: The active route page already uses TanStack Query (5s polling, mutations, cache invalidation). The route list page uses a manual one-shot fetch pattern that prevents auto-refresh and makes optimistic updates harder. Migrating aligns the driver app with existing patterns.

**Current state**: `src/app/driver/(protected)/page.tsx` uses `useState` for `routes`, `userId`, `loading`, with a `useRef` guard to prevent double-fetch. Calls `fetchWithDriverAuth("/api/driver/routes")`.

**Target state**: `useQuery({ queryKey: ["driver-routes"], queryFn, refetchInterval: 30_000 })`. Auto-redirect logic runs in a `useEffect` watching query data. Optimistic updates via `queryClient.setQueryData` after shift start/end.

**Alternatives considered**:
- Keep manual fetch + add `setInterval` polling: More code, less consistent with the rest of the app.
- Use SWR: Project already uses TanStack Query; adding another library violates KISS.

### R2: Auto-navigate after shift start

**Decision**: Call `router.push(`/driver/routes/${route.id}`)` after successful shift start in `route-card.tsx`.

**Rationale**: The `handleStart` function in `route-card.tsx` already updates the route state via `applyStartData()` after a successful start. Navigation should happen immediately after state update (normal flow, line ~136) or after `handleConfirmColdStart` succeeds (cold-start flow, line ~163).

**Current state**: After shift start, the driver stays on the route list and must manually tap "Ver rota ativa" to navigate.

**Key detail**: The component uses Next.js `useRouter()` internally for nothing currently, so adding `router.push()` is trivial.

### R3: Cold-start dialog dismissibility

**Decision**: Remove the "Pular" (skip) button and prevent ESC/backdrop close on the cold-start dialog.

**Rationale**: The current "Pular" button calls `handleDismissColdStart()` which closes the dialog without confirming a stop. This means the shift starts but the system doesn't know the driver's current position. Making the dialog non-dismissible ensures the cold-start stop is always confirmed before navigation.

**Current state**: Dialog footer has a "Pular" outline button (line ~421) and the dialog has default `onOpenChange` behavior allowing ESC/backdrop close.

**Implementation**: Remove "Pular" button, set `onOpenChange` to a no-op function.

### R4: Header home link

**Decision**: Wrap the `<h1>` "CAAB Vans" text in a `<Link href="/driver">` in the driver protected layout.

**Current state**: `src/app/driver/(protected)/layout.tsx` has `<h1 className="text-sm font-semibold text-zinc-900">CAAB Vans</h1>` as plain text.

**Key detail**: Layout is a server component. `<Link>` from `next/link` works in server components.

### R5: Auto-redirect to active route

**Decision**: In the route list page, after query data loads, check for an active shift belonging to the current user and redirect via `router.replace()`.

**Rationale**: `router.replace()` (not `push`) prevents the redirect from cluttering browser history. The check is: `routes.find(r => r.activeShift?.driverId === userId)`.

**Key detail**: The driver routes API already returns `activeShift` with `driverId` on each route, and `userId` in the response. No additional API calls needed.

---

## Phase 2 — Active Route Enrichments

### R6: Progress indicator data availability

**Decision**: Compute progress from existing `RouteProgress` fields already available in the active route response.

**Rationale**: `progress.passedStopIds` (contiguous passed stops) and `progress.skippedStopIds` (all skipped) are already returned by the driver route API. Total stops is `route.schedule.length`. No new API needed.

**Computation**: `passedCount = (passedStopIds?.length ?? 0) + (skippedStopIds?.length ?? 0)`.

### R7: Shift duration timer

**Decision**: New `ShiftTimer` component using `useState` + `setInterval(1000)` computing elapsed from `progress.shiftStartedAt`.

**Rationale**: `shiftStartedAt` is already in the `RouteProgress` response (from `route_shifts.started_at`). The timer recomputes on each tick from the stored timestamp (not incrementing), making it resilient to device sleep.

**Format**: `"{X}h {Y}min em turno"` (>=1h) or `"{X} min em turno"` (<1h). No Luxon needed — simple `Date.now() - new Date(shiftStartedAt).getTime()` arithmetic.

### R8: Connection awareness banner

**Decision**: New `ConnectionBanner` component using TanStack Query's `dataUpdatedAt` from the driver-route query plus `navigator.onLine` event.

**Rationale**: `dataUpdatedAt` is not currently used anywhere in the project, but it's available from TanStack Query's return value. Checking `(Date.now() - dataUpdatedAt) / 1000 > 20` with a 5s interval detects stale data. `navigator.onLine` provides immediate offline detection.

**Alternatives considered**:
- Custom WebSocket heartbeat: Over-engineered for the polling-based architecture.
- Service Worker-based: Too complex for this use case.

### R9: Stop advancement feedback

**Decision**: Track `previousNextStopId` via `useRef`. On each query data update, compare with current `progress.nextStopId`. If changed, vibrate + highlight.

**Rationale**: The active route page already polls every 5s. When the server detects a geofence match and updates `next_stop_id`, the next poll picks up the change. Comparing with the previous value detects advancement.

**Key detail**: `navigator.vibrate?.(200)` is a one-liner with graceful degradation. The `NextStopHero` component receives a `highlighted` prop for the pulse animation.

### R10: Shift-end summary

**Decision**: Compute summary from existing schedule data in the confirmation dialog. No new API needed.

**Rationale**: The active route page already has `progress.shiftStartedAt`, `route.schedule` entries with `passedAt` timestamps and `status`. Duration: `Date.now() - shiftStartedAt`. Passed count: schedule entries where `status === "passed"` and `passedAt >= shiftStartedAt`. Skipped count: entries where `status === "skipped"`.

**Key detail**: The end-shift dialog exists in TWO places: `route-card.tsx` and the active route page. With auto-redirect (R5), the route list is unreachable during a shift, so only the active route page dialog needs the summary. Update both for consistency.

---

## Phase 3 — PIN Login

### R11: PIN storage and authentication strategy

**Decision**: New `driver_pins` table with `pin_hash` (bcrypt) and `pin_digest` (SHA-256). Lookup by `pin_digest`, verify with `pin_hash`.

**Rationale**: SHA-256 digest enables O(1) lookup by PIN without bcrypt comparison across all users. Bcrypt hash provides secure verification after lookup. `UNIQUE` on `pin_digest` enforces global PIN uniqueness at the DB level.

**Schema**:
```sql
CREATE TABLE driver_pins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id),
  pin_hash   TEXT NOT NULL,
  pin_digest CHAR(64) NOT NULL UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Alternatives considered**:
- Store PIN in `app_metadata`: Metadata is not indexed, can't enforce uniqueness, and PIN would be visible in Supabase Studio.
- Use Supabase Auth with PIN as password: Requires separate email-like identifier lookup; breaks the "PIN only" UX.

### R12: PIN session creation

**Decision**: Use `supabase.auth.admin.generateLink({ type: "magiclink", email })` to get a session token, then exchange it server-side.

**Rationale**: Supabase GoTrue doesn't have a "sign in as user" admin API. The `generateLink` approach creates a valid auth link that can be processed server-side to establish a session cookie. This is the standard pattern for programmatic session creation in Supabase without knowing the user's password.

**Alternative approach**: Use `supabase.auth.admin.createUser()` with a temporary password, then `signInWithPassword()`. This is hacky and changes the user's actual password.

**Final approach (simplest)**: Use Supabase's `auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })` which returns `properties.hashed_token`. Then call `supabase.auth.verifyOtp({ token_hash: hashed_token, type: 'magiclink' })` to establish a session. The session cookie is set via the standard cookie handler.

### R13: Rate limiting for PIN login

**Decision**: Reuse existing `createRateLimiter()` from `src/lib/api/rate-limit.ts` with IP-based key.

**Rationale**: The project already has a production-ready in-memory rate limiter (sliding window, auto-cleanup). Apply it with `windowMs: 60_000, maxRequests: 5` keyed by client IP.

**Key detail**: Extract IP from `request.headers.get("x-forwarded-for")` (behind Caddy reverse proxy) or fall back to a generic key.

### R14: Admin PIN management

**Decision**: New API endpoint `POST /api/admin/drivers/[userId]/pin`. Admin UI adds a "PIN" section to the driver management screen.

**Rationale**: Follows existing admin API patterns (`src/app/api/admin/drivers/route.ts`). The endpoint handles both set and reset (upsert). Uses `requireRole("admin")` (admin + superuser can manage PINs).

**Key detail**: For random PIN generation, use `crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')` server-side.

### R15: PIN login frontend

**Decision**: Redesign `src/app/driver/login/page.tsx` with PIN pad as primary login method, email/password as fallback.

**Rationale**: The current login page is a simple email/password form. The redesign adds a 6-digit PIN pad with dot indicators and auto-submit, with a "Entrar com e-mail" toggle to reveal the current form.

**Key detail**: PIN pad uses 0-9 buttons with large touch targets (min 48x48px for mobile accessibility). Auto-submit fires after the 6th digit. Clear/backspace button for corrections.
