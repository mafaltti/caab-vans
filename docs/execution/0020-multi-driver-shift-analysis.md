# Multi-Driver Shift Analysis

## Problem Statement

In CAAB, a van has **at least two drivers** — one per shift. Additionally, a driver may be replaced on any given day (e.g., health issues). The current implementation assumes **one driver per van** with a single start/end lifecycle per day, meaning:

1. When Driver A ends their shift (taps "Encerrar Rota"), the route is marked `completed` for the **entire day**.
2. Driver B cannot start the same route again — the system blocks it with `409 CONFLICT` ("Route already started today").
3. The public portal shows "Rota encerrada por hoje" even though a second shift is coming.

This is fundamentally broken for multi-shift operations.

---

## Current State Analysis

### Data Model (as-is)

```
vans
  └── driver_id (uuid, nullable) → single driver assignment

route_runs
  ├── route_id + service_date (UNIQUE) → ONE run per route per day
  ├── started_at (timestamptz, nullable)
  └── ended_at (timestamptz, nullable)
```

**Key constraints that break multi-shift:**
- `vans.driver_id` — only one driver can be assigned at a time.
- `route_runs` UNIQUE on `(route_id, service_date)` — only one run per day, so ending a run means the route is done for the day.
- `deriveRunStatus()` — once `ended_at` is set, status is `completed` permanently.

### API (as-is)

- `POST /api/routes/[routeId]/start` — checks `existingRun?.started_at` and returns `409` if already set. Cannot re-start.
- `POST /api/routes/[routeId]/end` — sets `ended_at` and returns `completed`. Final, no undo.
- `GET /api/driver/routes` — queries `vans.driver_id = auth.user.id` to find the driver's van, then loads routes. Only one driver per van.
- `GET /api/routes/[routeId]` (public) — derives `runStatus` from the single run row. Once completed, it stays completed.

### UI (as-is)

- **Admin "Edit van"** — a single "Motorista" dropdown (one driver per van).
- **Driver page** — shows "Encerrada" badge once ended, with start/end times. No way to re-start.
- **Public route detail** — shows "Rota encerrada por hoje" once the run is completed.

---

## Core Conceptual Gap

The current model conflates **"driver shift"** with **"route day"**:

| Concept | Current Model | Real World |
|---------|---------------|------------|
| A route's daily operation | 1 run per day | May span multiple shifts |
| A driver's work period | = the run itself | A shift within the day |
| Ending work | = route done for the day | Only this shift is done |
| Driver assignment | 1 driver per van (always) | Multiple drivers rotate |

The fix requires **separating the concepts of "shift" and "daily route operation"**.

---

## Proposed Approach: Shift-Based Model

### New Entity: `route_shifts`

Instead of `started_at`/`ended_at` on `route_runs`, introduce a **shifts** table:

```
route_shifts
  ├── id (PK, uuid)
  ├── run_id → route_runs(id)
  ├── driver_id → auth.users(id)
  ├── started_at (timestamptz, NOT NULL)
  ├── ended_at (timestamptz, nullable)
  └── created_at
```

- A `route_run` still represents **one route on one day** (keeps UNIQUE on `route_id + service_date`).
- A `route_shift` represents **one driver's working period** within that day.
- Multiple shifts per run are allowed (Driver A morning, Driver B afternoon).

### Updated `route_runs`

Remove `started_at`/`ended_at` from `route_runs` (or deprecate). The run's status is now **derived from its shifts**:

| Shifts state | Derived run status |
|---|---|
| No shifts | `waiting` |
| Any shift with `ended_at = NULL` | `in_progress` |
| All shifts ended, no active shift | `idle` (between shifts) |
| At least one shift exists, all ended, past schedule window | `completed` |

The key new status is **`idle`** — the route is not done for the day, but the current driver has ended their shift and the next driver hasn't started yet.

### Updated `vans` Driver Assignment

Two options:

**Option A — Keep single `driver_id`, swap it when shifts change:**
- Simpler migration. Admin or superuser reassigns `vans.driver_id` when drivers swap.
- The "current driver" is always whoever `driver_id` points to.
- Downside: requires admin intervention at every shift change, or a self-service swap mechanism.

**Option B — Van has multiple drivers (join table):**
```
van_drivers
  ├── van_id → vans(id)
  ├── driver_id → auth.users(id)
  ├── is_primary (boolean)
  └── UNIQUE(van_id, driver_id)
```
- All assigned drivers can see the van's route on their driver page.
- Any assigned driver can start a new shift (if no active shift exists).
- Admin assigns multiple drivers to a van ahead of time; no daily intervention needed.
- Downside: more schema and UI changes.

**Recommendation: Option B** — it matches the real-world model (multiple drivers per van, pre-assigned) and avoids daily admin work. However, **Option A could be a simpler first step** if we want incremental delivery.

---

## Impact on Existing Features

### Start Route Flow

**Before:** Creates/updates a single `route_run` with `started_at`.
**After:** Creates a `route_shift` row linked to the existing `route_run`. The run row is created if needed (upsert), but `started_at`/`ended_at` move to the shift.

**Validation changes:**
- Instead of "route already started today" → check "is there an **active shift** (no `ended_at`) on this run?"
- A driver can start a new shift as long as no other shift is currently active.

### End Route Flow

**Before:** Sets `ended_at` on the run → route is `completed` for the day.
**After:** Sets `ended_at` on the **current shift** → shift is done, but another driver can start a new shift.

### Public Portal

**Before:** `completed` = "Rota encerrada por hoje".
**After:** Need to distinguish:
- `idle` (between shifts) → "Aguardando próximo turno" or similar.
- `completed` (past schedule window, all shifts ended) → "Rota encerrada por hoje".

### Driver Page

**Before:** One driver sees their van's route.
**After (Option B):** Multiple drivers can see the same van's route. Each sees the route status and can start/end their own shift. A driver sees their shift history for today.

### GPS Tracking / ETA

- GPS pings continue to be ingested regardless of shift state (existing behavior, unchanged).
- ETA computation uses `startedAt` from the **current active shift** (or the most recent shift's start) for stop filtering.

### Admin UI

**Before:** Single "Motorista" dropdown on van edit.
**After (Option B):** Multi-driver assignment UI (add/remove drivers from a van).

---

## Migration Strategy

### Phase 1 — Minimum viable multi-shift (keep `driver_id` on vans)
1. Add `route_shifts` table.
2. Migrate existing `started_at`/`ended_at` from `route_runs` to `route_shifts`.
3. Update start/end API to create shifts instead of updating run timestamps.
4. Update `deriveRunStatus` to read from shifts.
5. Keep single `driver_id` on vans — admin swaps manually between shifts.

### Phase 2 — Multi-driver assignment
1. Add `van_drivers` join table.
2. Update admin UI for multi-driver assignment.
3. Update driver page to use `van_drivers` for route discovery.
4. Update authorization to allow any assigned driver to operate.

---

## Decisions (confirmed with stakeholder)

1. **Shift overlap:** No overlap allowed. One driver must end their shift before the next can start.
2. **Public portal between shifts:** Show schedule only — hide live tracking info, neutral state with no status banner. Passengers don't need to know about shifts.
3. **Driver assignment:** Multiple drivers pre-assigned to a van. Any assigned driver can start a shift when no active shift exists. No daily admin intervention needed.
4. **Maximum shifts per day:** Unlimited. No hard cap — supports standard 2-shift pattern, replacements, and any edge cases.
