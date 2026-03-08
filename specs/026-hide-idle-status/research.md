# Research: Hide Idle Status from Passenger UI

## Decision 1: How to remove "idle" from RouteStatusBadge

**Decision**: Delete the `if (runStatus === "idle")` early-return block. The component already falls through to `isRunning ? "Em operação" : "Fora de operação"` — since idle routes are running, `isRunning` will be `true` and it will display "Em operação" with the green dot automatically.

**Rationale**: Simplest possible change — just remove the branch. No new logic needed.

**Alternatives considered**: Adding a mapping function to translate "idle" → "in_progress" before rendering. Rejected — unnecessary indirection for a single deleted branch.

## Decision 2: How to remove "idle" from HeroCard

**Decision**: Delete the `if (runStatus === "idle")` early-return block (lines 54–63). The component will then fall through to the later checks (`scheduleStatus`, `!isRunning`, `!nextStop`) and eventually render the active hero card with next stop info, ETA, and location link.

**Rationale**: Same approach as the badge — just remove the branch. The existing flow already handles the active route display correctly.

**Alternatives considered**: None needed — the fallthrough behavior is already correct.

## Decision 3: Scope boundary — driver UI unchanged

**Decision**: `src/components/driver/route-card.tsx` keeps its existing `statusBadge()` function with the "Entre turnos" case for `idle`. No changes needed.

**Rationale**: Confirmed by reading the driver route card — it has its own independent `statusBadge()` function that is not shared with the public components. The spec explicitly requires driver/admin views to retain shift status.

## Key observation: `isRunning` during idle

The `HeroCard` uses `isRunning` to gate ETA display and location link visibility (lines 129, 144). Need to confirm that `isRunning` is `true` when `runStatus === "idle"`.

**Finding**: Looking at the route card on the routes list page (screenshot), when "Entre turnos" is shown, the card still displays next stop + ETA. This confirms the data is available. The `isRunning` prop is set by the parent — need to verify it passes `true` for idle routes. If it doesn't, the hero card would show "Fora de operação" instead. This needs verification during implementation (check the parent page component).
