# task.ts — Two Changes Needed

File: `apps/van-tracker/src/location/task.ts`

## 1. Distinguish Filter Reasons in Diagnostics (lines 250–265)

Currently all three filters call `logFiltered()` with no way to tell which one triggered. Add a `logEvent("state_change", "flt:...")` before each `logFiltered()` with the specific reason:

- `"flt:accuracy=XX"` for accuracy filter
- `"flt:dup_ts"` for duplicate timestamp
- `"flt:stale_XXs"` for stale fix (with age in seconds)

## 2. Relax Stale Fix Guard After Cold Start (line 262)

The current 60-second stale threshold is too aggressive after a cold start. When the app restarts, Android returns cached GPS fixes while the hardware acquires a fresh satellite lock — all of these get rejected.

**Change:** Use a longer threshold (e.g. 120s) when `lastSentTime === 0` (meaning no successful send yet in this session). This gives GPS 2 minutes to get a fresh lock instead of 1.

```ts
const staleLimit = lastSentTime === 0 ? 120_000 : 60_000;
if (Date.now() - point.ts > staleLimit) {
```
