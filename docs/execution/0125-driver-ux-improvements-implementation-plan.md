# Driver UX Improvements — Implementation Plan

## Items Included

| # | Description |
|---|---|
| 1 | Auto-navigate to active route after shift start |
| 2 | Auto-redirect on login/page load if shift active |
| 3 | Route list polling |
| 5 | Progress indicator on active route |
| 7 | PIN login (Option B) |
| 8 | Shift duration timer |
| 9 | Header home link |
| 10 | Stop advancement feedback |
| 11 | Cold-start dialog non-dismissible |
| 13 | Browser connectivity awareness |
| 15 | Shift-end summary in confirmation dialog |

---

## Phase 1 — Navigation Flow Fixes (frontend only)

These are quick wins that fix the most friction in the current flow. No API changes.

### #9 — Header Home Link

- File: `src/app/driver/(protected)/layout.tsx`
- Wrap the `"CAAB Vans"` `<h1>` in a `<Link href="/driver">`
- No other changes

### #1 — Auto-Navigate After Shift Start

- File: `src/components/driver/route-card.tsx`
- Accept `router` (from parent via prop or use `useRouter()` directly)
- Normal start (no cold-start): after `applyStartData(data)` on line 136, call `router.push(/driver/routes/${route.id})`
- Cold-start flow: navigate after `handleConfirmColdStart` succeeds (line 163)
- This naturally leads into #11

### #11 — Cold-Start Dialog Non-Dismissible

- File: `src/components/driver/route-card.tsx`
- Remove the `"Pular"` button from the cold-start dialog footer
- Set `onOpenChange` to a no-op (prevent ESC/backdrop close)
- The driver must select a stop and confirm — no escape hatch
- After confirm, auto-navigate to active route (from #1)

### #2 — Auto-Redirect on Login/Page Load If Shift Active

- File: `src/app/driver/(protected)/page.tsx`
- After fetching routes, check: `const activeRoute = routes.find(r => r.activeShift?.driverId === userId)`
- If found, `router.replace(/driver/routes/${activeRoute.id})`
- This covers: browser refresh mid-shift, login redirect landing, and "back" from active route
- Edge case: if driver has >1 route with active shift (shouldn't happen, but guard with `find` returning the first)

### #3 — Route List Polling

- File: `src/app/driver/(protected)/page.tsx`
- Replace the manual `useEffect` + `useRef` + `useState` with a TanStack `useQuery`:
  - `queryKey: ["driver-routes"]`
  - `queryFn: fetch /api/driver/routes` via `fetchWithDriverAuth`
  - `refetchInterval: 30_000`
- Remove `didFetch`, `routes`, `userId`, `loading` state — derive from query result
- Keep `handleRouteUpdate` for optimistic updates after shift start/end (via `queryClient.setQueryData`)
- The auto-redirect from #2 runs inside a `useEffect` watching the query data

---

## Phase 2 — Active Route Enrichments (frontend only)

### #5 — Progress Indicator

- File: `src/app/driver/(protected)/routes/[routeId]/page.tsx`
- Add between header and detour banner
- Compute: `passedCount = (progress.passedStopIds?.length ?? 0) + (progress.skippedStopIds?.length ?? 0)`
- Render: `"{passedCount} de {totalStops} paradas"` + a thin progress bar (`<div>` with percentage width)
- Use green fill for the bar, `zinc-200` background

### #8 — Shift Duration Timer

- New component: `src/components/driver/active-route/shift-timer.tsx`
- Props: `shiftStartedAt: string` (ISO timestamp)
- Uses `useState` + `setInterval(1000)` to compute elapsed time from `shiftStartedAt`
- Format: `"Xh Xmin em turno"` (or `"X min em turno"` if < 1h)
- Placement: in the header row of active route page, next to the route name (subtle, `zinc-500` text)
- Cleanup interval on unmount

### #13 — Browser Connectivity Awareness

- New component: `src/components/driver/active-route/connection-banner.tsx`
- Uses TanStack Query's `dataUpdatedAt` from the `driver-route` query
- Computes: `secondsSinceUpdate = (Date.now() - dataUpdatedAt) / 1000`
- Uses `setInterval(5000)` to re-evaluate
- If `secondsSinceUpdate > 20`: show amber banner `"Sem conexão — dados podem estar desatualizados"`
- If query recovers: auto-dismiss banner
- Also listen to `navigator.onLine` as a fast signal (show immediately on offline event)
- Placement: fixed at top of active route page, below header

### #10 — Stop Advancement Feedback

- File: `src/app/driver/(protected)/routes/[routeId]/page.tsx`
- Track `previousNextStopId` via `useRef`
- On each query refetch, compare `progress.nextStopId` with `previousNextStopId`
- If changed (stop advanced):
  - Call `navigator.vibrate?.(200)` (short pulse, no-op if unsupported)
  - Set a transient state `showStopAdvanced = true` for 3 seconds
  - The `NextStopHero` receives a `highlighted` prop that applies a brief pulse animation (e.g., `animate-pulse` for 2s or a motion scale effect)
- Update ref after comparison

### #15 — Shift-End Summary in Confirmation Dialog

- File: `src/app/driver/(protected)/routes/[routeId]/page.tsx` (end-shift dialog)
- Also: `src/components/driver/route-card.tsx` (end-shift dialog there too)
- When `"Encerrar Turno"` is tapped, the confirmation dialog shows a summary before the confirm button:
  - Shift duration (computed from `progress.shiftStartedAt` to now)
  - Stops passed during this shift: count stops where `passedAt >= shiftStartedAt`
  - Stops skipped during this shift: count skipped stops where schedule data falls within shift window
- Data source: `route.schedule` entries already have `passedAt` timestamps and status, and `progress.shiftStartedAt` is available — no API changes needed
- The `NextStopHero` `"Rota concluída"` state remains unchanged (just a visual signal, no summary)

---

## Phase 3 — PIN Login (backend + frontend)

### 3a — Database: `driver_pins` Table

- New migration in `supabase/migrations/`
- Create `driver_pins` table:

```sql
CREATE TABLE driver_pins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id),
  pin_hash   TEXT NOT NULL,
  pin_digest CHAR(64) NOT NULL UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `pin_hash`: bcrypt hash used for auth verification
- `pin_digest`: deterministic SHA-256 of the PIN, enforces global uniqueness
- `UNIQUE` on `pin_digest` ensures no two drivers can share the same PIN
- RLS: service-role only for `driver_pins` (no direct client access)

### 3b — API: PIN Management Endpoint

- `POST /api/admin/drivers/[userId]/pin` — admin sets/resets a driver's PIN
  - Body: `{ pin: string }` (4–6 digits)
  - Validates PIN format (digits only, 4–6 length)
  - Computes `pin_hash` (bcrypt) and `pin_digest` (SHA-256)
  - Upserts into `driver_pins`
  - If `pin_digest` conflicts: reject with `"Este PIN já está em uso"`
  - Requires admin/superuser role

### 3c — API: PIN Login Endpoint

- `POST /api/driver/auth/pin-login`
  - Body: `{ pin: string }`
  - Compute `SHA-256(input_pin)` → lookup `driver_pins` by `pin_digest`
  - If found, verify `pin_hash` with bcrypt as confirmation
  - Validate that matched user has `app_metadata.role === "driver"` and `app_metadata.is_active === true`
  - Create Supabase session for that `user_id`
  - Return session cookies + user info
  - If no match: generic `"PIN inválido"`
  - Rate limit: max 5 failed attempts per IP per minute

### 3d — Frontend: PIN Login Screen

- Redesign `src/app/driver/login/page.tsx`:
  - Default view: PIN pad
    - 0–9 numpad with large touch targets
    - Dot indicators for entered digits (4–6)
    - Auto-submit when PIN length reached, or explicit `"Entrar"` button
    - On success → redirect to `/driver`
  - Fallback: `"Entrar com e-mail"` link below PIN pad → reveals email/password form (current login flow)
  - `"Voltar ao PIN"` link to return from email form to PIN pad

### 3e — Admin UI: PIN Management

- Add PIN set/reset to the admin driver management screen
- `"Gerar PIN"` button: creates random 4-digit PIN, shows it once in a modal (driver writes it down)
- Manual entry: admin types a specific PIN
- Display: `"PIN definido"` / `"Sem PIN"` indicator per driver (never show the actual PIN after creation)

---

## Implementation Order

### Phase 1 (1 PR)

`#9 → #11 → #1 → #2 → #3`

- All frontend, all in `driver/` directory
- Single commit per item, one PR

### Phase 2 (1 PR)

`#5 → #8 → #13 → #10 → #15`

- All frontend, active route enrichments
- Single commit per item, one PR

### Phase 3 (2 PRs, sequential)

- **PR 1** — Backend: migration + API endpoints (3a, 3b, 3c)
- **PR 2** — Frontend: PIN pad + admin UI (3d, 3e)

---

## Dependencies

- `#1` depends on `#11` (cold-start dialog must be resolved before navigation)
- `#2` depends on `#3` (needs query-based data to check for active shift)
- `#15` reuses shift duration logic from `#8`
- Phase 3 PR 2 depends on PR 1 (frontend needs backend API)
- No dependencies between Phase 1 and Phase 2 — could be parallelized
