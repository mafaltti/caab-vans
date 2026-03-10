# CAAB Vans — Hardening Spec: Gap Analysis

## 1. Event-Time Replay for Batch & Buffered Pings

**Impact: High** — touches batch route, single route, inference function, OSRM module, and `van_location_pings` schema.

| Aspect | Current State | Spec Requires | Gap |
|---|---|---|---|
| `inferStopProgress` signature | Positional: `(supabase, vanId, lat, lng, snappedLat?, snappedLng?)` | Object arg with `eventTs` ISO string | Signature change needed |
| Service date derivation | `todayBahiaDate()` — wall-clock | Derived from `eventTs` | Change needed |
| Shift gate | `ended_at is null` (structural) | Gate on shift active at `eventTs` | Change needed — enables replay after shift end |
| `passed_at` value | `new Date().toISOString()` (processing time) | `= eventTs` (device time) | Change needed |
| Batch inference | Called once for `newestUpserted` only | Replay sequentially for every accepted non-duplicate ping | Major change — core of the fix |
| Batch inference when RPC returns false | Skipped entirely | Still run inference (only `update_van_position` skipped for older pings) | Change needed |
| Snapped coords per ping | Not stored in `van_location_pings` | Write `snapped_lat`/`snapped_lng` per ping | Schema + write change needed |
| OSRM | `snapToRoad()` returns one point for trajectory | Need `matchTrajectory()` returning per-point snapped coords | New function needed |

---

## 2. Canonical Write Logic for `route_run_stops`

**Impact: Medium** — the adjacency walk already exists (lines `437-472` of `infer-stop-progress.ts`) but only affects the return value. Extending it to write back corrections is the main work.

| Aspect | Current State | Spec Requires | Gap |
|---|---|---|---|
| Write approach | Writes passed first, then masks non-contiguous in returned result only | Canonicalize in memory, write only contiguous prefix | Logic rewrite |
| DB cleanup | Non-contiguous `passed` rows persist in DB | Revert stored non-contiguous rows to `pending`, clear `passed_at`/`pass_source`/`pass_confidence` | New cleanup step |
| Pointer persistence | `last_passed_stop_id`/`next_stop_id` set from adjacency walk | Same, but from canonical prefix only | Minor — already close |

---

## 3. Shared Position-Selection Helper (ETA + Passage)

**Impact: Medium** — involves creating a new module, changing `VanPosition`, and updating both `eta.ts` and `infer-stop-progress.ts`.

| Aspect | Current State | Spec Requires | Gap |
|---|---|---|---|
| `effective-position.ts` | Does not exist | New shared helper module | Create new file |
| ETA position | `VanPosition` has `lat`/`lng` (raw only) | Carry `rawLat`/`rawLng` + `snappedLat`/`snappedLng`, use shared helper | `VanPosition` type change + `eta.ts` update |
| Passage position | Per-stop raw-vs-snapped comparison inline in `infer-stop-progress.ts` | Use same shared helper | Extract inline logic |
| Consistency | ETA uses `osrmRoute()` for distance; passage uses haversine with raw/snapped per-stop | Both use same effective position for active stop | Alignment needed |

---

## 4. Source-Aligned Confidence Evidence

**Impact: Low-medium** — the `.limit(50)` removal is trivial, but source-aligned scoring depends on per-ping snapped coords from change #1.

| Aspect | Current State | Spec Requires | Gap |
|---|---|---|---|
| Evidence query cap | `.limit(50)` on recent pings | Remove cap, query full 5-minute window | Remove one line |
| Snapped evidence | Confidence uses raw `lat`/`lng` from `van_location_pings` | Snapped candidates use stored `snapped_lat`/`snapped_lng` per ping | Depends on #1 (per-ping snapped coords) |
| Scoring model | Tiered: raw `0.70–0.90`, snapped `0.65–0.95` | Time-bucketed rule ("2 pings N seconds apart") | Scoring model change |

---

## 5. Orphaned-Shift Health Observability

**Impact: Low** — purely additive extraction + one new field. No schema migration needed.

| Aspect | Current State | Spec Requires | Gap |
|---|---|---|---|
| Orphan detection | Only in `scripts/reconcile-orphaned-shifts.ts` | Extract to shared helper in `src/lib/tracking/orphaned-shift-health.ts` | Extract + reuse |
| `runHealth` field | Not in `RouteProgress` | Add `runHealth: "normal" \| "orphaned"` | Type + `resolve-route-progress` change |
| Read-path surfacing | Not surfaced | `resolveRouteProgress` sets `runHealth` when orphan criteria met | New logic in resolver |
| Reconciliation script | Uses inline criteria (90 min overdue + 30 min inactive) | Reuse shared helper | Refactor |

---

## 6. Missing Test Coverage

| Test File | Current | Spec Requires |
|---|---|---|
| `tracking-batch.test.ts` | Does not exist | New: replay chronological, earlier-ping crossing, per-point snapped |
| `infer-stop-progress.test.ts` | Basic geofence tests | Extend: event-time derivation, shift-at-event-time, canonical write, non-contiguous healing, snapped evidence |
| `eta.test.ts` | ETA calculations | Extend: shared effective-position consistency |
| `resolve-route-progress.test.ts` | Exists | Extend: `runHealth` orphaned/normal |

---

## Schema Change Needed

One migration: add `snapped_lat`/`snapped_lng` to `van_location_pings`. These columns currently exist on the `vans` table (migration `00005`) but not on `van_location_pings`. The spec targets `00010_add_snapped_coords_to_van_location_pings.sql` — but migration `00010` already exists (`00010_drop_seq_column.sql`), so it must be named `00014_*`.

---

## Dependency Order & Risk Assessment

```
#1 Event-time replay  ←── largest change, foundational
    ↓
#2 Canonical writes   ←── depends on #1 (event-time passed_at)
    ↓
#3 Shared position    ←── independent but benefits from #1 snapped coords
    ↓
#4 Confidence model   ←── depends on #1 (per-ping snapped coords)
    ↓
#5 Orphan health      ←── fully independent, can ship anytime
```

**Highest risk:** #1 (event-time replay in batch) — touches the hot ingestion path, changes inference semantics, requires OSRM `matchTrajectory`, and all other changes depend on it.

**Lowest risk:** #5 (orphan health) — purely additive, no write-path changes, can be shipped independently as a quick win.
