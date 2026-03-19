# Quickstart: Driver UX Improvements

**Feature**: 078-driver-ux-improvements

## Prerequisites

- Node.js 20+
- Local Supabase instance running (`supabase start` or Docker Compose)
- `.env.local` configured with Supabase URL and keys

## Development Setup

```bash
# Install dependencies (if new packages added)
npm install

# Run dev server
npm run dev

# Run type check
npx tsc --noEmit

# Run linter
npx eslint .

# Run tests
npx vitest
```

## Phase 1 — Navigation Flow Fixes

**Files to modify**:
- `src/app/driver/(protected)/layout.tsx` — Add Link to header h1
- `src/components/driver/route-card.tsx` — Auto-navigate after shift start, make cold-start non-dismissible
- `src/app/driver/(protected)/page.tsx` — Migrate to TanStack Query, add auto-redirect

**Testing**:
1. Start a shift → verify auto-navigation to active route page
2. Start a shift with cold-start → verify dialog is non-dismissible, then auto-navigates after confirm
3. Refresh browser mid-shift → verify redirect to active route
4. Tap "CAAB Vans" header → verify navigation to driver home
5. Wait 30s on route list → verify data refreshes

## Phase 2 — Active Route Enrichments

**New components**:
- `src/components/driver/active-route/shift-timer.tsx`
- `src/components/driver/active-route/connection-banner.tsx`

**Files to modify**:
- `src/app/driver/(protected)/routes/[routeId]/page.tsx` — Add progress indicator, stop feedback, shift-end summary
- `src/components/driver/active-route/next-stop-hero.tsx` — Add highlighted prop
- `src/components/driver/route-card.tsx` — Add shift-end summary to its dialog

**Testing**:
1. View active route with stops passed → verify progress bar shows correct count
2. Check shift timer displays and increments
3. Disable network → verify amber connection banner appears within 20s
4. Re-enable network → verify banner dismisses
5. Trigger stop advancement → verify vibration + visual highlight
6. Tap "Encerrar Turno" → verify summary in confirmation dialog

## Phase 3 — PIN Login

**New migration**: `supabase/migrations/00024_driver_pins.sql` (next available number — verify before creating)

**New API routes**:
- `src/app/api/driver/auth/pin-login/route.ts`
- `src/app/api/admin/drivers/[userId]/pin/route.ts`
- `src/app/api/admin/drivers/[userId]/generate-pin/route.ts`

**Files to modify**:
- `src/app/driver/login/page.tsx` — Add PIN pad with email fallback

**New dependencies** (verify if needed):
- `bcryptjs` — For PIN hashing (check if already available via Supabase server-side)

**Testing**:
1. Run migration: `supabase db push` or apply migration file
2. Set PIN via admin API → verify in DB
3. Login with PIN → verify session created and redirect works
4. Try duplicate PIN → verify 409 conflict
5. Try 6 wrong PINs in 1 minute → verify rate limiting (429)
6. Login with deactivated account PIN → verify generic 401

## Quality Gates

```bash
# All must pass before PR
npx eslint .
npx tsc --noEmit
npm run build
npx vitest
```
