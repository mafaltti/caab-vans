# Research: Mobile Responsiveness & Secure Logout

**Branch**: `002-responsive-logout-fix` | **Date**: 2026-02-27

## R1: Supabase SSR Logout Best Practices

**Decision**: Implement a server-side logout API route (`POST /api/admin/auth/logout`) that calls `supabase.auth.signOut()` via the session client, then have the client call this endpoint instead of calling `signOut()` directly on the browser client.

**Rationale**: The `@supabase/ssr` library manages auth tokens in cookies. The server-side session client (`createSessionClient`) properly interacts with the Next.js `cookies()` API to clear them. The browser client's `signOut()` may not fully clear server-managed cookies, leaving a stale session that the middleware still considers valid.

**Alternatives considered**:
- Client-side only `signOut()` (current approach) — insufficient because it does not reliably clear server-side cookies.
- Combined client + server signOut — unnecessary complexity; server-side alone is sufficient since cookies are the source of truth.

## R2: Preventing Browser Back-Button Access to Cached Pages

**Decision**: Set `Cache-Control: no-store` on all responses passing through the admin middleware. This single header in the middleware covers both page navigations and is the most effective directive to prevent browsers from caching the response at all.

**Rationale**: `no-store` instructs the browser to never store the response. When the user presses back, the browser must re-fetch from the server, which triggers the middleware auth check. This is simpler and more effective than `no-cache, must-revalidate` which still allows storage but requires revalidation. Setting it in middleware (one place) covers all admin routes without modifying each API route individually.

**Alternatives considered**:
- Per-API-route cache headers — DRY violation; would require adding headers to all 11+ route files individually.
- `no-cache, must-revalidate` — allows the browser to store the response; some browsers may still show cached content on back navigation.
- Client-side `onAuthStateChange` listener — complementary but does not prevent the initial flash of cached content.

## R3: Client-Side 401 Detection Strategy

**Decision**: Create a shared fetch wrapper (`fetchWithAuth`) that checks response status and redirects to `/admin/login` on 401. Use it in all admin page data fetches.

**Rationale**: Currently, admin pages use raw `fetch()` calls that ignore HTTP status. If the session expires while viewing a page, subsequent fetches silently fail. A wrapper provides a single point to handle 401 redirects without duplicating the check in every page. This pattern already exists conceptually in the `requireAuth()` server helper — this is the client-side complement.

**Alternatives considered**:
- Per-page 401 handling — DRY violation across 4+ pages.
- TanStack Query global `onError` — the admin pages currently use raw `fetch` + `useEffect`, not TanStack Query. Introducing TanStack Query for admin is a larger refactor outside this feature's scope.
- Supabase `onAuthStateChange` listener — only fires when the Supabase client detects token expiry, not when the server rejects a request. Less reliable for server-side session invalidation.

## R4: Mobile Table Responsive Strategy

**Decision**: Use responsive column hiding with Tailwind breakpoints. On mobile (<640px), hide secondary columns and show only the primary identifier column plus the actions column. Reveal additional columns at `sm:` and `md:` breakpoints.

**Rationale**: This is the simplest approach (KISS) that solves the horizontal scroll problem. It requires only adding `hidden sm:table-cell` classes to secondary `<th>` and `<td>` elements — no new components, no layout restructuring. The existing `overflow-x-auto` wrapper on the table component serves as a safety net for any edge cases.

**Alternatives considered**:
- Card-based layout on mobile — much larger implementation effort, requires duplicating column rendering logic in a card template, violates YAGNI for an admin panel used occasionally on mobile.
- Removing `whitespace-nowrap` from the table component — would cause text wrapping in cells that rely on single-line display (e.g., dates, tokens), potentially worse UX.
- Responsive table libraries — adds a dependency for a simple problem; violates KISS.

**Column visibility plan per table**:

| Table | Always visible | Hidden below `sm` (640px) | Hidden below `md` (768px) |
|-------|---------------|---------------------------|---------------------------|
| Vans | Nome, Ações | Token, Última atualização | Webhook URL |
| Routes | Nome, Ações | Van | — |
| Announcements | Título, Ações | Expira | Status |
| Users | E-mail, Ações | Status | Papel |

## R5: Schedule Editor Mobile Layout

**Decision**: Replace fixed `w-20` time input width with `w-16 sm:w-20` and allow the flex container to wrap on small screens. Add `flex-wrap` so that action buttons can flow to a second line if needed.

**Rationale**: The schedule editor rows use `flex items-center gap-2` with a fixed `w-20` (80px) time input. On screens below 360px, this overflows. Reducing to `w-16` (64px) on mobile and allowing flex wrap solves overflow without restructuring the component. Time inputs at 64px still comfortably display `HH:mm` format.

**Alternatives considered**:
- Vertical stacking (`flex-col`) on mobile — excessive for a simple time + name row; makes the list much taller.
- Removing fixed width entirely — time inputs would grow inconsistently, making the list look misaligned.

## R6: Logout Error Handling & Loading State

**Decision**: Add try/catch with error state and a loading/disabled state to the logout button. On error, display a toast notification and keep the user on the current page (do not redirect).

**Rationale**: The current implementation has zero error handling — if `signOut()` fails, the user is still redirected to login while their session remains valid. This creates a confusing state. The fix is straightforward: wrap in try/catch, show error feedback, only redirect on success.

**Alternatives considered**:
- Silent retry on failure — masks the error from the user; could cause infinite loops on persistent failures.
- Redirect regardless and let middleware handle it — if the session is still valid, middleware would let them back in, causing a login → redirect → admin loop.
