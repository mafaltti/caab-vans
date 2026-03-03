# `isRunning` vs `runStatus` — Signal Analysis

## The Two Signals

| Signal | How it works | What it means |
|---|---|---|
| `isRunning` | `withinWindow && locationFresh` | "Van is physically sending GPS within schedule hours" |
| `runStatus` | Derived from `route_shifts` table | "Driver has formally started/ended a shift" |

Both API endpoints already compute both signals and return them. The disagreement is purely in which signal each UI component prioritizes.

## The Scenarios

| Scenario | `isRunning` | `runStatus` | What passenger sees |
|---|---|---|---|
| Van running, shift started | `true` | `in_progress` | Both agree — no issue |
| Van running, no shift yet | `true` | `waiting` | **Bug:** list="Em operação", detail="Aguardando" |
| No GPS, within schedule | `false` | `waiting` | Both agree — not running |
| Shift started, GPS died | `false` | `in_progress` | Tricky edge case |
| Past schedule window, all ended | `false` | `completed` | Both agree — done |

## The Three Options

### Option A: Trust `isRunning` (GPS) as primary — ✅ Recommended

The passenger-facing app should answer: *"Is the van physically running right now?"* — GPS freshness is the strongest real-world signal for this.

**Change:** In `HeroCard`, only show "Aguardando início da rota" when `runStatus === "waiting"` **AND** `!isRunning`. If GPS says the van is active, show the active hero card.

- Minimal change (one condition in `hero-card.tsx`)
- List and detail pages agree
- Shift lifecycle remains useful for "completed" state and driver views
- Matches what passengers actually care about

### Option B: Trust `runStatus` (shifts) as primary

Make the list page also check `runStatus` — only show "Em operação" when a shift is `in_progress`.

- More "correct" from a business process standpoint
- But if a driver forgets to start their shift, the van appears idle to passengers even though it's physically running and sending GPS
- Requires changes to both `RouteCard` and `RouteStatusBadge`
- Worse passenger experience for an internal process oversight

### Option C: Combine both into a unified status

Create a single `derivePassengerStatus(isRunning, runStatus)` function used everywhere.

- Most "architecturally clean"
- Over-engineered for the current problem — adds a new abstraction for something that only has two consumers
- Violates YAGNI

## Recommendation: Option A

The fix is a one-line condition change in `hero-card.tsx` line 54:

```tsx
// Before:
if (runStatus === "waiting") { ... }

// After:
if (runStatus === "waiting" && !isRunning) { ... }
```

This way:

- GPS active + no shift → shows active hero (matches the list page)
- No GPS + no shift → shows "Aguardando" (correct, van isn't operating)
- `runStatus === "completed"` still takes priority above (line 44)
- No changes needed to the list page or API layer
