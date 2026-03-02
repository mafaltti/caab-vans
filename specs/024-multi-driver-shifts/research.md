# Research: Multi-Driver Shift Support

## Migration Patterns

**Decision**: Follow existing migration convention — `00004_multi_driver_shifts.sql` with sequential numbering.

**Rationale**: Migrations 00001–00003 use consistent patterns: section comments, UUID PKs with `gen_random_uuid()`, FKs with `ON DELETE CASCADE`, `created_at`/`updated_at` with `DEFAULT now()`, and RLS enabled with no policies (service role only in BFF).

**Alternatives considered**:
- Separate migrations for schema + data: Rejected — single migration is simpler and matches the project's additive style.

## ETA Computation

**Decision**: Pass `startedAt` from the active `route_shifts` row instead of `route_runs.started_at`. The `computeEta()` function signature stays the same.

**Rationale**: The `startedAt` parameter in `computeEta()` is used solely as a time floor for stop filtering (`stops with time >= startedAt`). The source changes from `route_runs.started_at` to `route_shifts.started_at`, but the logic is identical.

**Alternatives considered**:
- Passing full shift history to ETA: Rejected — only the current shift's start time matters for "which stops are relevant now."

## Driver Authorization

**Decision**: Replace `vans.driver_id = auth.user.id` check with `van_drivers` join table lookup.

**Rationale**: The existing pattern validates driver ownership at the API layer using Supabase service role. The change is mechanical — instead of `WHERE driver_id = :userId`, query `van_drivers WHERE van_id = :vanId AND driver_id = :userId`.

**Alternatives considered**:
- RLS policies for driver access: Rejected — all tracking tables use service role with no RLS policies. Adding driver-specific RLS would break the established pattern.

## Admin Van API

**Decision**: Replace single `driverId` field with `driverIds` array. Full-replace semantics on update (send all drivers, system replaces the set).

**Rationale**: The existing PUT endpoint uses Zod validation and Supabase Auth admin API to validate drivers. The same validation pattern works for an array — validate each ID, then delete/insert into `van_drivers`.

**Alternatives considered**:
- Add/remove individual drivers (PATCH-style): Rejected — full replace is simpler, matches existing update patterns, and avoids complex delta logic.

## Public Portal Between Shifts

**Decision**: When no shift is active but schedule window is open, `progress` is `null`. The UI interprets null progress as "schedule-only view."

**Rationale**: The existing UI already handles `progress: null` (no run exists). Between-shifts is conceptually the same — no active tracking data.

**Alternatives considered**:
- New explicit "idle" status in progress block: Rejected — would require new UI states. Null progress already produces the correct neutral view.

## Type System

**Decision**: Manual TypeScript types in `src/types/index.ts` — no auto-generated Supabase types.

**Rationale**: The project has no `database.types.ts` or Supabase type generation. All types are manually defined.

## Van Form Component

**Decision**: Replace single driver Select with multi-select UI for driver assignment.

**Rationale**: The existing `van-form.tsx` fetches active drivers and renders a Select dropdown. The change replaces the single Select with a multi-select pattern (checkboxes or tag-based input).

**Alternatives considered**:
- Separate driver management page: Rejected — keeping it in the van edit form matches existing UX patterns and is simpler.
