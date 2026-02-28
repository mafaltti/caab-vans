# Research: Hide Next-Stop Display for Inactive Routes

**Date**: 2026-02-28

## Decision 1: Where to gate nextStop — API (BFF) vs UI

**Decision**: Gate in the BFF (API handlers). Set `nextStop = null` when `isRunning === false`.

**Rationale**: The constitution states: "Computed fields (next stop, isOutdated, status labels) MUST be calculated in the BFF for consistency across clients." If the route is not running, there is no meaningful "next stop" — the BFF should not return one. This keeps all clients consistent and avoids duplicating the check in every UI component.

**Alternatives considered**:
- **UI-only guards**: Would work for the web app but violates the constitution's BFF-first principle. Future clients (mobile) would need to re-implement the same guard.
- **Both API + UI**: Unnecessary — if the API returns `null`, existing UI null-checks already handle it. Adding redundant UI guards would violate KISS.

## Decision 2: Hero card fallback for non-running routes

**Decision**: Add a new early-return branch in `hero-card.tsx` for `!isRunning` (when `scheduleStatus !== "ended"`). Display a neutral gray card with "Fora de operação" text, visually consistent with the existing "Programação encerrada por hoje" fallback.

**Rationale**: The hero card currently handles two states: `scheduleStatus === "ended"` and `!nextStop`. After the API fix, a non-running route within schedule window will have `nextStop = null`, which falls through to "Nenhum horário disponível" — a misleading message (there are scheduled times, the route just isn't running). A dedicated `!isRunning` branch provides the correct message.

**Alternatives considered**:
- **Reuse "Nenhum horário disponível"**: Technically works after the API fix but the message is inaccurate for the scenario (schedule exists, route is just offline).
- **Change the existing null-check message**: Would break its meaning for routes that genuinely have no schedule data.

## Decision 3: Route card — explicit guard or rely on API null

**Decision**: Rely on the API returning `nextStop = null`. The route card already renders nothing when `route.nextStop` is falsy. No code change needed in `route-card.tsx`.

**Rationale**: KISS — the existing `{route.nextStop && (...)}` conditional already handles null correctly. Adding an explicit `isRunning` check would be redundant after the API fix.
