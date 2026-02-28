# Quickstart: Hide Next-Stop Display for Inactive Routes

**Date**: 2026-02-28

## Changes Overview

Three files need modification. No new files, no new dependencies, no migrations.

### 1. API — Routes list handler

**File**: `src/app/api/routes/route.ts`
**Change**: After computing `nextStop` and `isRunning`, set `nextStop = null` when `!isRunning`.

### 2. API — Route detail handler

**File**: `src/app/api/routes/[routeId]/route.ts`
**Change**: Same as above — set `nextStop = null` when `!isRunning`.

### 3. UI — Hero card fallback

**File**: `src/components/public/hero-card.tsx`
**Change**: Add an early-return branch for `!isRunning` (before the `!nextStop` check) that renders a gray card with "Fora de operação" text.

## What does NOT change

- `src/components/public/route-card.tsx` — already handles `nextStop = null` correctly.
- `src/lib/time.ts` — `getNextStop()` function stays pure (time-only logic).
- `src/types/index.ts` — no type changes.
- Database schema — no changes.

## Verification

```bash
npm run lint && npm run typecheck && npm run build
```

Manual: open the app when routes are not running and verify:
- Route list cards show no next stop row for "Fora de operação" routes.
- Route detail hero card shows gray "Fora de operação" instead of blue "PRÓXIMA PARADA".
- Running routes still display correctly (no regression).
