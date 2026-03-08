# Quickstart: Progress Pointer Cutover

**Feature**: 052-progress-pointer-cutover
**Branch**: `052-progress-pointer-cutover`

## Prerequisites

- Node.js and pnpm installed
- Local Supabase running (`supabase start` or Docker stack)
- `.env.local` configured with Supabase credentials

## Getting Started

```bash
git checkout 052-progress-pointer-cutover
pnpm install
```

## Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/tracking/eta.ts` | Add `targetStopId` parameter to `computeEta` |
| `src/lib/tracking/infer-stop-progress.ts` | Add error capture to 3 write operations |
| `src/lib/tracking/resolve-route-progress.ts` | **New** — shared progress resolver |
| `src/app/api/routes/route.ts` | Replace progress assembly with resolver call |
| `src/app/api/routes/[routeId]/route.ts` | Replace progress assembly with resolver call |

## New Environment Variable

```env
# Add to .env.local
TRACKING_PROGRESS_SOURCE=legacy   # Options: legacy | shadow | persisted
```

## Running Tests

```bash
# All tracking tests
pnpm vitest run src/__tests__/tracking/

# Specific test files affected
pnpm vitest run src/__tests__/tracking/eta.test.ts
pnpm vitest run src/__tests__/tracking/infer-stop-progress.test.ts
pnpm vitest run src/__tests__/tracking/routes-api.test.ts

# Watch mode during development
pnpm vitest src/__tests__/tracking/
```

## Quality Checks

```bash
pnpm eslint .
pnpm tsc --noEmit
pnpm next build
pnpm vitest run
```

## Rollout Sequence

1. Deploy with `TRACKING_PROGRESS_SOURCE=legacy` (no behavior change)
2. Switch to `shadow` in staging — monitor logs for mismatches (zero unexplained mismatches over a full day)
3. Switch to `shadow` in production — validate until mismatch rate is below 1% of total route loads over 48 hours (see spec.md §Shadow Validation Scenarios for exit criteria)
4. Switch to `persisted` — cutover complete
5. (Later) Remove `legacy` code path after stable period

## Monitoring Shadow Mode

Shadow mode emits structured logs for every mismatch between legacy and persisted results. Each log entry includes: route ID, run ID, run status, legacy `nextStopId`, persisted `next_stop_id`, and mismatch reason.

- **Where to check**: Application logs (stdout). Filter for `progress_source_mismatch` entries.
- **What to look for**: Recurring mismatches on the same route or stop pattern. Investigate any mismatch before cutover — common causes are stale pointers, completed runs with lingering pointers, or grouped stops.
- **Alert threshold**: If mismatch rate exceeds 5% over any 1-hour window, pause the rollout and investigate before proceeding.

## Rollback

To rollback at any stage, change `TRACKING_PROGRESS_SOURCE` back to the previous mode:

- From `persisted` → set to `shadow` (resumes logging mismatches, serves legacy results)
- From `shadow` → set to `legacy` (disables all new behavior entirely)

No deployment or code change is needed — only the env var. The rollback takes effect on the next request.

## Testing the Feature Locally

1. Start the dev server: `pnpm dev`
2. Start a route run via the tracking API
3. Send GPS pings to trigger stop inference
4. Check structured logs for pointer write success/failure
5. Load route list and detail pages — verify ETA consistency
6. Toggle `TRACKING_PROGRESS_SOURCE` between modes and compare behavior
