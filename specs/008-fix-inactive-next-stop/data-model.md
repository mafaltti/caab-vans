# Data Model: Hide Next-Stop Display for Inactive Routes

**Date**: 2026-02-28

No new entities or schema changes. This fix modifies the computation logic for an existing field.

## Affected Computed Field

### `nextStop` (on `RouteWithStatus` / `RouteDetail`)

- **Type**: `NextStop | null` (unchanged)
- **Current behavior**: Computed purely from schedule time comparison — returns first future stop regardless of route running state.
- **New behavior**: Returns `null` when `isRunning === false`. Only returns a stop when the route is actively running.
- **Downstream impact**: All consumers already handle `null` (`route-card.tsx` hides the row; `hero-card.tsx` shows a fallback card).

## State Matrix (unchanged types, clarified semantics)

| `isRunning` | `scheduleStatus` | `nextStop` (after fix) | Route Card Display | Hero Card Display |
|-------------|-------------------|------------------------|--------------------|-------------------|
| `true` | `active` | `{ stopName, time }` | Shows next stop row | Blue "PRÓXIMA PARADA" card |
| `false` | `active` | `null` | No next stop row | Gray "Fora de operação" card |
| `false` | `ended` | `null` | No next stop row | Gray "Programação encerrada por hoje" |
| `false` | `not_started` | `null` | No next stop row | Gray "Fora de operação" card |
| `true` | `not_started` | Not possible | — | — |
