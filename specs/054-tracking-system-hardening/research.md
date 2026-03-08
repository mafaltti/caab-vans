# Research: Tracking System Hardening

**Date**: 2026-03-08

## R1: Evidence Query Determinism

**Decision**: Remove `limit(50)` and add `order("device_ts", { ascending: false })` to the evidence query. Fetch once before the group loop.

**Rationale**: At typical tracker cadence (~1 ping/5s), a 5-minute window produces ~60 pings. Even at double cadence, ~120 pings is operationally cheap for PostgREST. The arbitrary limit introduces nondeterminism when ping volume exceeds 50, and the missing `order()` makes the returned subset unpredictable.

**Alternatives considered**:
- Keep `limit(50)` with `order()`: deterministic but truncates evidence under load.
- Pre-aggregate evidence during ingestion: correct but over-engineered for current scale (YAGNI).

## R2: Snapped Confidence Scoring Model

**Decision**: Replace the flat 0.8 snapped confidence with a tiered additive model: base 0.65 (raw outside) or 0.85 (raw inside), +0.10 for 2+ confirming pings, +0.05 for snap displacement ≤15m, capped at 0.95.

**Rationale**: The current model gives snapped matches the same confidence regardless of evidence strength. This makes `pass_confidence` unreliable for downstream gating decisions. The tiered model is monotonic (more evidence never lowers score) and uses features already computed in the current code.

**Alternatives considered**:
- Weighted linear score from multiple features: more flexible but introduces tuning complexity without clear benefit (KISS).
- Store snapped coordinates per ping for snapped-history evidence: correct long-term, but requires schema changes (out of scope).

## R3: Overdue ETA Semantics

**Decision**: Add `etaStatus: "estimated" | "overdue" | "none"` to `EtaResult` and `RouteProgress`. When segment or schedule branch predicts arrival ≤ now, return `etaStatus = "overdue"` and `etaNextStopMinutes = null`. GPS branch unchanged.

**Rationale**: `0 min` from a degraded fallback is semantically different from `0 min` from GPS (van actually at stop). Returning `null` with an explicit status lets consumers distinguish the two cases without breaking existing clients that ignore the new field.

**Alternatives considered**:
- Return negative minutes: breaks existing `Math.max(0, ...)` consumers and is unintuitive.
- Fall through from segment to schedule when overdue: both branches clamp to zero, so cascading doesn't help.
- Return a separate `isOverdue` boolean: less expressive than a three-state enum (doesn't cover "no ETA target").

## R4: `includeLastKnown` Wiring

**Decision**: When `includeLastKnown=true` and `isRunning=false` and `progress.nextStopId` resolves to a schedule entry, populate top-level `nextStop` and `currentStopIndex` from progress data. Add `nextStopMode: "live" | "last_known" | null` to the response.

**Rationale**: The resolver already computes last-known data correctly; only the response assembly layer gates on `isRunning`. The fix is localized to the two route endpoint files. Adding `nextStopMode` avoids ambiguity for consumers.

**Alternatives considered**:
- Always populate top-level fields from progress regardless of `includeLastKnown`: breaks backward compatibility for consumers expecting null when not running.
- Move the gating into `resolveRouteProgress`: conflates response assembly with progress resolution.

## R5: Orphaned Shift Reconciliation

**Decision**: Standalone script (`scripts/reconcile-orphaned-shifts.ts`) using Supabase JS client with service-role key. Closes shifts where: `ended_at IS NULL`, past scheduled end by ≥90 min, no activity for ≥30 min. Supports `DRY_RUN=1`.

**Rationale**: Fixing the underlying data (setting `ended_at`) is more honest than pretending closed in read paths. A standalone script follows the existing pattern (e.g., `compute-time-factors.ts`) and avoids adding background workers to the Next.js runtime. External scheduling (cron/systemd) is the supported deployment model.

**Alternatives considered**:
- Modify `deriveRunStatus()` to treat stale shifts as completed: masks the data issue, doesn't unblock next-day shift creation.
- `pg_cron` function: not in the supported stack (no Supabase Edge Functions, no pg_cron).
- Embedded background worker in Next.js: adds runtime complexity and process-local state concerns.

## R6: Script Pattern

**Decision**: Follow the existing script pattern from `scripts/compute-time-factors.ts`:
- Import `createClient` from `@supabase/supabase-js`
- Require `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars
- Exit early with `process.exit(1)` on missing config
- Use `console.log` for structured JSON output
- Run via `npx tsx scripts/reconcile-orphaned-shifts.ts`

**Rationale**: Consistency with existing scripts. No new dependencies needed.

## R7: Schedule Time Handling

**Decision**: Use `schedule_entries.time` (PostgreSQL `time` type, returned as `HH:mm` string by Supabase JS) combined with `route_runs.service_date` and `America/Bahia` timezone to compute the scheduled end timestamp.

**Rationale**: This is how the existing codebase handles schedule times. The last `schedule_entries.time` for a route gives the end of the schedule window. Combined with `service_date`, this produces a full `DateTime` in the canonical timezone.

**Alternatives considered**: None — this is the established pattern.
