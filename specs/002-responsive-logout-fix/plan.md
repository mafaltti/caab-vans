# Implementation Plan: Mobile Responsiveness & Secure Logout

**Branch**: `002-responsive-logout-fix` | **Date**: 2026-02-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-responsive-logout-fix/spec.md`

## Summary

Fix two production issues: (1) the logout button ("Sair") does not fully invalidate the server-side session, allowing browser back-button access to cached authenticated pages; (2) admin tables and the schedule editor overflow horizontally on mobile devices. The approach is: add a server-side logout API route, set `Cache-Control: no-store` in middleware for all admin responses, add a client-side 401-redirect fetch wrapper, and apply responsive column hiding to admin tables.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16.1.6, React 19.2.3)
**Primary Dependencies**: `@supabase/ssr ^0.8.0`, `@supabase/supabase-js ^2.97.0`, Tailwind CSS, shadcn/ui
**Storage**: Supabase (Postgres) — no schema changes in this feature
**Testing**: Vitest (+ manual browser testing for cache-control and responsive layout)
**Target Platform**: Web (mobile + desktop browsers)
**Project Type**: Web application (Next.js App Router with BFF)
**Performance Goals**: N/A — no performance-sensitive changes
**Constraints**: All admin responses must include `Cache-Control: no-store` to prevent back-button access
**Scale/Scope**: 11 admin API routes, 4 admin list pages, 1 schedule editor component, 1 middleware file, 1 new API route

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| **KISS** | PASS | Fixes use minimal changes: one middleware header, one new API route, Tailwind responsive classes. No new abstractions beyond a small fetch wrapper. |
| **DRY** | PASS | Cache-control set once in middleware (not per-route). 401 handling in one shared wrapper (not per-page). Column-hiding uses standard Tailwind classes on existing elements. |
| **YAGNI** | PASS | No new libraries, no card-based table layout, no Supabase `onAuthStateChange` listener (unnecessary given server-side cache-control). Only what's needed to fix the two reported bugs. |
| **Stack Constraints** | PASS | Uses Next.js Route Handlers, `@supabase/ssr`, Tailwind CSS, shadcn/ui. No Edge Functions. |
| **Security** | PASS | Service role key not involved. Logout uses session client (anon key + cookies). Cache-control prevents sensitive data exposure via browser cache. |
| **Branch & Merge** | PASS | Working on feature branch `002-responsive-logout-fix`. PR will target `dev`. |
| **Quality Gates** | PASS | Will run lint, typecheck, build, and tests before PR. |

**Post-Phase 1 Re-check**: All gates still pass. No new abstractions or dependencies introduced. The `fetchWithAuth` wrapper is justified by 4+ call sites (DRY threshold met).

## Project Structure

### Documentation (this feature)

```text
specs/002-responsive-logout-fix/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Phase 1 data model (no changes)
├── quickstart.md        # Phase 1 dev quickstart
├── contracts/
│   └── logout-endpoint.md  # New POST /api/admin/auth/logout contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (files touched by this feature)

```text
src/
├── app/
│   ├── api/admin/auth/
│   │   ├── login/route.ts          # Existing (no changes)
│   │   └── logout/route.ts         # NEW — server-side logout endpoint
│   └── admin/
│       ├── vans/page.tsx            # MODIFY — responsive column hiding
│       ├── routes/page.tsx          # MODIFY — responsive column hiding
│       ├── announcements/page.tsx   # MODIFY — responsive column hiding
│       └── users/page.tsx           # MODIFY — responsive column hiding
├── components/
│   └── admin/
│       ├── logout-button.tsx        # MODIFY — call API, error/loading state
│       └── schedule-editor.tsx      # MODIFY — responsive widths + flex-wrap
├── lib/
│   └── api/
│       └── fetch-with-auth.ts       # NEW — shared fetch with 401 redirect
└── middleware.ts                     # MODIFY — add Cache-Control header
```

**Structure Decision**: This is a Next.js App Router project with a flat `src/` layout. All changes fit within the existing directory structure. Two new files are added (`logout/route.ts` and `fetch-with-auth.ts`), both in logical locations next to their counterparts.

## Design Decisions

### D1: Server-Side Logout via API Route

**What**: New `POST /api/admin/auth/logout` endpoint that calls `supabase.auth.signOut()` on the server using `createSessionClient()`.

**Why**: The browser client's `signOut()` does not reliably clear server-managed cookies. The session client uses `next/headers` `cookies()` API to properly clear them. See [research.md R1](./research.md).

**Contract**: See [contracts/logout-endpoint.md](./contracts/logout-endpoint.md).

### D2: Middleware Cache-Control Header

**What**: Add `Cache-Control: no-store` to the `NextResponse` in `middleware.ts` for all `/admin/*` routes.

**Why**: One line in one file prevents browser caching of all admin pages and API responses. When the user presses back after logout, the browser must re-fetch, triggering the middleware auth check. See [research.md R2](./research.md).

**Implementation**:
```typescript
// In middleware.ts, before returning the response:
response.headers.set("Cache-Control", "no-store");
```

### D3: Client-Side Fetch Wrapper with 401 Redirect

**What**: New `fetchWithAuth(url, init?)` function in `src/lib/api/fetch-with-auth.ts` that wraps `fetch()` and redirects to `/admin/login` on 401 responses.

**Why**: All 4 admin list pages use raw `fetch()` calls that ignore HTTP status. A shared wrapper handles 401 detection in one place (DRY — 4+ call sites). See [research.md R3](./research.md).

**Implementation**:
```typescript
export async function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/admin/login";
    // Return a never-resolving promise to prevent callers from processing the response
    return new Promise(() => {});
  }
  return res;
}
```

### D4: Responsive Column Hiding

**What**: Add `hidden sm:table-cell` (or `hidden md:table-cell`) Tailwind classes to secondary `<TableHead>` and `<TableCell>` elements in admin list pages.

**Why**: Simplest fix for horizontal scroll. No new components, no layout restructuring. The table component's existing `overflow-x-auto` wrapper serves as a fallback. See [research.md R4](./research.md).

**Column visibility per table**:

| Table | Always visible | Show at `sm:` (640px) | Show at `md:` (768px) |
|-------|---------------|----------------------|----------------------|
| Vans | Nome, Ações | Token, Última atualização | Webhook URL |
| Routes | Nome, Ações | Van | — |
| Announcements | Título, Ações | Expira | Status |
| Users | E-mail, Ações | Status | Papel |

### D5: Schedule Editor Responsive Fix

**What**: Change time input from `w-20` to `w-16 sm:w-20`. Add `flex-wrap` to the entry row container.

**Why**: Reduces minimum width on mobile while preserving desktop layout. `flex-wrap` allows action buttons to wrap if needed on very small screens. See [research.md R5](./research.md).

### D6: Logout Button Error & Loading State

**What**: Update `logout-button.tsx` to call `POST /api/admin/auth/logout`, add try/catch with error toast, and show a loading/disabled state during the request.

**Why**: Current implementation has no error handling and redirects even on failure. See [research.md R6](./research.md).

## Complexity Tracking

> No constitution violations — table intentionally left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | — | — |
