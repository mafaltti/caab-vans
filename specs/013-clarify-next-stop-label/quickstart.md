# Quickstart: Clarify Next Stop Label

**Branch**: `013-clarify-next-stop-label`

## What to Change

**One file, one line:**

| File | Line | Old | New |
|------|------|-----|-----|
| `src/components/public/schedule-timeline.tsx` | 145 | `Parada atual / Próxima` | `Próxima parada` |

## How to Verify

1. **Lint**: `npx eslint src/components/public/schedule-timeline.tsx`
2. **Type-check**: `npx tsc --noEmit`
3. **Build**: `npm run build`
4. **Tests**: `npx vitest run`
5. **Visual**: Open any active route detail page → scroll to the schedule timeline → confirm the highlighted stop shows "Próxima parada"

## No Data Model or API Changes

This is a UI copy fix. No backend, database, or API contract changes are needed.
