# Data Model: Mobile Responsiveness & Secure Logout

**Branch**: `002-responsive-logout-fix` | **Date**: 2026-02-27

## Overview

This feature introduces **no new database entities or schema changes**. All changes are in the application layer (UI components, middleware, API routes).

## Existing Entities (Reference Only)

The following entities are relevant to the auth flow but are **not modified** by this feature:

### Session (Supabase Auth — managed by `@supabase/ssr`)

- **Storage**: Cookies (`sb-*` prefixed), managed by Supabase SSR library
- **Lifecycle**: Created on login → refreshed automatically → destroyed on logout
- **Access pattern**: Read by middleware on every `/admin/*` request via `supabase.auth.getUser()`

### User (Supabase Auth — `auth.users`)

- **Relevant fields**: `id`, `email`, `app_metadata.role`, `app_metadata.is_active`
- **Access pattern**: Checked by `requireAuth()` / `requireRole()` in API routes
- **Not modified** by this feature

## State Transitions

```
[Authenticated] --click "Sair"--> [Logout Request Pending]
    |                                    |
    |                              success / failure
    |                                /         \
    |                               v           v
    |                     [Logged Out]    [Error Shown]
    |                         |              (remains
    |                         |           authenticated)
    |                         v
    |                   [Redirect to
    |                    /admin/login]
    |
    +--session expires while viewing page-->
         |
         v
    [Next fetch returns 401]
         |
         v
    [Redirect to /admin/login]
```
