# CAAB Vans — Wrong `nextStop` Pointer for Rota 02: Root Cause Analysis

## Root Cause

PostgREST `.order()` with `referencedTable` does not sort parent rows — it only sorts the embedded sub-object. The `inferStopProgress` function in `infer-stop-progress.ts` relies on two queries that use this pattern:

1. **Line 141:** `pendingStops` query — `.order("time", { referencedTable: "schedule_entries", ascending: true })`
2. **Line 390:** `allStops` query — `.order("time", { referencedTable: "schedule_entries", ascending: true })`

Both return rows in insertion order, not chronological order. Confirmed by querying `route_run_stops` without `ORDER BY` — the rows are jumbled (e.g., Comércio 08:30 appears after Mundo Plaza 19:05).

---

## How the Wrong Pointer Gets Written

The loop at lines `402-415` iterates `allStops` in insertion order and:

- Sets `nextStopId` = first pending stop encountered (happens to be correct by luck)
- Keeps overwriting `lastPassedStopId` for every passed stop — including passed stops that appear **after** pending stops in insertion order

This causes `lastPassedStopId` to reference a chronologically-earlier stop (e.g., Comércio 08:30) that appears late in insertion order. The adjacency check (line 428) then detects `lastPassedStopId` index 6 is not adjacent to `nextStopId` index 23, triggering the rollback.

The rollback (lines `430-438`) walks from `allStops[0]` — again in insertion order, not time order — and sets `lastPassedStopId = NULL` if the contiguous prefix doesn't cover all passed stops cleanly.

With `lastPassedStopId = NULL`, the pointer gets persisted with just `next_stop_id`. On the read side, the adjacency validation (line 224: `if (runData.last_passed_stop_id)`) is skipped when `NULL`, so any `next_stop_id` passes validation — including the stale `CAAB 15:05`.

---

## Current Impact

- Rota 02 shows **"CAAB 15:05"** as next stop when the actual next stop is **Mundo Plaza 13:50** (4 stops ahead).
- ETA is computed for the wrong stop (66 minutes to CAAB instead of the correct stop).
- Likely affects **all routes** — any route with non-sequential insertion order in `route_run_stops` will have incorrect pointers.

---

## Fix Required

In `infer-stop-progress.ts`, add a JavaScript `.sort()` by `schedule_entries.time` after **both** queries (lines `141` and `390`), since PostgREST's `referencedTable` ordering is cosmetic only and does not sort parent rows.
