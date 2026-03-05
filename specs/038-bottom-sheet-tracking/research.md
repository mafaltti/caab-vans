# Research: Bottom Sheet Tracking UI

**Date**: 2026-03-04
**Feature**: 038-bottom-sheet-tracking

## 1. Bottom Sheet Library

**Decision**: Use Vaul via `shadcn@latest add drawer`

**Rationale**:
- Vaul is the drawer primitive behind shadcn/ui's Drawer component — already in the design system ecosystem.
- Supports `snapPoints`, `activeSnapPoint` (controlled), `modal={false}`, `dismissible={false}` — exactly our persistent sheet pattern.
- Handles iOS Safari rubber-banding, scroll/drag coordination, and focus trapping (via Radix Dialog).
- ~8 KB gzip. No extra animation dependency needed.
- Already used in the `apps/van-tracker` Expo app (`vaul@^1.1.2`).

**Alternatives considered**:
- **react-modal-sheet**: Good API with `snapTo(index)` and Motion values. But adds a separate dep outside shadcn ecosystem.
- **Custom (Motion)**: Zero new deps but requires building snap logic, velocity snapping, scroll-lock from scratch. Not justified.
- **CSS-only (scroll-snap)**: Poor browser support for the gestures needed. Too risky.

## 2. Layout Strategy for Fullscreen Map

**Decision**: Conditional rendering in the route detail page component (not a new route group or nested layout).

**Rationale**:
- The route detail page already has conditional rendering for the map (only when `isRunning && lastLat != null`). Extending this condition to switch between card layout and sheet layout is the minimal change.
- Creating a new route group `(public-map)` would duplicate the route segment `/routes/[routeId]`, creating ambiguity for Next.js App Router.
- A nested `layout.tsx` at `[routeId]/` still inherits the `(public)` layout's padding and BottomNav — CSS overrides would be needed anyway.
- The page component can render without the `<main>` wrapper's padding by using CSS classes that override the parent layout when in sheet mode (e.g., negative margins + absolute positioning).

**Implementation approach**:
- The page detects `useBottomSheet = route.isRunning && route.van.lastLat != null && route.van.lastLng != null`.
- When `useBottomSheet` is true: render fullscreen map + bottom sheet layout (absolute positioned, breaking out of the padded `<main>`).
- When `useBottomSheet` is false: render existing card layout (HeroCard + VanTrackingMap card + ScheduleTimeline).
- No useRef latch pattern was needed: `lastLat/lastLng` persist in the database once set, so the condition stays true even when GPS signal is temporarily lost. The `isLocationOutdated` flag handles stale display while coordinates remain available.

**BottomNav hiding**: The sheet renders via Vaul Portal at `z-50` (same as BottomNav), but appears later in the DOM so it renders on top. The route detail header uses `z-[60]` to stay above both. No explicit BottomNav hiding needed.

## 3. VanTrackingMap Fullscreen Adaptation

**Decision**: Modify VanTrackingMap to accept dynamic container styling and fitBounds padding via props.

**Rationale**:
- The component currently hard-codes `h-[250px] rounded-2xl overflow-hidden shadow-sm bg-white` on its outer wrapper.
- The internal map logic (markers, animation, userInteractedRef, re-center) is completely decoupled from container size — it works at any dimensions.
- Adding a `variant` prop or accepting `className`/`containerClassName` overrides is minimal change.

**Changes needed**:
1. Accept optional `className` prop for the outer container (defaults to current card styling).
2. Accept optional `fitBoundsPadding` prop for fitBounds (defaults to `{ padding: 40 }`).
3. Accept optional `recenterBottomOffset` prop for dynamic re-center button positioning.

**Implementation detail**: The outer container uses `cn("relative", className)` so that Tailwind Merge resolves conflicting position classes. In card mode: `relative h-[250px] rounded-2xl ...`. In fullscreen mode: `absolute inset-0` (tailwind-merge drops `relative` in favor of `absolute`). An inner `h-full w-full overflow-hidden` div wraps the Map and re-center button.

**Alternative**: Create a separate `FullscreenMap` wrapper that uses `VanTrackingMap` internally. Rejected — DRY violation, all the marker/animation logic would be duplicated.

## 3b. ScheduleTimeline Adaptation for Sheet

**Decision**: Add a `variant` prop to `ScheduleTimeline`: `"card"` (default) keeps the existing `rounded-3xl bg-white p-5 shadow-sm` wrapper; `"inline"` strips the card wrapper and makes the "Horários" header + past-stops toggle button sticky.

**Rationale**:
- Inside the sheet, the card wrapper creates a "card inside a card" visual artifact that breaks on scrolling (rounded box clips content).
- The "Horários" header and "Ver X paradas anteriores" button should stay visible while scrolling the timeline, providing persistent context and quick access to the toggle.
- Sticky header uses `sticky top-0 z-20 bg-white -mx-5 px-5` — z-20 sits above timeline nodes (z-10), negative margins extend the white background edge-to-edge within the sheet's `px-5` padded scroll area so no content peeks through on the sides.

**Alternative**: Extract the header into a separate component and render it in the sheet's fixed `peek` slot. Rejected — couples sheet layout knowledge into ScheduleTimeline internals and adds complexity for a simple sticky fix.

## 4. Sheet-to-Map Communication

**Decision**: Sheet state is managed in the page component and passed down as props/context to both the map and the sheet.

**Rationale**:
- The sheet's `activeSnapPoint` determines map padding.
- Only 3 possible states — simple enough for `useState` at the page level.
- No global state management needed (no Zustand, no Context provider).

**Padding values per snap point**:
- Peek (0.25): `{ top: 80, bottom: 220, left: 40, right: 40 }`
- Half (0.55): `{ top: 80, bottom: window.innerHeight * 0.55, left: 40, right: 40 }`
- Full (0.92): `{ top: 80, bottom: window.innerHeight * 0.85, left: 40, right: 40 }`

## 5. Progress Bar Component

**Decision**: New `RouteProgressBar` component — simple, stateless, pure UI.

**Rationale**:
- No existing component for this in the project.
- Takes `totalStops`, `passedCount`, and optionally `currentProgress` (0-1 within current segment).
- Renders N horizontal segments with filled/partial/empty states.
- Matches the mockup's `progress-bar` section.

## 6. Peek Section Component

**Decision**: New `RouteDetailPeek` component that extracts the "next stop + ETA" display from HeroCard's logic.

**Rationale**:
- HeroCard handles many states (waiting, completed, no GPS, active). The peek section only needs the active state display.
- Rather than importing HeroCard and conditionally rendering parts of it, a focused peek component is cleaner.
- Reuses the same data props (nextStop, etaMinutes, scheduledTime) that HeroCard already receives.

## 7. Re-center Button in Sheet Mode

**Decision**: Keep the re-center button inside VanTrackingMap, positioned dynamically via a `recenterBottomOffset` prop.

**Rationale**:
- In card mode (`recenterBottomOffset` undefined): button uses `absolute bottom-3 right-3`.
- In fullscreen mode (`recenterBottomOffset` provided): button uses inline `bottom` + `right: 12px` + CSS transition for smooth repositioning.
- At full snap (0.92): page passes `-9999` to push the button off-screen since the map is mostly covered.
- Keeping the button inside VanTrackingMap avoids splitting state management (showRecenter state + recenter handler stay internal).
