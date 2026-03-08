# Phase 2 Plan — Progress Pointer Cutover

Current baseline is stable: tests and typecheck pass. The safe plan is to treat this as a **source-of-truth cutover for `nextStopId` and ETA targeting**, not as a full removal of `route_run_stops` reads. That distinction matters because the current APIs still need stop rows for `passedStopIds`, recent-run factors, and segment fallback in [`src/app/api/routes/route.ts`](/C:/Projetos/caab-vans/src/app/api/routes/route.ts) and [`src/app/api/routes/[routeId]/route.ts`](/C:/Projetos/caab-vans/src/app/api/routes/[routeId]/route.ts).

---

## 1. Define the Cutover Contract

- Set the invariant that `progress.nextStopId`, `route.nextStop.id`, ETA, timeline highlight, map highlight, and hero card must all refer to the same schedule entry when tracking is active.
- Keep `route_run_stops` as the source for `passedStopIds`, delay history, and recent segment data during this cutover.
- Define fallback behavior: if persisted pointer is missing, stale, invalid, or inconsistent with current run state, the API must fall back to legacy recomputation.
- Preserve current run-state semantics: `completed` returns no next stop; `waiting` and `idle` do not accidentally present the route as actively progressing.

## 2. Refactor ETA to Accept an Explicit Target

Change [`src/lib/tracking/eta.ts`](/C:/Projetos/caab-vans/src/lib/tracking/eta.ts) so `computeEta` accepts `targetStopId` or a resolved target stop.

- When `targetStopId` is provided, stop using internal "first future pending stop" selection as the primary choice.
- Make ETA work for overdue pending stops, because persisted `next_stop_id` in [`src/lib/tracking/infer-stop-progress.ts`](/C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts) can legitimately point to an overdue pending stop.
- Keep the current internal time-floor logic only as fallback when no explicit target is available.

## 3. Introduce One Shared Progress Resolver

Extract the duplicated route-progress assembly from both route handlers into a single helper, e.g. `src/lib/tracking/resolve-route-progress.ts`.

That helper should:

1. Read `route_runs`, `route_shifts`, and `route_run_stops`.
2. Decide whether to trust persisted `next_stop_id`.
3. Validate that the pointer exists in the current schedule and is still pending or otherwise acceptable for the run state.
4. Call `computeEta` with the exact target stop.
5. Return one canonical progress object used by both endpoints.

This removes the current duplication between [`src/app/api/routes/route.ts`](/C:/Projetos/caab-vans/src/app/api/routes/route.ts) and [`src/app/api/routes/[routeId]/route.ts`](/C:/Projetos/caab-vans/src/app/api/routes/[routeId]/route.ts), which is the biggest maintainability risk during cutover.

## 4. Harden the Write Path Before Trusting It

In [`src/lib/tracking/infer-stop-progress.ts`](/C:/Projetos/caab-vans/src/lib/tracking/infer-stop-progress.ts):

- Check and log failures from the `route_runs` update instead of ignoring the result.
- Emit structured logs when pointer writes fail, including `run.id`, `route.id`, chosen `lastPassedStopId`, chosen `nextStopId`, and `serviceDate`.
- Decide whether pointer persistence needs a retry path or can rely on fallback-to-legacy reads during rollout.
- Do not make `route_runs` the sole authority until pointer write failure is observable.

## 5. Add Test Coverage That Does Not Exist Today

### ETA Tests

Extend [`src/__tests__/tracking/eta.test.ts`](/C:/Projetos/caab-vans/src/__tests__/tracking/eta.test.ts) with explicit-target cases:

- target stop is overdue
- target stop differs from `startedAt`/`now`-based selection
- target stop is invalid or not found
- all stops passed
- stale GPS, GPS branch, and segment fallback all still target the same stop

### Route Handler Tests

Replace or supplement [`src/__tests__/tracking/routes-api.test.ts`](/C:/Projetos/caab-vans/src/__tests__/tracking/routes-api.test.ts) with real route-handler tests for both endpoints, not just helper derivation tests.

Add endpoint tests asserting:

- `route.nextStop.id === progress.nextStopId`
- ETA is only for that same stop
- completed runs return no next stop even if persisted pointer remains on `route_runs`
- repeated stops and `stop_group_id` cases still resolve correctly
- overdue routes keep pointer/ETA/UI aligned

### UI Regression Tests

Add UI regression tests for [`src/app/(public)/routes/[routeId]/page.tsx`](/C:/Projetos/caab-vans/src/app/(public)/routes/[routeId]/page.tsx) and [`src/components/public/route-card.tsx`](/C:/Projetos/caab-vans/src/components/public/route-card.tsx), because both currently gate ETA display on `route.nextStop.id === progress.nextStopId`.

## 6. Add Rollout Controls

Introduce an env flag: `TRACKING_PROGRESS_SOURCE=legacy|shadow|persisted`.

- `legacy` — current behavior.
- `shadow` — compute both legacy and persisted-target results, return legacy, and log mismatches.
- `persisted` — use persisted pointer when valid, otherwise fall back to legacy.

Add structured shadow logs with `routeId`, `runId`, `runStatus`, legacy `nextStopId`, persisted `next_stop_id`, ETA target, and mismatch reason.

## 7. Run a Shadow-Validation Phase

Enable `shadow` in staging first. Validate the highest-risk cases manually:

- route running on time
- route late with all remaining stops overdue
- stale GPS but active shift
- repeated stop names / grouped stops
- idle break between shifts
- completed run
- missing or invalid persisted pointer

Keep shadow mode in production for a few days only if logs are low-noise and actionable. Define an exit criterion up front — e.g. zero unexplained mismatches in staging and an acceptably low mismatch rate in production shadow logs.

## 8. Execute the Cutover

- Switch the canonical `progress.nextStopId` in the shared helper to `route_runs.next_stop_id` when valid.
- Pass that exact target into `computeEta`.
- Resolve `route.nextStop` from the same target with `resolveNextStop`.
- Leave `passedStopIds`, recent-run blending, and segment fallback derived from `route_run_stops`.
- Keep the legacy fallback path behind the feature flag.

## 9. Post-Cutover Stabilization

- Monitor logs for pointer write failures and source mismatches.
- Verify that passenger-facing ETA display remains stable on route list and route detail pages.
- Update the docs that currently overstate the implementation, especially [`docs/execution/0080-tracking-final-summary.md`](/C:/Projetos/caab-vans/docs/execution/0080-tracking-final-summary.md).
- Only after a stable period should you consider removing legacy next-stop recomputation.

## 10. Separate Later Optimization Phase

- If the goal is actual read-path performance, plan a later phase to denormalize more than `next_stop_id`.
- Today's cutover will improve correctness and consistency more than raw performance, because the APIs still need `route_run_stops`.
- A real performance phase would likely require persisting additional progress state, not just the two pointers.

---

*If you want, I can convert this into a repo-ready spec/tasks document in `specs/` or `docs/execution/`.*
