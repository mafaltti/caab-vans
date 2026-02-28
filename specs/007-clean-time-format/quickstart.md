# Quickstart: Clean Time Format

## What This Feature Does

Ensures all schedule times are displayed as `HH:MM` (e.g., "14:30") instead of `HH:MM:SS` (e.g., "14:30:00") across the entire app — both public and admin screens.

## Implementation Overview

1. **Add `formatTimeString` utility** to `src/lib/time.ts` — a single function that converts a raw PostgreSQL time string to `HH:MM` format.

2. **Apply to 5 API endpoints** — replace inline `.slice(0,5)` calls (admin) and add missing formatting (public) using the new utility.

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/time.ts` | Add `formatTimeString` export |
| `src/app/api/routes/route.ts` | Format `e.time` in entry mapping |
| `src/app/api/routes/[routeId]/route.ts` | Format `e.time` in entry mapping |
| `src/app/api/admin/routes/[routeId]/schedule/route.ts` | Replace 2x `.slice(0,5)` with `formatTimeString` |
| `src/app/api/admin/routes/[routeId]/schedule/[entryId]/route.ts` | Replace 1x `.slice(0,5)` with `formatTimeString` |

## How to Test

1. Start dev server: `npm run dev`
2. Visit any route page — verify next stop time shows "HH:MM" without seconds
3. Visit route detail — verify all schedule times show "HH:MM"
4. In admin, view/create/update schedule entries — verify "HH:MM" format
5. Run quality gates: `npm run lint && npx tsc --noEmit && npm run build`
