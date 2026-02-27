# Contract: POST /api/admin/auth/logout

**New endpoint** — no existing contract to modify.

## Request

```
POST /api/admin/auth/logout
Content-Type: (none required — no body)
Cookie: sb-* (Supabase session cookies — sent automatically by browser)
```

**Body**: None

## Responses

### 200 OK — Logout successful

```json
{ "ok": true }
```

**Headers**:
```
Cache-Control: no-store
Set-Cookie: sb-*=; Max-Age=0; Path=/  (Supabase SSR clears session cookies automatically)
```

### 500 Internal Server Error — Logout failed

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Failed to sign out"
  }
}
```

## Behavior

1. Creates a session client via `createSessionClient()`.
2. Calls `supabase.auth.signOut()` on the server.
3. Supabase SSR library automatically clears session cookies via `cookieStore.set()`.
4. Returns `{ ok: true }` on success.
5. Returns 500 with error details on failure.

## Auth

- Does **not** require `requireAuth()` guard — the endpoint should succeed even if the session is partially invalid or expired. A "best effort" signOut is safer than rejecting the request.
- If no session exists, `signOut()` is a no-op and the endpoint still returns 200.

## Notes

- This endpoint follows the same pattern as `POST /api/admin/auth/login` in the same directory.
- The client should perform a hard navigation (`window.location.href = "/admin/login"`) after a successful response, not a client-side router push, to ensure all in-memory state is cleared.
