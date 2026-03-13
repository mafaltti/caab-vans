# Driver Workflow Analysis — Industry Comparison and Recommendations

*Checked repo and compared with current official docs from Onfleet, OptimoRoute, Circuit, and Route4Me on March 11, 2026.*

---

## Current State

- The web driver area is still a thin launcher: it fetches assigned routes, shows start/end shift, and supports cold-start stop confirmation, but it is not yet a live run console. See `src/app/driver/page.tsx`, `src/components/driver/route-card.tsx`, and `src/app/api/routes/[routeId]/start/route.ts`.
- The Expo `van-tracker` app is a tracking utility, not a driver workflow app. It mainly exposes tracking on/off, settings, coordinates, auth issues, and background/geofence registration. See `apps/van-tracker/app/index.tsx`, `apps/van-tracker/src/location/tracking.ts`, and `apps/van-tracker/src/location/geofence-task.ts`.
- The backend progression model is intentionally strict. Stops are effectively `pending|passed`, device geofence only advances the head-of-line stop, and the resolver heals non-contiguous progress. That means freeform skip/resequence is a model change, not just a UI change. See `src/types/index.ts`, `src/lib/tracking/process-device-geofence-events.ts`, `src/app/api/routes/[routeId]/confirm-start-stop/route.ts`, and `src/lib/tracking/resolve-route-progress.ts`.

---

## What Other Players Do

- **Onfleet and OptimoRoute** both make out-of-sequence execution configurable, not default. Onfleet has "allow drivers to start tasks out of order"; OptimoRoute has "allow drivers to override the default schedule" and a dedicated "skip a stop during service" flow with confirmation.
- **OptimoRoute and Route4Me** explicitly distinguish planned route vs actual execution. OptimoRoute shows breadcrumb trails with planned/actual/both; Route4Me flags out-of-sequence visits and supports re-optimizing only remaining stops.
- **Circuit** exposes driver freedom through permissions. Admins can allow or block editing started routes, adding/deleting stops, editing stop order, reoptimizing, and editing notes; live routes can be updated or reoptimized after start.
- **Mature driver apps** keep navigation, next-stop context, status updates, and offline/background behavior in one execution surface. OptimoRoute is especially explicit about "order info, route map, and navigation in one place."

---

## What I'd Build Here

- Keep the authenticated web driver area as the operational surface for now. That is where driver identity and route authorization already exist. The tracker app should remain the background tracking tool until it supports authenticated driver workflows.
- Add a dedicated active-route screen powered by the existing route detail endpoint in `src/app/api/routes/[routeId]/route.ts`: next stop hero, ETA/delay, `Navegar`, map, upcoming stops, tracker health, and shift controls.
- Add an **exception drawer** instead of freeform editing. First actions should be `Pular próxima parada`, `Não foi possível atender`, `Entrar em desvio`, `Confirmar parada manualmente`, `Pausar/retomar`, and `Encerrar turno`.
- For this project, do not copy parcel-only features like signatures, package photos, barcode scan, or client portal unless CAAB actually needs them. The relevant pattern to borrow is **controlled exception handling**, not delivery-proof complexity.
- V1 should allow only `skip current next stop`, with required reason, confirmation, and audit log. Arbitrary drag-and-drop resequencing by drivers should not be allowed yet — the current contiguous-prefix logic will fight it and the public ETA will become unreliable.
- If "skip now and come back later" is needed later, model it as `deferred`, not `skipped`. That requires an execution order for remaining stops; otherwise the current `next_stop_id` and head-of-line geofence rules will keep snapping back to planned order.
- Before real deviation support, extend stop/run data to include exception statuses and reasons: `pending`, `passed`, `skipped`, maybe `deferred`; plus `reason_code`, `note`, `acted_by`, `acted_at`, and a run event log. Then update canonical progress to treat `skipped` and `deferred` differently.
- Add passenger-facing warning states when a driver enters detour or skip mode. Otherwise the public app will keep presenting a clean planned route while operations are explicitly deviating from it.

---

## Priority Order

1. Active-route driver screen + tracker health + navigation handoff.
2. Skip-next-stop and detour events with reasons and audit.
3. Deferred stop / rerank remaining stops.
4. Public warning states for route exceptions.
