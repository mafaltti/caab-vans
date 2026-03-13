# CAAB Vans — Deployment Skew: Root Cause and Fixes

## Root Cause

When the Next.js container restarts or is redeployed, the server generates a new build with new Server Action IDs. Browsers that still have the old JS bundle cached send requests referencing the old action IDs, which fail with:

```
Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
```

Even though the "Iniciar Turno" button uses `fetch()` (not a Server Action directly), the stale bundle can cause hydration failures and broken client-side JavaScript — meaning click handlers silently stop working.

## Why It Happened Now

The container was restarted on **2026-03-09 21:26 UTC**. The driver's browser had cached the old JS bundle. The timing coincided with the GPS reset — the reset itself did not cause it.

---

## What's Missing (3 Things)

### 1. No Deployment Skew Handler

Next.js App Router has no built-in auto-reload on Server Action mismatch. A global error boundary (`app/global-error.tsx`) is needed to detect the "Failed to find Server Action" error and force a `window.location.reload()`.

### 2. No Router Cache Control

Next.js aggressively caches RSC payloads client-side (Router Cache). Setting `experimental.staleTimes: { dynamic: 0, static: 0 }` in `next.config.ts` disables it, so navigations always fetch fresh data from the server.

### 3. No Cache-Busting Headers on Static Assets

The middleware sets `Cache-Control: no-store` on `/admin/*` and `/driver/*` pages, but the JS/CSS chunks under `/_next/static/` are cached by the browser (and Cloudflare if proxied). After a redeploy, stale chunks persist until the user hard-refreshes.

---

## Recommended Fixes

| Fix | File | Impact |
|---|---|---|
| Add `global-error.tsx` that auto-reloads on Server Action error | `src/app/global-error.tsx` | Catches the error and reloads transparently — driver never sees a broken page |
| Set `staleTimes: { dynamic: 0, static: 0 }` | `next.config.ts` | Pages always fetch fresh RSC payloads on navigation |
| Add `fetchWithAuth` retry with reload on 404/500 from stale action | `src/lib/api/fetch-with-auth.ts` | The start/end buttons automatically retry after reload |

The most critical fix is **#1** — it makes the problem self-healing. The driver would see a brief flash as the page reloads, then everything works with the new bundle. Without it, the driver is stuck until they manually hard-refresh.
