# Quickstart: Fix ETA Idle Suppression

## Prerequisites

- Node.js + pnpm (existing dev setup)
- Supabase self-hosted stack running locally
- `.env.local` with Supabase URL, anon key, and service role key
- A test driver user assigned to a van (see specs/022-start-route/quickstart.md)

## Testing the Fix

### Setup

1. Start the dev server:
   ```bash
   pnpm dev
   ```

2. Simulate tracking pings so vans have fresh GPS data:
   ```bash
   pnpm tracking:simulate
   ```

### Reproduce the Bug (before fix)

1. Open `http://localhost:3000` (public routes page) — verify ETA shows for running vans
2. In another tab, log in as driver at `/admin/login` — redirects to `/driver`
3. Click **Iniciar Turno** on a route — public page still shows ETA (OK)
4. Click **Encerrar Turno** — **BUG**: public page loses ETA for that van

### Verify the Fix (after fix)

1. Repeat steps 1-4 above
2. After clicking **Encerrar Turno**, the public page should:
   - Still show ETA for the van (if GPS data is fresh and within schedule)
   - Show "Entre turnos" status badge
3. Other vans should be unaffected by the shift action
4. Open the route detail page (`/routes/{routeId}`) — ETA should also persist

### Key Files

| Area | Files |
|------|-------|
| Routes list API | `src/app/api/routes/route.ts` |
| Route detail API | `src/app/api/routes/[routeId]/route.ts` |
| ETA computation | `src/lib/tracking/eta.ts` |
| Status badge | `src/components/public/route-status-badge.tsx` |
| Route card | `src/components/public/route-card.tsx` |
| Hero card | `src/components/public/hero-card.tsx` |
