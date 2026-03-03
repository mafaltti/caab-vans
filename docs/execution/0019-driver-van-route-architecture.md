# Driver, Van, and Route Architecture Analysis

**Date**: 2026-03-02
**Scope**: Comprehensive analysis of driver UI, start/end route API, and state machine logic

---

## 1. Overview: Multi-Layer Driver Workflow

The system implements a three-tier relationship model:

```
Drivers (Auth users)
  ↓ (1:N via van.driver_id)
Vans
  ↓ (1:N via routes.van_id)
Routes
  ↓ (1:1 per service_date via route_runs)
Route Runs (active operational sessions)
```

A driver can be assigned multiple vans. Each van has multiple routes. Each route can have one active run per service date (e.g., one run per day).

---

## 2. Driver Authentication & Identity

### Auth Model
- **Supabase Auth + Role-Based Access Control**
  - User role: `app_metadata.role ∈ {"admin", "superuser", "driver"}`
  - Active flag: `app_metadata.is_active: boolean` (must be `true`)
  - Session: Stored in HTTP cookies via `createSessionClient()`

### Auth Middleware
```typescript
// src/lib/api/auth.ts
requireAuth(): Returns { user: {id, email}, role }
requireRole("driver"): Returns same, but throws 403 if role ≠ "driver"
```

### Enforcement Points
1. **Driver layout** (`src/app/driver/layout.tsx`): Redirects to login if not driver role
2. **API endpoints**: All driver endpoints check `auth.role === "driver"` and `is_active === true`
3. **Client-side**: `fetchWithAuth()` redirects to login on 401

---

## 3. Driver-to-Van Assignment Model

### Setup (Admin API)
**Endpoint**: `PUT /api/admin/vans/[vanId]`

```json
{
  "driverId": "UUID" | null
}
```

- **Validation**: driverId must exist, have role="driver", and be active
- **Storage**: `vans.driver_id = UUID | NULL`
- **Effect**: One van can have at most one active driver

### Lookup (Driver Perspective)
```typescript
// From /api/driver/routes GET handler
const { data: vans } = await supabase
  .from("vans")
  .select("id, name")
  .eq("driver_id", auth.user.id);
```

Result: Driver can only see vans where `driver_id = their_user_id`

### Key Constraint
- A driver seeing routes = driver's assigned vans → van's routes
- Driver **cannot** start/end a route on a van they're not assigned to
  - **Check**: `/api/routes/[routeId]/start` validates `van.driver_id === auth.user.id`
  - **Error**: 403 FORBIDDEN if mismatch

---

## 4. Van-to-Route Assignment

### Relationship
- Routes have `van_id` (FK to vans.id)
- One route = one van (at creation)
- Vans can have multiple routes (many-to-one inverse)

### Driver's Route Discovery
1. Fetch driver's assigned vans
2. Fetch all routes where `van_id IN (vanIds)`
3. Aggregate route metadata + today's run status

### Example Query (from `/api/driver/routes`)
```sql
SELECT routes.* FROM routes
WHERE van_id IN (
  SELECT id FROM vans WHERE driver_id = $1
)
```

---

## 5. Route Run State Machine

### Data Model
```typescript
// route_runs table
{
  id: UUID,
  route_id: UUID (FK),
  service_date: string (YYYY-MM-DD),
  started_at: ISO timestamp | null,
  ended_at: ISO timestamp | null,
  created_at: ISO timestamp,
  updated_at: ISO timestamp
}
```

**Unique constraint**: (route_id, service_date)
**Meaning**: One active run per route per calendar day

### State Transitions

#### State 0: No Run (Before First Start)
```
route_runs record does not exist
OR exists with started_at=null, ended_at=null
```

**Transitions to State 1**: Driver clicks "Iniciar Rota" → POST `/api/routes/[routeId]/start`

#### State 1: Waiting (Route Exists, Not Started)
```
route_runs.started_at = null
route_runs.ended_at = null
```

**Derived status**: `"waiting"`
**Driver UI**: Show "Iniciar Rota" button
**Transitions to State 2**: Call POST `/api/routes/[routeId]/start`

#### State 2: In Progress (Route Started, Running)
```
route_runs.started_at = ISO timestamp (not null)
route_runs.ended_at = null
```

**Derived status**: `"in_progress"`
**Driver UI**: Show "Encerrar Rota" button (with confirmation)
**GPS tracking**: Location pings are captured and matched to stops
**Transitions to State 3**: Driver clicks "Encerrar Rota" → POST `/api/routes/[routeId]/end`

#### State 3: Completed (Route Ended)
```
route_runs.started_at = ISO timestamp
route_runs.ended_at = ISO timestamp
```

**Derived status**: `"completed"`
**Driver UI**: Show read-only summary (start & end times)
**Transitions**: None (immutable for this service_date)
**Next day**: New run can be created for the same route

---

## 6. Start Route API

**Endpoint**: `POST /api/routes/[routeId]/start`

### Authentication & Authorization
```typescript
// Must be authenticated driver
auth = await requireAuth();
if (auth.role !== "driver") → 403 FORBIDDEN

// Fetch route + van relationship
const { data: route } = await supabase
  .from("routes")
  .select("id, van:vans!inner(id, driver_id)")
  .eq("id", routeId)
  .single();

// Verify driver is assigned to the van
if (van.driver_id !== auth.user.id) → 403 FORBIDDEN
```

### Validation
1. **Route exists**: If not → 404 NOT_FOUND
2. **Has schedule entries**: If no entries → 422 VALIDATION_ERROR
3. **Not already started today**: If `started_at` is already set → 409 CONFLICT

### Logic
```typescript
const serviceDate = todayBahiaDate(); // America/Bahia timezone
const { data: existingRun } = await supabase
  .from("route_runs")
  .select("id, started_at, ended_at")
  .eq("route_id", routeId)
  .eq("service_date", serviceDate)
  .single();

if (existingRun?.started_at) {
  // Already started → reject
  return 409 CONFLICT
}

const now = new Date().toISOString();

if (existingRun) {
  // Update existing (created by GPS ping)
  await supabase
    .from("route_runs")
    .update({ started_at: now })
    .eq("id", existingRun.id);
} else {
  // Create new
  await supabase
    .from("route_runs")
    .insert({
      route_id: routeId,
      service_date: serviceDate,
      started_at: now,
    });
}
```

### Response
```json
{
  "run": {
    "id": "UUID",
    "routeId": "UUID",
    "serviceDate": "YYYY-MM-DD",
    "startedAt": "ISO string",
    "endedAt": null,
    "status": "in_progress"
  }
}
```

### Side Effects
1. Route transitions to "in_progress"
2. Driver sees "Encerrar Rota" button instead of "Iniciar Rota"
3. System begins processing GPS pings for this route's geofences
4. Route run stops are populated (via background ingestion or explicit API)

---

## 7. End Route API

**Endpoint**: `POST /api/routes/[routeId]/end`

### Authentication & Authorization
Same as start: driver role + van assignment check

### Validation
1. **Active run exists**: No active run (not started) → 404 NOT_FOUND
2. **Not already ended**: If `ended_at` is set → 409 CONFLICT

### Logic
```typescript
const { data: run } = await supabase
  .from("route_runs")
  .select("id, started_at, ended_at")
  .eq("route_id", routeId)
  .eq("service_date", serviceDate)
  .single();

if (!run || !run.started_at) {
  return 404 NOT_FOUND; // No active run
}

if (run.ended_at) {
  return 409 CONFLICT; // Already ended
}

const now = new Date().toISOString();
await supabase
  .from("route_runs")
  .update({ ended_at: now })
  .eq("id", run.id);
```

### Response
```json
{
  "run": {
    "id": "UUID",
    "routeId": "UUID",
    "serviceDate": "YYYY-MM-DD",
    "startedAt": "ISO string",
    "endedAt": "ISO string",
    "status": "completed"
  }
}
```

### Side Effects
1. Route transitions to "completed"
2. Driver sees read-only summary of start/end times
3. "Encerrar Rota" button is replaced with summary display
4. GPS ingestion for this route on this service date stops accepting new stops
5. Allows a new run to be created tomorrow (same route, next service_date)

---

## 8. Driver Routes Fetch API

**Endpoint**: `GET /api/driver/routes`

### Purpose
Return driver's assigned routes with today's run status

### Flow
```typescript
1. Authenticate driver
2. Fetch vans where driver_id = auth.user.id
3. If no vans → return empty array
4. Fetch routes where van_id IN (van_ids)
5. For each route:
   a. Fetch today's route_runs record (if exists)
   b. Sort schedule entries by time
   c. Compute run status: null → "waiting", started → "in_progress", ended → "completed"
6. Return aggregated DriverRoute[] with metadata
```

### Response Shape
```typescript
type DriverRoute = {
  id: string;
  name: string;
  vanName: string;
  totalStops: number;
  firstStopTime: string | null; // HH:mm
  lastStopTime: string | null;  // HH:mm
  run: {
    id: string;
    serviceDate: string;
    status: "waiting" | "in_progress" | "completed";
    startedAt: string | null;
    endedAt: string | null;
  } | null; // null if run does not exist yet
};
```

### Status Derivation
```typescript
function deriveRunStatus(startedAt, endedAt): RunStatus {
  if (endedAt) return "completed";
  if (startedAt) return "in_progress";
  return "waiting";
}
```

- **Waiting**: No run exists, or run exists but not started
- **In Progress**: Run started but not ended
- **Completed**: Run both started and ended

---

## 9. Driver UI Component

**File**: `src/app/driver/route-card.tsx`
**Props**: `{ route: DriverRoute, onUpdate: (updated: DriverRoute) => void }`

### Display Logic
1. **Status Badge**
   - Waiting → "Aguardando" (amber)
   - In Progress → "Em andamento" (blue)
   - Completed → "Encerrada" (gray)
   - No run → "Sem viagem" (secondary)

2. **Route Info**
   - Name + van name
   - Total stops + time window (first–last stop time)

3. **Conditional Buttons**
   ```
   if status = waiting or no run:
     Show "Iniciar Rota" button
   if status = in_progress:
     Show "Encerrar Rota" button (destructive style)
   if status = completed:
     Show read-only summary: "Iniciada: HH:mm" / "Encerrada: HH:mm"
   ```

4. **Confirmation Dialog**
   - When clicking "Encerrar Rota", show dialog: "Tem certeza que deseja encerrar a rota? Esta ação não pode ser desfeita."
   - User must confirm or cancel

### Action Handlers
```typescript
async function handleStart() {
  const res = await fetchWithAuth(`/api/routes/${route.id}/start`, {
    method: "POST",
  });
  if (res.ok) {
    const data = await res.json();
    onUpdate({ ...route, run: data.run });
  } else {
    // Show error from API
  }
}

async function handleEnd() {
  const res = await fetchWithAuth(`/api/routes/${route.id}/end`, {
    method: "POST",
  });
  if (res.ok) {
    const data = await res.json();
    onUpdate({ ...route, run: data.run });
  } else {
    // Show error from API
  }
}
```

---

## 10. Driver Page (Layout & Root)

**Layout**: `src/app/driver/layout.tsx`
**Page**: `src/app/driver/page.tsx`

### Layout (Auth Gate)
```typescript
async function DriverLayout({ children }) {
  const user = await getUser(); // Via server-side Supabase session
  if (!user || user.app_metadata.role !== "driver") {
    redirect("/admin/login");
  }
  return <header /> + <main>{children}</main>;
}
```

### Page (Fetch & Render)
```typescript
export default function DriverPage() {
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth("/api/driver/routes")
      .then(res => res.json())
      .then(data => setRoutes(data.routes ?? []))
      .finally(() => setLoading(false));
  }, []);

  // Render RouteCards in a list
}
```

---

## 11. Service Date Concept

### Purpose
Enables multi-day operations without date rollover conflicts

### Implementation
- **Function**: `todayBahiaDate()` returns YYYY-MM-DD in America/Bahia timezone
- **Query**: All queries filter by `eq("service_date", todayBahiaDate())`
- **Effect**: Each route can have one run per calendar day in Bahia time
- **Midnight rollover**: Automatic—next day gets a new service_date, allowing fresh run

### Example
- Route "A" on 2026-03-02 (Bahia): one run
- Same route on 2026-03-03 (Bahia): separate run
- Driver can start a new run tomorrow without waiting for admin intervention

---

## 12. Security Model

### Access Control
1. **Authentication**: Required for driver endpoints
2. **Authorization**: Role-based (driver, admin, superuser)
3. **Resource Isolation**: Driver can only access their own routes (via assigned vans)

### API Checks
- Driver start/end checks: `van.driver_id === auth.user.id`
- Prevents privilege escalation (driver cannot start routes for other drivers)

### Data Flow
```
Driver Client
  → Next.js BFF (/api/routes/*) [requireAuth, role check]
  → Supabase Service Client [server-side, has full access]
  → Postgres DB
```

- **No direct client access**: Drivers don't have Supabase anon key for direct access
- **Server validation**: All business logic in Next.js Route Handlers
- **Service role**: Only used server-side in BFF, never exposed to client

---

## 13. Stop Tracking & Run Progression

### Related Tables
```typescript
route_runs
├── id, route_id, service_date, started_at, ended_at
└── route_run_stops
    ├── run_id (FK to route_runs.id)
    ├── schedule_entry_id (FK to schedule_entries.id)
    ├── status ("pending" | "passed")
    └── passed_at (ISO timestamp)
```

### Flow
1. **Driver starts route**: `route_runs.started_at` is set
2. **GPS ping arrives**: Matched against geofences (via `schedule_entries`)
3. **Geofence hit**: `route_run_stops` record created with `status = "pending"` → `"passed"`
4. **Driver ends route**: `route_runs.ended_at` is set; no more GPS processing for this run

### Computing Progress (Public API)
- Public route API (`GET /api/routes`) fetches `route_run_stops` and computes:
  - Next stop (first pending)
  - Passed stops (all passed)
  - ETA (based on van position + distance to next stop)
  - Schedule status (active, ended, not_started)

---

## 14. Admin Van Assignment UI (Reference)

**API**: `PUT /api/admin/vans/[vanId]`

**Flow**:
1. Superuser lists vans via `GET /api/admin/vans`
2. Superuser selects a driver from the driver list (`GET /api/admin/users`)
3. Superuser clicks "Assign Driver"
4. Frontend sends `PUT /api/admin/vans/{vanId}` with `{ driverId: "..." }`
5. Backend validates driver exists, has role=driver, is_active=true
6. Backend updates `vans.driver_id` to the selected driver ID
7. Driver's next login sees the assigned van + routes

---

## 15. Error Scenarios & Handling

### Start Route Errors
| Code | Status | Cause | Recovery |
|------|--------|-------|----------|
| NOT_FOUND | 404 | Route doesn't exist | Check route ID |
| FORBIDDEN | 403 | Driver not assigned to van | Admin must assign driver |
| VALIDATION_ERROR | 422 | Route has no schedule entries | Admin must add stops |
| CONFLICT | 409 | Already started today | Driver must end first or wait until tomorrow |

### End Route Errors
| Code | Status | Cause | Recovery |
|------|--------|-------|----------|
| NOT_FOUND | 404 | No active run found | Route must be started first |
| CONFLICT | 409 | Already ended today | Route is complete, can't end twice |

### Client-Side Handling
- `fetchWithAuth` redirects to login on 401
- UI catches non-ok responses, displays error message
- Error messages from API are shown in red below buttons
- Confirmation dialog prevents accidental end-route clicks

---

## 16. Key Constraints & Assumptions

1. **One run per route per service date**: Enforced by unique constraint in DB
2. **One active driver per van**: Not enforced; design assumes one-to-one
3. **No concurrent route operations**: Driver can start/end multiple routes sequentially but not simultaneously
4. **Timezone is fixed**: America/Bahia; all times calculated in this TZ
5. **GPS ingestion is separate**: Route runs created by geofence hits or driver click; both update same table
6. **No shift concept**: Runs are tied to routes, not to driver sessions
7. **Service date is calendar date**: Midnight rollover in Bahia TZ creates new run opportunity

---

## 17. Future Considerations

- **Multi-vehicle assignment**: If a driver needs to operate multiple vans simultaneously, current state machine works (separate routes per van)
- **Run history**: All runs are immutable after `ended_at` is set; useful for auditing
- **ETA improvements**: Current ETA based on schedule + GPS position; could incorporate historical delay data
- **Geofence refinement**: Radius is per-stop; could be made dynamic based on stop type or road conditions

