# Persisted Progress Pointers

The ingestion pipeline (`inferStopProgress`) computes which stop was last passed and which is next, then writes those IDs to `route_runs.last_passed_stop_id` and `route_runs.next_stop_id`.

## Debugging Aid

If something looks wrong in production, you can query `route_runs` directly and see exactly what the inference decided — without having to re-derive it from all the individual `route_run_stops` rows.

## Single Source of Truth for What Inference Decided

The pointers capture the inference function's conclusion at write time. Without them, you'd have to replicate the same logic (sort stops by time, find first pending, etc.) to figure out what the system "thought" the next stop was.

## Future Phase 2 Cutover

Right now the API ignores these persisted values and recomputes fresh from `route_run_stops` on every request. A Phase 2 would flip the API to read the persisted pointers directly instead of recomputing — which is faster and guarantees the API shows exactly what inference decided.

We didn't do this now because it requires ensuring the ETA is also computed for the same stop the pointer references, which needs a deeper refactor of `computeEta` to accept a target stop ID as input.

---

In short: we write the data now (useful for debugging), and it's structured so we can read it later (performance optimization) when we're ready to refactor ETA to match.
