# Mid-Route Cold Start — Driver Confirmation on Shift Start

## 1. Problem Statement

When a driver starts a shift mid-route (e.g., 2+ hours after the first scheduled stop), the system shows the wrong next stop. In the observed case (Rota 01, 2026-03-10 at 08:20), the UI displayed CAAB (06:10) as next stop instead of Comércio (08:20) — the stop the van was physically next to.

The system has no mechanism to establish initial position when a driver joins mid-schedule. It relies entirely on geofence matching from GPS pings, which can fail or be delayed.

---

## 2. Root Cause Chain

**Step 1 — All stops seeded as pending.** When the first GPS ping arrives after shift start, `inferStopProgress` (`src/lib/tracking/infer-stop-progress.ts:95-133`) seeds all `route_run_stops` with `status: "pending"`. There is no time-awareness in seeding.

**Step 2 — Geofence near-miss.** The van was 51.2m from Comércio, but the geofence radius is 50m (DB default in `supabase/migrations/00002_live_tracking.sql:21`). The check at `infer-stop-progress.ts:228` (`if (distance > entry.geofence_radius_m) return false`) rejected the match by 1.2m.

**Step 3 — Backfill gate blocked.** The backfill logic (`infer-stop-progress.ts:342-401`) requires `newlyPassedIds.length > 0` — at least one geofence match must exist first. With zero matches, backfill never fires.

**Step 4 — `nextStopId` defaults to first pending stop.** The canonical enforcement (`infer-stop-progress.ts:474-479`) iterates `allStops` and picks the first stop not in the contiguous passed prefix. With an empty prefix (zero passed stops), this is always the chronologically first stop — CAAB (06:10), even at 08:20.

**Result:** The public-facing route API (`resolve-route-progress.ts`) serves `nextStopId` from the persisted pointer when `isRunning === true`, so the UI shows the stale first stop until a geofence eventually fires.

---

## 3. Current Architecture Context

### 3.1 Tracker App (Expo)

The tracker app at `apps/van-tracker/` is a pure GPS ping service. It has three screens (home, settings, diagnostics) and zero route awareness. It does not:

- Call the start/end shift endpoints
- Know about routes, stops, or schedules
- Display any route information

It sends `POST /api/tracking/{vanId}` with GPS coordinates, speed, accuracy, battery level, and network type. Authentication is via `x-ingestion-token` header, not Supabase Auth.

### 3.2 Shift Lifecycle (Web App)

Shift start/end is triggered from the web app's driver dashboard (`src/components/driver/route-card.tsx`), not the tracker app.

- `POST /api/routes/[routeId]/start` → Creates a `route_shifts` record, upserts the `route_run` for today
- `POST /api/routes/[routeId]/end` → Sets `ended_at` on the active shift
- Response shape: `{ shift: { id, runId, driverId, startedAt, endedAt }, run: { id, routeId, serviceDate } }`

The start endpoint does not seed `route_run_stops`. Seeding is deferred to the first GPS ping in `inferStopProgress`.

### 3.3 Multi-Shift Model

- One `route_run` per route per day (unique on `route_id, service_date`)
- Multiple `route_shifts` per `route_run` (different drivers, break periods)
- `route_run_stops` progress is cumulative — passed stops persist across shifts
- Shift-aware gating (`infer-stop-progress.ts:73-93`): GPS pings are silently dropped if no active shift exists at event time

### 3.4 Stop Progression Pipeline

1. GPS ping arrives → `inferStopProgress` called
2. Shift gate check (must have active shift)
3. Seed `route_run_stops` if first time (all pending)
4. Group pending stops by `stop_group_id` or coordinate key
5. For each group: filter by geofence (50m default) + early arrival window (30min)
6. Pick closest-in-time stop per group
7. Score confidence: raw (0.70/0.90), snapped (0.65–0.95)
8. Backfill earlier stops if confidence > 0.7
9. Canonical enforcement: only contiguous passed prefix is valid; heal gaps
10. Persist `last_passed_stop_id`, `next_stop_id`, `progress_updated_at` on `route_run`

### 3.5 Existing Infrastructure for Manual Pass

| Component | Status |
|---|---|
| `pass_source: "manual"` in TypeScript types | Defined at `src/types/index.ts:5`, never used |
| DB `CHECK` constraint includes `"manual"` | `supabase/migrations/00011_stop_confidence_metadata.sql` |
| `pass_confidence` column (0.0–1.0) | Exists on `route_run_stops` |
| Canonical write enforcement | Works with any `pass_source` — validates contiguous prefix regardless |

No migration needed to support manual stop marking.

---

## 4. Previous Discussion (Doc 0030 — Rejected)

`docs/execution/0030-driver-stop-confirmation-discussion.md` previously proposed asking drivers to confirm their current stop. It was rejected as YAGNI because:

- Backfill covers 80%+ of cases
- Extra tap on every start adds friction
- Conflict resolution needed if driver picks wrong stop
- Alternative: silently infer closest stop from GPS

**Why that reasoning was incomplete:** The 0098 scenario proves that silent GPS inference can fail. The van was 1.2m outside the geofence — close enough to see the stop but not close enough to trigger automatic progression. The backfill mechanism is gated behind a geofence match that may not happen for several pings.

---

## 5. Proposed Solution: Guess + Confirm

### 5.1 Concept

Instead of a blind ask (rejected) or silent inference (insufficient), combine both:

1. System guesses the driver's current stop using GPS + schedule time
2. Driver confirms with a single tap, or picks from a short list of alternatives
3. All stops before the confirmed stop are bulk-marked as passed

This eliminates the cold-start gap from second one, with minimal friction (one tap when the guess is right).

### 5.2 Trigger Conditions

Show the confirmation only when **all** of these are true:

- A new shift is being started
- The `route_run` has zero passed stops (true cold start — not a second shift resuming progress)
- Current time is past `first_stop_time + threshold` (e.g., 30+ minutes into the schedule)

Do **NOT** show when:

- Second/third shift of the day (`route_run` already has progress from prior shifts)
- Driver starts on time or early (within threshold of first stop — normal geofence flow is sufficient)
- **No schedule entries have coordinates** — this is the hard bypass. Without coordinates, neither the suggestion algorithm nor the geofence pipeline can operate (geofence matching already skips entries where `stop_lat`/`stop_lng` is null at `infer-stop-progress.ts:136`). Skip confirmation entirely; there is no "current geofence behavior" to fall back to for these entries.

### 5.3 Guessing Algorithm

Inputs available at start time:

- Driver's GPS position (from web app's browser geolocation or most recent van ping)
- Current time (server-side, `America/Bahia`)
- All schedule entries with coordinates for the route

**Two-pass ranking** (filter by proximity, rank by time):

1. **Pass 1 — Proximity filter:** Compute haversine distance from driver GPS to each stop (reuse existing `haversineDistanceMeters`). Keep only stops within 2km. This narrows candidates to geographically plausible stops.
2. **Pass 2 — Time ranking:** Among proximity-filtered candidates, filter to stops where `scheduled_time <= now + 30min` (exclude future stops). Sort by ascending `|now - scheduled_time|` — the stop closest in time to now wins.
3. Top result = suggestion; next 4 = alternatives.

This avoids a weighted formula with unnormalized inputs (distance in meters vs time in minutes). GPS proximity acts as a hard gate, then time disambiguates — which handles same-location stops cleanly (e.g., CAAB at 06:10 vs 17:00).

### 5.4 UI Flow

All in the web app (driver dashboard), zero tracker app changes.

1. Driver taps "Iniciar" on route card
2. Web app calls `POST /api/routes/[routeId]/start`
3. Backend detects cold-start condition and includes suggestion in response:

```json
{
  "shift": { "..." : "..." },
  "run": { "..." : "..." },
  "coldStart": {
    "suggestedStop": { "id": "...", "name": "Comércio (Antigo TRT-5)", "time": "08:20" },
    "alternatives": [
      { "id": "...", "name": "Fórum Ruy Barbosa", "time": "08:35" },
      { "id": "...", "name": "CAAB", "time": "06:10" }
    ]
  }
}
```

4. Web app shows confirmation modal:
   - **Primary:** "Você está em Comércio (08:20)?" with Confirm button
   - **Secondary:** dropdown/list with alternatives if the guess is wrong
   - **Dismiss:** "Pular" to skip confirmation entirely
5. On confirm: `POST /api/routes/[routeId]/confirm-start-stop` with `{ stopId: "..." }`
6. Backend bulk-marks all prior stops as passed with `pass_source: "manual"`, `pass_confidence: 0.85`
7. Updates `route_run.last_passed_stop_id` and `next_stop_id`

### 5.5 API Design

**Enrich existing start endpoint** (no new GET endpoint needed):

`POST /api/routes/[routeId]/start` — Add optional `lat`/`lng` in request body from browser geolocation. If cold-start detected, include `coldStart` object in response.

**New confirmation endpoint:**

`POST /api/routes/[routeId]/confirm-start-stop`

- **Body:** `{ stopId: string }` — the confirmed current stop
- **Auth:** requires driver role + active shift ownership
- **Validation (executed in this order):**
  1. `stopId` must belong to a `schedule_entry` for this route → 400 if not
  2. Driver must have an active shift on this route's run → 403 if not
  3. **Seeding:** If `route_run_stops` do not exist yet (first GPS ping hasn't arrived), seed them now — same logic as `infer-stop-progress.ts:95-133`. This is necessary because today seeding only happens on first GPS ingestion, not on shift start.
  4. **Idempotency (checked before cold-start invariant):** Query current passed stops. If the run's passed stops already match the expected result of confirming this `stopId` (all stops before it are passed with `pass_source: "manual"`), return 200 as a no-op. This must run before step 5 because a successful prior confirm leaves the run with passed stops — which would otherwise trip the cold-start invariant.
  5. **Cold-start invariant:** The run must have zero passed stops. If the run already has progress — from a prior shift, a different confirm, or geofence matches — reject with 409 Conflict. This catches: (a) stale clients calling confirm on a resumed run, (b) a second confirm with a different `stopId`, (c) geofence matches that arrived before the confirm. This mirrors the UI trigger condition (§5.2) but enforced server-side.
- **Action:** marks all stops chronologically before `stopId` as passed with `pass_source: "manual"`, `pass_confidence: 0.85`
- Updates `route_run.next_stop_id` to `stopId` and `last_passed_stop_id` to the stop immediately before it
- Re-runs canonical enforcement (contiguous prefix validation + gap healing) to ensure consistency. This logic currently lives inline in `infer-stop-progress.ts:425-480` — it should be extracted into a shared helper (e.g., `enforceCanonicalPrefix()`) that both `inferStopProgress` and `confirm-start-stop` can call, rather than re-implementing it.
- Returns updated progress

### 5.6 Confidence and Pass Source

- **Pass source:** `"manual"` — already in DB constraint and TypeScript types, never used. Semantically correct: driver manually confirmed position.
- **Confidence:** `0.85` — higher than backfill (0.3–0.7) because the driver explicitly confirmed, but below multi-ping geofence raw (0.90) since it's not GPS-verified per stop.
- The confirmed stop itself is **NOT** marked as passed — it becomes the `next_stop_id`. Only prior stops are marked.

---

## 6. Edge Cases and Interactions

### 6.1 Race Condition: GPS Pings During Confirmation

GPS pings flow immediately after shift start. If `inferStopProgress` runs before the driver confirms, two problems arise:

**Problem A — Guarded UPDATE is insufficient.** Simply adding `AND status='pending'` to the confirm UPDATE avoids overwriting geofence passes, but can create a non-contiguous gap. Example: GPS geofence-matches stop 15 before confirm arrives for stop 10. The confirm marks stops 1–9 as passed (pending → passed), but stop 15 is already passed with a gap (10–14 are pending). The canonical healer at `infer-stop-progress.ts:450` will then revert stop 15 back to pending — discarding a valid geofence match.

**Problem B — Stops may not exist yet.** If confirm arrives before the first GPS ping, `route_run_stops` haven't been seeded. The confirm endpoint must seed them itself (see §5.5).

**Resolution — State-based guard + canonical re-enforcement:**

1. The confirm endpoint checks: do any geofence-based passes (`pass_source IN ('geofence_raw', 'geofence_snapped')`) already exist on the run? If yes → reject with 409 (the geofence system has already produced results; let it handle progression). This is purely state-based — no time window involved. A geofence match at 10 seconds is treated the same as one at 70 seconds.
2. If no geofence passes exist: proceed with the bulk mark, then re-run canonical enforcement (build contiguous prefix, heal any gaps, persist pointers). This ensures the final state is always a valid contiguous prefix.
3. The guarded UPDATE (`AND status='pending'`) is still applied as a safety net, though with the state-based guard it should never encounter a geofence-passed row.

### 6.2 Wrong Confirmation

If the driver confirms the wrong stop (e.g., picks stop 5 but is actually near stop 8):

- Stops 1–4 are marked as passed (manual, 0.85)
- Stop 5 becomes `next_stop_id`
- When geofence eventually matches stop 8, backfill kicks in and marks stops 5–7 as passed
- The contiguous prefix extends naturally — no conflict with canonical enforcement
- Self-correcting within a few pings

### 6.3 Driver Dismisses Confirmation

Falls back to current behavior:

- GPS pings trigger geofence matching
- Backfill covers earlier stops once a match occurs
- Worst case: wrong `nextStopId` shown for a few minutes (the 0098 scenario)
- No data corruption — the confirmation is purely additive

### 6.4 No GPS Available at Start Time

GPS source priority and fallback chain:

0. **Pre-check — Route has no schedule entries with coordinates:** Skip confirmation entirely. This is checked before the chain below. Without coordinates, neither the suggestion algorithm nor the geofence pipeline can evaluate stops (`infer-stop-progress.ts:136` already filters these out). There is nothing to fall back to.
1. **Browser geolocation available:** Use it for the two-pass ranking (proximity filter → time sort). This is the primary path.
2. **No browser geolocation, but fresh van ping exists** (`van_location_pings.received_at >= now - 5 minutes`): Use the van ping coordinates for the same two-pass ranking. Without a freshness limit, the suggestion could be based on yesterday's last position — which may be the depot, not the current location.
3. **No browser geolocation AND no fresh van ping:** Skip the proximity filter (pass 1). Show only time-filtered stops (pass 2: `scheduled_time <= now + 30min`, sorted by `|now - scheduled_time|`), capped at the max alternatives limit (see §10.2). No top suggestion is highlighted — the driver picks from the list.

### 6.5 Multiple Stops at Same Location

Rota 01 has CAAB at both 06:10 and 17:00 (round trip). The time component of the scoring algorithm disambiguates: at 08:20, CAAB (06:10) scores much higher than CAAB (17:00) on time proximity.

The `stop_group_id` mechanism already handles this in geofence matching. The suggestion algorithm should use the same grouping to avoid showing duplicate location names — instead show the time-disambiguated version.

### 6.6 Canonical Write Enforcement Compatibility

Marking stops 1–N as passed via confirmation creates a valid contiguous prefix from route start. The canonical enforcement logic (`infer-stop-progress.ts:432-480`) walks from the first stop and keeps consecutive passed stops. A manually-confirmed prefix is indistinguishable from a geofence-matched prefix — fully compatible.

---

## 7. Scope of Changes

| Component | Change | Files Affected |
|---|---|---|
| Start endpoint | Add optional `lat`/`lng` params, cold-start detection, suggestion in response | `src/app/api/routes/[routeId]/start/route.ts` |
| New endpoint | `confirm-start-stop` — cold-start invariant check, seed stops if needed, bulk mark prior stops, state-based geofence guard, canonical re-enforcement via shared helper, validation + idempotency | New: `src/app/api/routes/[routeId]/confirm-start-stop/route.ts` |
| Suggestion logic | Two-pass ranking: proximity filter (2km) → time sort | New: `src/lib/tracking/suggest-start-stop.ts` |
| Canonical enforcement | Extract shared helper from inline logic in `inferStopProgress` | Refactor: `src/lib/tracking/enforce-canonical-prefix.ts` (extracted from `infer-stop-progress.ts:425-480`) |
| Driver route card | Confirmation modal after start (with dismiss option) | `src/components/driver/route-card.tsx` |
| Tracker app | **None** | — |
| DB migrations | **None** | — |
| Types | **None** (`manual` `pass_source` already defined) | — |

---

## 8. What This Does NOT Solve

- **Geofence near-misses after confirmation:** Once tracking is running, the 50m geofence threshold still applies. The confirmation only fixes the cold-start gap.
- **Incorrect stop coordinates:** If a stop's `stop_lat`/`stop_lng` is wrong, both geofence matching and the suggestion algorithm will be off.
- **Drivers who never open the web app:** If a driver starts the tracker app but never starts a shift via the web app, there's no shift → no stop progression at all (existing issue, not new).

---

## 9. Codex Review — Gaps Identified and Resolutions

### Round 1

External review identified five gaps in the original proposal:

| # | Gap | Resolution | Section |
|---|---|---|---|
| 1 | `confirm-start-stop` assumes `route_run_stops` exist, but they're only seeded on first GPS ping | Confirm endpoint seeds stops itself if missing | §5.5 |
| 2 | Guarded `UPDATE ... AND status='pending'` can leave non-contiguous gaps that the canonical healer then discards | State-based guard + canonical re-enforcement after confirm | §5.5, §6.1 |
| 3 | Scoring formula uses unnormalized inputs (meters vs minutes), making "60/40" weights misleading | Replaced with two-pass approach: proximity filter (2km hard gate) → time sort | §5.3 |
| 4 | Van ping fallback has no freshness limit — could suggest based on stale location | 5-minute freshness limit on `van_location_pings.received_at` | §6.4 |
| 5 | Confirm endpoint lacks `stopId` validation and idempotency | Added: route membership check, active shift check, idempotent re-calls | §5.5 |

### Round 2

Follow-up review identified three remaining gaps:

| # | Gap | Resolution | Section |
|---|---|---|---|
| 6 | Race condition guard was time-based (60s window); a geofence match at 10s creates the same conflict | Changed to state-based: reject if ANY geofence passes exist, regardless of timing | §5.5, §6.1 |
| 7 | No-GPS fallback was internally inconsistent (show list vs skip confirmation) | Clarified into 4-tier fallback chain: browser geo → fresh van ping → time-only list → skip (only when no stop coordinates exist) | §6.4 |
| 8 | Idempotency only defined for same `stopId`; second confirm with different `stopId` was unspecified | Explicitly rejected: same `stopId` = no-op, different `stopId` = 409 Conflict | §5.5 |

### Round 3

Final review confirmed the proposal is internally consistent. Three cleanup items:

| # | Gap | Resolution | Section |
|---|---|---|---|
| 9 | Backend does not enforce the "true cold start only" invariant — stale client or direct API call could mutate a resumed run | Added server-side cold-start check: reject 409 if run already has any passed stops | §5.5 |
| 10 | Scope table still said "staleness guard" but design is now state-based; canonical re-enforcement would need re-implementation | Fixed scope table; explicitly call for extracting shared `enforceCanonicalPrefix()` helper | §5.5, §7 |
| 11 | Time-only fallback (no GPS) could produce unbounded list for late-day starts | Capped at max alternatives limit | §6.4 |

### Round 4

Final review confirmed proposal is internally consistent. Two ordering clarifications:

| # | Gap | Resolution | Section |
|---|---|---|---|
| 12 | Idempotency check and cold-start invariant conflict: after a successful confirm the run has passed stops, so a retry trips the invariant | Rewritten as ordered pipeline: idempotency (step 4) runs before cold-start invariant (step 5) | §5.5 |
| 13 | No-coordinates case overlapped with no-GPS fallback; "fall back to geofence" was misleading since geofence also skips null-coordinate entries | Made no-coordinates a hard pre-check (step 0) that bypasses the entire fallback chain; removed misleading "fall back to geofence" language | §5.2, §6.4 |

---

## 10. Open Design Decisions for Spec

1. **Threshold for "late start":** How many minutes past the first stop triggers the confirmation? (Proposed: 30 minutes)
2. **Max alternatives shown:** How many stops in the fallback list? (Proposed: 5)
3. **Proximity filter radius:** Maximum distance for a stop to be considered a candidate (Proposed: 2km)
4. **Van ping freshness limit:** Maximum age of a van ping to use as GPS fallback (Proposed: 5 minutes)
5. **Confirmation timeout:** Auto-dismiss after N seconds? Or persist until acted on? (Proposed: persist, with dismiss button)
