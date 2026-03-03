# Multi-Driver Shift Feature: Codebase Research

**Date:** March 2, 2026
**Status:** Research Complete
**Output:** Comprehensive analysis of existing patterns to inform shift design

---

## 1. Migration Patterns Analysis

**Files Reviewed:**
- `supabase/migrations/00001_initial_schema.sql`
- `supabase/migrations/00002_live_tracking.sql`
- `supabase/migrations/00003_start_route.sql`

### Naming & Structure Convention

```
NNNNN_description.sql
```
- Sequential numbering with leading zeros (00001, 00002, 00003...)
- Descriptive names indicating change type
- Predictable ordering by filename

### SQL Organization Pattern

```sql
-- Extensions (if needed)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table definitions (grouped with inline comments)
CREATE TABLE tablename (
  -- columns with explicit types
);

-- Indexes for queries
CREATE INDEX idx_name ON table(...);

-- Triggers (reusing functions)
CREATE TRIGGER trg_table_updated_at ...;

-- RLS policies
ALTER TABLE table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy_name" ON table ...;

-- Comments explaining security/rationale
```

### Key Technical Patterns

**Column Additions (migration 00002):**
- Uses `ALTER TABLE` for related GPS columns
- Explicit types, no DEFAULT for historical data
- Groups semantically related columns

**Table Creation:**
- UUID PKs: `DEFAULT gen_random_uuid()`
- Foreign keys: `ON DELETE CASCADE` (explicit)
- Timestamps: `created_at`, `updated_at` (NOT NULL, DEFAULT now())
- Reusable trigger: `set_updated_at()` function defined once, used many times

**Data Handling:**
- Migrations 00001-00003 are purely additive (no data transformation)
- RLS enabled early (00001 for public, 00002 for tracking)

### Migration Decision for Shifts

**Recommendation:** Create new `van_shifts` table (migration 00004)

**Rationale:**
1. **Temporal assignment vs van property:** Shifts come and go; they're not inherent to the van
2. **Clear separation:** Routes describe "what", vans describe "where", shifts describe "who for how long"
3. **Query patterns:** "Find all shifts for driver X on date Y" is natural; "find all drivers who worked van X" is cleaner with junction table
4. **Extensibility:** One-off column additions to vans (driver_id) don't scale to multiple drivers

**Schema sketch:**
```sql
CREATE TABLE van_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  van_id uuid NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL, -- Supabase auth.users reference
  shift_date date NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, shift_date, driver_id)
);

CREATE INDEX idx_van_shifts_van_driver ON van_shifts (van_id, driver_id, shift_date);
CREATE INDEX idx_van_shifts_driver_date ON van_shifts (driver_id, shift_date);
CREATE TRIGGER trg_van_shifts_updated_at BEFORE UPDATE ON van_shifts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE van_shifts ENABLE ROW LEVEL SECURITY;
```

**Alternative rejected:** Extend `route_runs` with driver_id
- Route-centric design: one run per route per day
- Unclear semantics for mid-shift driver changes
- Less flexible for historical/future queries

---

## 2. Authorization Pattern (Start/End Route)

**Files Reviewed:**
- `src/app/api/routes/[routeId]/start/route.ts`
- `src/app/api/routes/[routeId]/end/route.ts`

### Current Driver Authorization Flow

```typescript
// 1. Require authentication
const auth = await requireAuth(); // Returns { user: { id }, role }
if (auth.role !== "driver") {
  return apiError("FORBIDDEN", "Driver access required", 403);
}

// 2. Query route with van
const { data: route } = await supabase
  .from("routes")
  .select("id, van:vans!inner(id, driver_id)")
  .eq("id", routeId)
  .single();

// 3. Validate driver matches van.driver_id
const van = route.van as { id: string; driver_id: string | null };
if (van.driver_id !== auth.user.id) {
  return apiError("FORBIDDEN", "You are not assigned to this route's van", 403);
}

// 4. Proceed with business logic
```

### Start Route Logic Details

```typescript
// Find route_run for today (service_date)
const { data: existingRun } = await supabase
  .from("route_runs")
  .select("id, started_at, ended_at")
  .eq("route_id", routeId)
  .eq("service_date", serviceDate)
  .single();

// If run exists, update started_at; else create new
if (existingRun) {
  // Update (created by GPS pings but not yet started)
  await supabase.from("route_runs").update({ started_at: now }).eq("id", existingRun.id);
} else {
  // Create new
  await supabase.from("route_runs").insert({
    route_id: routeId,
    service_date: serviceDate,
    started_at: now,
  });
}
```

**Key insight:** Route runs can be pre-created by GPS ingestion; start endpoint just sets `started_at`

### End Route Logic

```typescript
// Find route_run for today
const { data: run } = await supabase
  .from("route_runs")
  .select("id, started_at, ended_at")
  .eq("route_id", routeId)
  .eq("service_date", serviceDate)
  .single();

// Validate it exists and was started
if (!run || !run.started_at) {
  return apiError("NOT_FOUND", "No active run found for today", 404);
}

// Update ended_at
await supabase.from("route_runs").update({ ended_at: now }).eq("id", run.id);
```

### Authorization Decision for Shifts

**Chosen approach:** Query `van_shifts` for driver validation

```typescript
const auth = await requireAuth();
if (auth.role !== "driver") return error;

const { data: shift } = await supabase
  .from("van_shifts")
  .select("id, started_at, ended_at")
  .eq("route_id", routeId)
  .eq("shift_date", serviceDate)
  .eq("driver_id", auth.user.id)
  .single();

if (!shift) {
  return apiError("FORBIDDEN", "No shift assigned for today", 403);
}
```

**Rationale:**
1. Replaces single equality check with query (more flexible)
2. Same authorization pattern (query, validate, proceed)
3. Supports multiple drivers per day
4. Easy to add RLS later: `USING (driver_id = auth.uid())`
5. No changes to route_run logic—shifts are separate concern

**Future evolution:** Can add RLS policies on `van_shifts` when driver APIs become client-facing

---

## 3. Admin Van API Authorization Pattern

**Files Reviewed:**
- `src/app/api/admin/vans/route.ts` (list, create)
- `src/app/api/admin/vans/[vanId]/route.ts` (update, delete)

### Van Update Pattern

```typescript
const updateVanSchema = z.object({
  name: z.string().optional(),
  regenerateToken: z.boolean().optional(),
  driverId: z.string().uuid().nullable().optional(),
});

// Validation step
if (parsed.data.driverId) {
  const { data: driver } = await supabase.auth.admin.getUserById(parsed.data.driverId);
  if (
    !driver?.user ||
    driver.user.app_metadata?.role !== "driver" ||
    driver.user.app_metadata?.is_active === false
  ) {
    return apiError("VALIDATION_ERROR", "Driver not found or not a driver", 400);
  }
}

// Persistence
const updates: Record<string, unknown> = {};
if (parsed.data.driverId !== undefined) {
  updates.driver_id = parsed.data.driverId;
}
await supabase.from("vans").update(updates).eq("id", vanId);
```

**Pattern:** Validates via `supabase.auth.admin.getUserById()` (not DB query)

### Decision: Keep Van API Unchanged

**Chosen:** Do NOT remove `vans.driver_id`

**Rationale:**
1. **Backward compatibility:** Existing admin UI depends on it
2. **Primary driver:** Single driver can still be set (fallback if no shift)
3. **Easy migration:** Systems can read from van first, then shifts
4. **Gradual adoption:** Don't force all code to update at once

**Evolution path:**
1. Add `van_shifts` table in parallel
2. Start creating shifts alongside van assignments
3. Eventually deprecate van.driver_id (but not immediately)
4. New admin UI uses shifts; old UI still works via fallback

---

## 4. Admin Van Form Component

**File Reviewed:** `src/components/admin/van-form.tsx`

### Current Implementation

```typescript
type VanFormProps = {
  defaultValues?: { name: string; driverId?: string | null };
  onSubmit: (data: { name: string; driverId?: string | null }) => Promise<void>;
  showDriverSelect?: boolean;
};

// Conditional driver list loading
const [drivers, setDrivers] = useState<DriverOption[]>([]);
useEffect(() => {
  if (!showDriverSelect) return; // Skip if not needed
  fetchWithAuth("/api/admin/users")
    .then(res => res.json())
    .then(data => {
      const driverUsers = (data.users ?? [])
        .filter(u => u.role === "driver" && u.isActive);
      setDrivers(driverUsers.map(u => ({ id: u.id, email: u.email })));
    });
}, [showDriverSelect]);

// Select component uses null sentinel
<Select value={driverId ?? "__none__"} onValueChange={...}>
  <SelectItem value="__none__">Nenhum</SelectItem>
  {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.email}</SelectItem>)}
</Select>
```

**Pattern:**
- Prop-based control (`showDriverSelect`)
- Lazy load from `/api/admin/users`
- Null sentinel `"__none__"` for unassigned state
- Form submission only includes driverId if showDriverSelect=true

### Decision: Create Separate Shift Components

**NOT modifying van-form.tsx.** Instead:

1. **New component:** `<ShiftAssignmentForm />` or `<VanShiftManager />`
   - Date picker for shift_date
   - Driver dropdown (same pattern as van-form)
   - Start/end time fields (optional until actually needed)
   - Save/cancel buttons

2. **Use separate modal/drawer:**
   - "Manage Shifts" button on van detail page
   - Opens modal with shift list + "Add Shift" form
   - Allows multiple shifts per day (sequential drivers)

3. **Keep van-form as-is:**
   - Name + token regeneration only
   - No driver select (that moves to shifts)

**Rationale:**
1. **KISS principle:** van-form works; don't add scope creep
2. **Separation of concerns:** Van metadata vs driver assignments are orthogonal
3. **UI clarity:** Shift management is temporal; van is static
4. **Future flexibility:** Shift form can have its own validation, warnings ("driver already has shift at this time")

---

## 5. Public Route Detail: Status Computation

**File Reviewed:** `src/app/api/routes/[routeId]/route.ts`

### Schedule Status Derivation

```typescript
let scheduleStatus: ScheduleStatus = "not_started";
if (times.length > 0) {
  const sorted = [...times].sort();
  const lastTime = sorted[sorted.length - 1];
  if (now.toFormat("HH:mm") > lastTime) {
    scheduleStatus = "ended";
  } else if (isWithinScheduleWindow(times, now)) {
    scheduleStatus = "active";
  }
}
```

**States:**
- `not_started` (default): before first stop or no schedule
- `active`: within schedule window (first stop <= now <= last stop)
- `ended`: now > last scheduled stop

### Run Status Derivation (from `deriveRunStatus`)

```typescript
export function deriveRunStatus(
  startedAt: string | null,
  endedAt: string | null,
): RunStatus {
  if (endedAt) return "completed";
  if (startedAt) return "in_progress";
  return "waiting";
}
```

**States:**
- `waiting`: route_run doesn't exist or started_at is null
- `in_progress`: started_at is set, ended_at is null
- `completed`: ended_at is set

### ETA Computation Flow

```typescript
// Find route_run for today
const { data: runData } = await supabase
  .from("route_runs")
  .select("id, started_at, ended_at")
  .eq("route_id", route.id)
  .eq("service_date", serviceDate)
  .single();

if (runData) {
  // Fetch run's stops
  const { data: runStops } = await supabase
    .from("route_run_stops")
    .select("schedule_entry_id, status, passed_at, schedule_entries!inner(time)")
    .eq("run_id", runData.id);

  // Compute ETA using route_run.started_at as time floor
  const etaResult = computeEta({
    stops: runStops.map(...),
    now,
    vanPosition,
    startedAt: runData.started_at,  // <-- Key parameter
  });
}
```

### Decision: Use Shift's startedAt (with Route Run Fallback)

**Change required:**

```typescript
// Query for active shift today
const { data: shift } = await supabase
  .from("van_shifts")
  .select("id, started_at, ended_at")
  .eq("route_id", route.id)
  .eq("shift_date", serviceDate)
  .not("started_at", "is", null)   // Find started shifts
  .is("ended_at", null)            // That haven't ended
  .single();

// Use shift's startedAt if exists, else fallback to route_run.started_at
const startedAtForEta = shift?.started_at || runData?.started_at;

const etaResult = computeEta({
  stops: runStops,
  now,
  vanPosition,
  startedAt: startedAtForEta,
});
```

**Rationale:**
1. **Semantic correctness:** ETA's time floor should be when THIS SHIFT started, not when route was first run
2. **Backward compatible:** Falls back to route_run if no shift (transition period)
3. **No function changes:** computeEta signature stays same

---

## 6. Driver Route Discovery

**File Reviewed:** `src/app/api/driver/routes/route.ts`

### Current Implementation

```typescript
// Step 1: Require driver auth
const auth = await requireAuth();
if (auth.role !== "driver") return error;

// Step 2: Find vans assigned to this driver
const { data: vans } = await supabase
  .from("vans")
  .select("id, name")
  .eq("driver_id", auth.user.id);

// Step 3: Find routes for those vans
const { data: routes } = await supabase
  .from("routes")
  .select("id, name, van_id, schedule_entries(id, time)")
  .in("van_id", vanIds);

// Step 4: Find route_runs for today
const { data: runs } = await supabase
  .from("route_runs")
  .select("id, route_id, service_date, started_at, ended_at")
  .in("route_id", routeIds)
  .eq("service_date", serviceDate);

// Step 5: Correlate in client (Map)
const runByRoute = new Map((runs ?? []).map(r => [r.route_id, r]));

const result = routes.map(route => ({
  id: route.id,
  name: route.name,
  vanName: vanMap.get(route.van_id) ?? "",
  totalStops: entries.length,
  firstStopTime: ...,
  lastStopTime: ...,
  run: runByRoute.get(route.id) || null,
}));
```

**Pattern:** Multi-query with client-side correlation via Map

### Decision: Shift-First Route Discovery

**New pattern:**

```typescript
// Step 1: Require driver auth (same)
const auth = await requireAuth();
if (auth.role !== "driver") return error;

// Step 2: Find all shifts for this driver today
const { data: shifts } = await supabase
  .from("van_shifts")
  .select("id, route_id, van_id, driver_id, shift_date, started_at, ended_at")
  .eq("driver_id", auth.user.id)
  .eq("shift_date", serviceDate);

if (!shifts || shifts.length === 0) {
  return NextResponse.json({ routes: [], serverTime: formatTime(now) });
}

// Step 3: For each shift, fetch route + schedule
const routeIds = shifts.map(s => s.route_id);
const { data: routes } = await supabase
  .from("routes")
  .select("id, name, van_id, schedule_entries(id, time)")
  .in("id", routeIds);

// Step 4: Find route_runs for today (or derive from shifts?)
const { data: runs } = await supabase
  .from("route_runs")
  .select("id, route_id, service_date, started_at, ended_at")
  .in("route_id", routeIds)
  .eq("service_date", serviceDate);

// Step 5: Correlate (shift map, run map)
const shiftByRoute = new Map(shifts.map(s => [s.route_id, s]));
const runByRoute = new Map((runs ?? []).map(r => [r.route_id, r]));

const result = routes.map(route => {
  const shift = shiftByRoute.get(route.id);
  const run = runByRoute.get(route.id);
  return {
    id: route.id,
    name: route.name,
    vanName: ...,
    totalStops: entries.length,
    firstStopTime: ...,
    lastStopTime: ...,
    shift: shift ? {
      id: shift.id,
      driverId: shift.driver_id,
      startedAt: shift.started_at,
      endedAt: shift.ended_at,
    } : null,
    run: run ? { ... } : null,
  };
});
```

**Rationale:**
1. **Direct relationship:** Shifts → routes (no van indirection)
2. **Temporal awareness:** Shift includes started_at/ended_at
3. **Clear intent:** "My shifts for today" is explicit
4. **Future extensibility:** Easy to add filters (past shifts, upcoming shifts, etc.)
5. **Fallback option:** Can still query vans.driver_id if no shifts found (migration path)

---

## 7. ETA Computation Function

**File Reviewed:** `src/lib/tracking/eta.ts`

### Function Signature & Stop Filtering

```typescript
export function computeEta(args: {
  stops: Stop[];
  now: DateTime;
  vanPosition?: VanPosition | null;
  startedAt?: string | null;
}): EtaResult

// Stop filtering logic
const timeFloor = startedAt
  ? DateTime.fromISO(startedAt).setZone(now.zone).toFormat("HH:mm")
  : now.toFormat("HH:mm");
const futurePending = pending.filter((s) => s.time >= timeFloor);
```

**Purpose:** `startedAt` acts as lower bound for "future" stops
- If shift starts at 10:00, stops at 09:30, 09:45, 10:00 → only 10:00 is "future"
- Fallback: uses current time if startedAt not provided

### GPS vs Schedule Logic

**GPS branch** (when all conditions met):
- vanPosition exists AND has coordinates AND speed >= 1.0 m/s AND location age < 5 minutes
- Uses haversine distance + road factor (1.3)
- Computes distance-to-speed ETA

**Schedule branch** (fallback):
- Uses last-passed stop's actual vs scheduled time
- Applies delay to next stop's scheduled time

### Decision: NO Changes to ETA Computation Function

**Recommendation:** Keep function signature and logic exactly as-is

**Implementation in BFF:**
```typescript
// In route list/detail endpoints:
const etaResult = computeEta({
  stops: runStops.map(...),
  now,
  vanPosition,
  startedAt: shift?.started_at || runData?.started_at,
  //        ^^^ Pass shift's startedAt if available
});
```

**Rationale:**
1. **Function is stable:** Logic works for any startedAt source
2. **Minimal change scope:** Just change where startedAt comes from
3. **Backward compatible:** Fallback to route_run.started_at if no shift
4. **Single responsibility:** Don't add shift-awareness to ETA function

---

## 8. TypeScript Types

**File Reviewed:** `src/types/index.ts`

### Current Van Type

```typescript
export type Van = {
  id: string;
  name: string;
  driver_id: string | null;  // Single driver, can be null
  location_url: string | null;
  location_updated_at: string | null;
  ingestion_token: string;
  last_lat: number | null;
  last_lng: number | null;
  last_accuracy_m: number | null;
  last_speed_mps: number | null;
  last_heading_deg: number | null;
  created_at: string;
  updated_at: string;
};
```

### Current Route Run Type

```typescript
export type RouteRun = {
  id: string;
  route_id: string;
  service_date: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};
```

### Decision: Add VanShift Type

**Add to `src/types/index.ts`:**

```typescript
// Database entity
export type VanShift = {
  id: string;
  route_id: string;
  van_id: string;
  driver_id: string;
  shift_date: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

// API response (camelCase)
export type VanShiftResponse = {
  id: string;
  routeId: string;
  vanId: string;
  driverId: string;
  shiftDate: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

**Rationale:**
1. Mirrors existing Van/RouteRun type structure
2. Clear naming (matches DB schema)
3. Nullable startedAt/endedAt (for incomplete shifts)
4. Separate Response type follows project convention

---

## Summary: Architecture Decisions

| Area | Current State | Recommended Change | Rationale |
|------|---------------|-------------------|-----------|
| **Migrations** | Additive columns (van.driver_id) | New `van_shifts` table | Temporal assignment, not van property |
| **Start/End Route** | Validate `van.driver_id === auth.id` | Query `van_shifts` | Supports multi-driver, same pattern |
| **Admin Van API** | Single driverId in van record | Keep van.driver_id, add shifts separately | Backward compat, gradual migration |
| **Admin Van Form** | Single driver select | Keep as-is, create separate shift form | Separation of concerns |
| **Route Detail Status** | Use `route_run.started_at` | Use `shift.started_at` with fallback | Correct temporal floor for ETA |
| **Driver Route Discovery** | Vans → routes | Shifts → routes | Direct relationship, temporal awareness |
| **ETA Computation** | Accept startedAt param | No changes | Stable function, just change source |
| **Types** | Manual Van/RouteRun/RouteRunStop | Add VanShift type | Consistency, mirrors existing pattern |

---

## Implementation Roadmap

### Phase 1: Schema & Core API (Week 1)
1. `00004_van_shifts.sql` migration
2. Update types: add VanShift, VanShiftResponse
3. Add RLS policy (enable on table, leave empty for now)

### Phase 2: Driver APIs (Week 2)
1. Update `/api/routes/[routeId]/start` to query `van_shifts`
2. Update `/api/routes/[routeId]/end` to query `van_shifts`
3. Update `/api/driver/routes` to query `van_shifts`

### Phase 3: Admin APIs (Week 3)
1. Create `/api/admin/shifts` endpoints (GET, POST, PUT, DELETE)
2. Create `/api/admin/shifts/[shiftId]` endpoints

### Phase 4: Admin UI (Week 4)
1. Create `<ShiftAssignmentForm />` component
2. Add shift manager modal to van detail page
3. Update van list to show shifts

### Phase 5: Migration & Testing (Week 5)
1. Backfill van_shifts from existing van.driver_id assignments
2. Integration tests for all new endpoints
3. End-to-end tests in staging

---

## Open Questions / Future Decisions

1. **Should vans.driver_id be deprecated immediately or gradually?**
   - Recommendation: Gradual (6-8 week transition period)
   - Keep it for backward compat, document as "legacy"

2. **Should shifts have explicit start/end times or inherit from schedule?**
   - Recommendation: Explicit nullable times (started_at/ended_at set by driver action)
   - Allows flexibility (driver might take break during shift, etc.)

3. **Should RLS be added for driver-gated queries?**
   - Recommendation: Not in MVP (all via service role in BFF)
   - Add when/if drivers get direct Supabase access

4. **Should route_runs track driver_id as reference?**
   - Recommendation: No (separate concerns—runs are operational, shifts are personnel)
   - Query both independently and correlate in BFF

5. **How to handle mid-route driver changes (handoff)?**
   - Recommendation: Create new shift for next driver
   - Current shift ends, new shift starts (both can be in_progress on same route)

---

**Document prepared by:** Claude Research Agent
**Status:** Ready for Design Document & Spec Kit
**Next step:** Team lead reviews and approves architectural decisions
