# Plan Analysis: 0122 Native Driver App

**Feasibility: HIGHLY FEASIBLE**

No database migration required. Existing auth is modular, tracking is robust, and API contracts are well-defined. The plan is additive — web flow stays intact throughout.

---

## 1. Auth & API Contract

| Area | Current State | Gap | Complexity |
|---|---|---|---|
| `requireAuth()` / `requireRole()` | Cookie-only (`@supabase/ssr`) | Add `Authorization: Bearer` fallback | LOW |
| Bearer token handling | Zero references in codebase | New branch in `requireAuth()` using Supabase token validation | LOW |
| Bound-van helper | None (ingestion token validates device, not driver endpoints) | New `requireBoundVan(req)` reading `x-bound-van-id` + `x-ingestion-token` | LOW |
| Driver endpoints (7 total) | Auth + driver-assignment check only | Add bound-van filtering on GET, rejection on mutations | MEDIUM |
| Expo Supabase client | `@supabase/supabase-js` NOT installed in tracker app | Full integration: client, login, session persistence | MEDIUM |
| Ingestion token validation | Already complete in tracking endpoints | No changes needed | — |

**Key finding:** The `route_drivers` table handles driver assignment. Bound-van enforcement layers on top — filtering by `route.van_id === boundVanId` for native callers, while web callers are unaffected (headers are optional).

**Server effort:** ~10–12h across auth middleware + 7 endpoint updates + tests.

---

## 2. Expo App Structure

**Current architecture:**

- 3 screens: Home (tracking toggle), Settings (device provisioning), Diagnostics
- No centralized state (no Zustand/Context) — scattered across component state + AsyncStorage + SecureStore + device-protected storage
- Bootstrap gate: only checks `isSettingsComplete()` (`apiBaseUrl`, `vanId`, `ingestionToken`)
- No login, no Supabase Auth, no driver session concept

### What Must Change

| Change | Details | Complexity |
|---|---|---|
| Split Settings type | `DeviceProvisioning` (support) vs `DriverSession` (auth) | LOW |
| Bootstrap gate | `unprovisioned → device-setup`; `no session → login`; `signed in → routes/active-route` | MEDIUM |
| Supabase Auth client | `@supabase/supabase-js` + AsyncStorage session adapter + SecureStore for tokens | MEDIUM |
| Login screen | Email/password, role/active validation, session persist | MEDIUM |
| Device setup screen | Extract from current `settings.tsx`, move to support area | LOW |

**New files needed:** ~10 (login, device-setup, routes, `route/[routeId]`, support, driver-session storage, shift-state storage, supabase-client, driver-routes API, shift reconciliation hook).

**Files to significantly refactor:** 6 (`settings.ts`, `settings.tsx`, `_layout.tsx`, `tracking.ts`, `task.ts`, `index.tsx`).

---

## 3. Driver Workflow (Web → Native Port)

Existing web screens (all under `src/app/driver/` + `src/components/driver/`):

| Screen/Component | Key Behaviors | Port Complexity |
|---|---|---|
| Route list (`page.tsx`) | One-time fetch, no polling | LOW |
| Route card (`route-card.tsx`) | Shift start/end buttons, cold-start dialog, shift history | MEDIUM |
| Active route (`routes/[routeId]/page.tsx`) | 5s polling (TanStack Query), next-stop hero, timeline, exception actions, detour banner | HIGH |
| `NextStopHero` | Stop name, scheduled time, ETA, delay badge | LOW |
| `TrackerHealth` | Ping freshness, battery, network type | LOW |
| `ExceptionDrawer` | Skip-stop (reason codes + note), detour start/end, navigation handoff | MEDIUM |
| `ScheduleTimeline` (shared) | Vertical timeline with past/current/future stops, collapsible past section | MEDIUM |

### API Endpoints Consumed

All exist — no new endpoints needed:

- `GET /api/driver/routes` — route list
- `GET /api/driver/routes/[routeId]` — route detail with progress, ETA, tracker health
- `POST /api/routes/[routeId]/start` — shift start + cold-start detection
- `POST /api/routes/[routeId]/confirm-start-stop` — cold-start confirmation
- `POST /api/routes/[routeId]/skip-stop` — skip with reason code
- `POST /api/routes/[routeId]/detour` — start/end detour
- `POST /api/routes/[routeId]/end` — end shift

### Critical Business Logic to Replicate

All server-side — just call endpoints:

- Cold-start detection (30+ min late threshold, GPS-based stop suggestion)
- Head-of-line skip enforcement (only next stop skippable)
- Canonical progress advancement after skip/confirm
- Auto-deactivate detour on shift end

**Native port estimate:** ~2,500–3,500 LOC across 12–15 new files.

---

## 4. Tracking Coupling & Resilience

### Current Strengths (Already Built)

- Background location task with throttling, dedup, accuracy filtering
- Network resilience: NetInfo listener, exponential backoff (5s→60s cap), 500-point buffer with 24h TTL
- Boot resilience: device-protected storage + `BootRestartReceiver` + health-check task (15-min)
- Battery optimization: accuracy switching at 20%/25% thresholds
- Auth failure handling: 3× 401 → `authPaused`, points buffered
- Geofence dedup (boot grace period + in-memory + persisted)
- Foreground task-kill detection (5-min threshold → recovery modal)

### Gaps to Fill

| Gap | What's Needed | Complexity |
|---|---|---|
| Permissions decoupled from service start | Extract `requestLocationPermissions()` and `startLocationService()` as independent functions | LOW (2–3h) |
| Shift state in device-protected storage | Add `shiftActive` + `activeRouteId` to Android native bridge | LOW (2–3h) |
| Boot resume gated on shift | Change `wasTracking && settingsOk` → `&& shiftActive` | LOW (1h) |
| Server reconciliation on foreground | New hook: fetch server state, stop tracking if no valid shift | MEDIUM (4–6h) |
| Recovery modals | Shift-started-but-tracking-failed → "Retry / End shift"; end-succeeded-but-stop-failed → "Retry stop" | LOW (2–3h) |
| Manual toggle to support-only | Move tracking toggle off main screen into diagnostics/support area | LOW (1–2h) |

**Key risk:** Permission revocation mid-shift — task fails silently, health check detects but can't re-grant. Foreground detection + recovery modal is the mitigation.

---

## Cross-Cutting Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Supabase token expiry during long shift (default 1h) | MEDIUM | SDK auto-refreshes; reconciliation on foreground catches stale sessions |
| `SecureStore` failure on some Android devices | MEDIUM | Fallback to AsyncStorage with degraded security; already has migration code |
| Simultaneous web + native sessions for same driver | LOW | Both work independently by design; bound-van enforcement is additive |
| Race between shift-start (server) and tracking-start (local) | MEDIUM | No transactional guarantee; recovery UI handles the gap |
| Android Doze killing background task | LOW | Boot receiver + health check + foreground service already mitigate |
| Backward compatibility during rollout | LOW | Headers optional; web flow untouched; native is additive |

---

## Effort Summary

| Workstream | Hours | Can Parallelize? |
|---|---|---|
| Server: dual-mode auth + bound-van helper | 5–7h | Yes (independent) |
| Server: 7 driver endpoint updates + tests | 8–10h | After auth helper |
| Expo: storage split + Supabase client + login | 12–15h | Yes (independent of server) |
| Expo: bootstrap gate + navigation refactor | 8–10h | After login |
| Expo: route list + active route screens | 14–18h | After server endpoints |
| Expo: tracking lifecycle refactor | 8–12h | Yes (independent) |
| Expo: shift orchestration + recovery states | 8–10h | After tracking + screens |
| Expo: support area + manual override | 3–5h | Anytime |
| Testing (server + client) | 10–14h | Ongoing |
| **Total** | **~76–101h** | |

### Recommended Phasing

1. **Server auth + tracking refactor** (parallel, ~2 weeks) — unblocks everything
2. **Storage split + login + bootstrap gate** (~1.5 weeks) — core app shell
3. **Route screens + shift orchestration** (~2 weeks) — main driver UX
4. **Resilience + reconciliation + polish** (~1 week) — production-readiness

---

## Verdict

The plan is well-scoped and aligned with the existing codebase. No architectural risks. The strongest existing asset is the tracking layer — it's already resilient and needs only decoupling, not rewriting. The largest new work is the native driver screens (~14–18h) and the Supabase Auth integration (~12–15h). Server changes are straightforward and low-risk.
