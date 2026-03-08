# Research: Gate Stop-Progress Inference by Active Shift

## R1: `route_shifts` Table Schema

**Decision**: Use existing `route_shifts` table — no schema changes needed.

**Rationale**: The table already has the exact structure needed for the shift gate check.

**Schema** (from `supabase/migrations/00004_multi_driver_shifts.sql`):
```sql
CREATE TABLE route_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES route_runs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_route_shifts_run ON route_shifts (run_id, started_at);
```

**Key fact**: `ended_at` is nullable — NULL means active shift.

## R2: Active Shift Check Pattern

**Decision**: Query `route_shifts` for `run_id = X AND ended_at IS NULL`, limit 1.

**Rationale**: This is the exact pattern already used by:
- Start endpoint (`src/app/api/routes/[routeId]/start/route.ts`, line 82–87): checks for active shift before allowing a new one.
- End endpoint (`src/app/api/routes/[routeId]/end/route.ts`, line 47–53): finds the active shift to close.
- `deriveRunStatus()` (`src/lib/tracking/run-status.ts`): `shifts.some(s => s.ended_at === null)` → `"in_progress"`.

**Alternatives considered**:
- Using `deriveRunStatus()` in `inferStopProgress`: Rejected — requires fetching all shifts + schedule window. The function only needs to know "is there an active shift?", not the full run status.
- Adding a `is_active` boolean column: Rejected — YAGNI, `ended_at IS NULL` is the canonical check.

## R3: Where to Place the Gate

**Decision**: Insert shift check after `route_runs` upsert (line 62) and before stop seeding (line 64).

**Rationale**: Per the detailed analysis (0075), both seeding and marking should be gated. The `route_run` auto-creation stays (FR-003) because the shift start endpoint references `run_id`. The gate returns `EMPTY_PROGRESS` immediately if no active shift exists.

**Code location**: `src/lib/tracking/infer-stop-progress.ts`, after line 62.

## R4: Call Sites and Return Value

**Decision**: No changes needed at call sites.

**Rationale**: Both callers (`tracking/[vanId]/route.ts` line 197, `tracking-batch/[vanId]/route.ts` line 183) ignore the return value — `inferStopProgress` is called for side effects only. Returning `EMPTY_PROGRESS` early is transparent to callers.

## R5: Testing Approach

**Decision**: Add test cases to existing `src/__tests__/tracking/infer-stop-progress.test.ts`.

**Rationale**: Comprehensive test suite already exists (20+ cases) with a `createMockSupabase()` factory. The mock needs to be extended to support `route_shifts` table queries. Framework is Vitest with global APIs.

**Test cases needed**:
1. No active shift → returns `EMPTY_PROGRESS`, no stops seeded or marked.
2. Active shift (ended_at = null) → existing behavior preserved.
3. Ended shift (ended_at set) → returns `EMPTY_PROGRESS`.

## R6: Performance Impact

**Decision**: Acceptable — 1 additional lightweight query per ping.

**Rationale**: The query is `SELECT id FROM route_shifts WHERE run_id = X AND ended_at IS NULL LIMIT 1`. Indexed by `idx_route_shifts_run(run_id, started_at)`. Expected row count per run: 0–3. Sub-millisecond execution.
