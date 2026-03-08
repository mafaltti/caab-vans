# Quickstart: Hide Idle Status from Passenger UI

## What Changed

Removed the "Entre turnos" (between shifts) display from the passenger-facing UI. When a route's `runStatus` is `"idle"`, passengers now see "Em operação" (the same as active routes) instead of the internal "Entre turnos" label.

## Files Modified

1. **`src/components/public/route-status-badge.tsx`** — Removed the `if (runStatus === "idle")` early-return that rendered the amber "Entre turnos" badge. The component now falls through to the standard `isRunning` check, showing "Em operação" with the green dot.

2. **`src/components/public/hero-card.tsx`** — Removed the `if (runStatus === "idle")` early-return that rendered the amber banner with clock icon. The component now falls through to render the active hero card (next stop, ETA, location link) or the appropriate inactive state.

## How to Test

1. Start the dev server: `npm run dev`
2. Have a route in "idle" state (driver ended shift but route_run not completed)
3. Open the routes list as a passenger — verify "Em operação" badge shows (not "Entre turnos")
4. Open the route detail page — verify the hero card shows next stop info (not the amber "Entre turnos" banner)
5. Check the driver UI (`/driver`) — verify "Entre turnos" still shows there (unchanged)

## Not Changed

- Backend API responses still include `runStatus: "idle"`
- Driver route card (`src/components/driver/route-card.tsx`) still shows "Entre turnos" for idle routes
- `RunStatus` type definition unchanged
