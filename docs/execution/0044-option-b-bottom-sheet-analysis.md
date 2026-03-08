# Option B — Bottom Sheet Implementation Analysis

## Overview

This analysis covers the best approaches to implement the **map-as-background + bottom sheet** pattern (Option B) for the CAAB Vans route detail page. The goal: a mobile-first, Uber/Lyft-grade tracking experience built on the existing design system and MapLibre infrastructure.

---

## 1. Bottom Sheet Library Selection

### Candidates Evaluated

| Library | Approach | Bundle (gzip) | SSR-safe | Gesture Quality | Accessibility |
|---|---|---|---|---|---|
| **Vaul** (Emil Kowalski) | Headless drawer/dialog | ~5 KB | Yes | Excellent (spring physics) | Built-in ARIA, focus trap |
| react-spring-bottom-sheet | Spring-based sheet | ~15 KB | Partial | Good | Basic |
| Custom (Framer Motion) | DIY with existing dep | 0 KB extra | Yes | Good (needs work) | Manual |
| CSS-only (scroll-snap) | Pure CSS | 0 KB | Yes | Poor (no velocity) | Manual |

### Recommendation: **Vaul via shadcn/ui Drawer**

**Why:**

1. **Already part of our design system** — Vaul is the drawer primitive used by shadcn/ui's `<Drawer>` component. Installation is a single command: `pnpm dlx shadcn@latest add drawer`. This gives us a pre-styled Drawer component with Tailwind classes matching our existing UI.
2. **Snap points built-in** — supports `snapPoints={[0.25, 0.55, 0.92]}` out of the box with spring physics.
3. **iOS Safari rubber-banding handled** — Vaul specifically solves the notorious iOS viewport bounce issue during sheet drag.
4. **Focus trap & ARIA** — Built on Radix Dialog, providing `role="dialog"`, focus management, and keyboard escape automatically.
5. **Zero extra bundle** — since shadcn/ui is already in the project, adding the Drawer component adds only Vaul's ~5 KB.
6. **Massive adoption** — 8.2k GitHub stars, 357k+ projects using it.

**Trade-off:** Vaul's repo is marked "unmaintained" by Emil Kowalski (as of late 2024) — "might come back to it but not in the near future." Latest release v1.1.2 (Dec 2024). Despite this label, the library is stable, battle-tested, and still widely used. The "unmaintained" risk is mitigated by the fact that it's a focused library with no critical bugs outstanding.

**Trade-off:** Vaul was designed for drawers/modals, not persistent "always-on" bottom sheets. We'll need to keep it permanently open (`modal={false}`, no backdrop, `dismissible={false}`) and control snap points via state.

**Alternatives considered:**

| Library | Verdict |
|---|---|
| **react-modal-sheet** | Built on Motion (our existing animation lib). Good API with `snapTo(index)` and exposed motion values. Strong fallback if Vaul proves insufficient. But adds a separate dep outside the shadcn ecosystem. |
| **react-spring-bottom-sheet** | Good accessibility, but introduces react-spring (we use Motion). Different animation system = increased bundle + cognitive overhead. |
| **Custom (Motion/Framer Motion)** | Zero new deps but requires building snap-point logic, velocity snapping, scroll-lock coordination, and iOS Safari fixes from scratch. Not justified when Vaul solves all of these. |
| **CSS-only (scroll-snap)** | Technically elegant but CSS scroll-driven animations have spotty browser support (Chromium best, Firefox/Safari need JS fallback). Too risky for a production transit app. |

---

## 2. Snap Point Architecture

### Three States

| State | Sheet Height | Content Visible | Map Visible | Use Case |
|---|---|---|---|---|
| **Peek** | ~200px (~25%) | Next stop + ETA chip + progress bar | ~75% of map | Quick glance while watching the map |
| **Half** | ~55vh | + Upcoming stops timeline | ~45% of map | Checking schedule while still seeing van position |
| **Full** | ~92vh | Complete timeline + past stops toggle | Header + map peek | Reviewing full schedule |

### Snap Point Values

```tsx
const SNAP_POINTS = [0.25, 0.55, 0.92] as const;
const DEFAULT_SNAP = 0.25; // peek

// Vaul usage:
<Drawer.Root
  snapPoints={SNAP_POINTS}
  activeSnapPoint={activeSnap}
  setActiveSnapPoint={setActiveSnap}
  modal={false}        // no backdrop, no body scroll lock
  dismissible={false}  // always visible when route is running
>
```

### Content Strategy Per State

**Peek (0.25):**
- "Próxima parada" label with bounce icon
- Stop name (truncated with ellipsis)
- Scheduled time
- ETA chip (large number + "min")
- Compact progress bar (7 segments representing stops)

**Half (0.55):**
- Everything from Peek
- Divider
- "Horários" section title with "Ver N paradas anteriores" toggle
- Upcoming stops timeline (current + future only)

**Full (0.92):**
- Everything from Half
- Past stops (expanded or toggled)
- Full scrollable timeline
- Bottom safe area padding

---

### Important: zinc-* Not slate-*

The TECH.md mentions `bg-slate-50`, but the actual codebase consistently uses **`zinc-*`** everywhere (shadcn base color is `zinc`). All new components must use `zinc-*` tokens:
- Page bg: `bg-zinc-50` (#fafafa)
- Cards: `bg-white`
- Text: `text-zinc-900`, `text-zinc-500`, `text-zinc-400`
- Borders: `border-zinc-100`, `border-zinc-200/50`

---

## 3. Layout Architecture

### Current Layout (Option A)
```
PublicLayout > main (scrollable, padded, max-w-lg)
  └─ RouteDetailPage
       ├─ StickyHeader (fixed top)
       ├─ HeroCard
       ├─ VanTrackingMap (250px card, conditional)
       └─ ScheduleTimeline
```

### Proposed Layout (Option B)
```
RouteDetailPage (no PublicLayout wrapper for this page)
  ├─ StickyHeader (fixed top, z-30, glassmorphism)
  ├─ MapContainer (absolute fill, z-0)
  │    ├─ VanTrackingMap (fullscreen, no rounded corners)
  │    └─ FloatingControls (z-10, positioned above sheet)
  │         └─ RecenterButton
  └─ BottomSheet (z-20, persistent, three snap points)
       ├─ GrabHandle
       └─ SheetContent (scrollable within sheet)
            ├─ PeekSection (next stop + ETA + progress bar)
            ├─ Divider
            └─ ScheduleTimeline (reused, full timeline)
```

### Key Layout Changes

1. **Route detail page opts out of `PublicLayout`'s `<main>` padding and max-width** — the map needs full bleed. Options:
   - Use a route group `(public-map)` with its own layout (no padding, no `<main>` wrapper)
   - Or conditionally render the layout wrapper based on route

2. **No `BottomNav`** on this page — the bottom sheet occupies the bottom area. The back button in the header provides navigation. This matches Uber/Google Maps behavior.

3. **Map is always mounted** (when route is running + has coordinates) — no conditional card rendering. The map fills the viewport behind the sheet.

4. **Header remains fixed** with the same glassmorphism style (`bg-zinc-50/90 backdrop-blur-md`).

---

## 4. Map Adaptation

### Changes from Card to Fullscreen

| Aspect | Option A (Current) | Option B (Proposed) |
|---|---|---|
| Container | `h-[250px] rounded-2xl overflow-hidden` | `position: absolute; inset: 0; top: headerHeight` |
| Corners | `rounded-2xl` | None (full bleed) |
| Shadow | `shadow-sm` | None |
| Attribution | Compact, bottom-right | Compact, above sheet peek area |
| Padding on fitBounds | 40px uniform | Top: 80px (header), Bottom: 220px (sheet peek), Sides: 40px |
| Re-center button | Bottom-right of card | Floating above sheet, right-aligned |

### Map Interaction with Sheet

```tsx
// Dynamic fitBounds padding based on sheet state
const mapPadding = useMemo(() => {
  switch (activeSnap) {
    case 0.25: return { top: 80, bottom: 220, left: 40, right: 40 };
    case 0.55: return { top: 80, bottom: window.innerHeight * 0.55, left: 40, right: 40 };
    case 0.92: return { top: 80, bottom: window.innerHeight * 0.85, left: 40, right: 40 };
  }
}, [activeSnap]);
```

**Critical:** When the sheet expands, the visible map area shrinks. Auto-centering should account for the sheet height so the van marker stays in the visible portion.

### Reusing `VanTrackingMap`

The existing component can be refactored:
1. Remove the `h-[250px] rounded-2xl overflow-hidden shadow-sm bg-white` wrapper — that's the card mode.
2. Accept a `variant: "card" | "fullscreen"` prop (or separate wrapper components).
3. The marker logic, animation, auto-centering, and stale handling remain identical.
4. `fitBounds` padding becomes dynamic based on sheet state.

---

## 5. Component Architecture

### New Components

```
src/components/public/
  ├── route-detail-sheet.tsx      # Bottom sheet wrapper (Vaul)
  ├── route-detail-peek.tsx       # Peek section content
  ├── route-progress-bar.tsx      # Compact progress bar
  └── van-tracking-map.tsx        # Modified: support fullscreen variant
```

### `RouteDetailSheet`

```tsx
// Simplified structure
export function RouteDetailSheet({ route, serverTime }: Props) {
  const [activeSnap, setActiveSnap] = useState(0.25);

  return (
    <Drawer.Root
      snapPoints={[0.25, 0.55, 0.92]}
      activeSnapPoint={activeSnap}
      setActiveSnapPoint={setActiveSnap}
      modal={false}
      dismissible={false}
    >
      <Drawer.Portal>
        <Drawer.Content>
          <GrabHandle />
          <PeekSection nextStop={...} etaMinutes={...} />
          <Divider />
          <ScheduleTimeline ... />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

### `RouteProgressBar`

New compact component showing route completion:

```tsx
// Visual: ■ ■ ■ ▣ □ □ □
// Each segment = one stop. Filled = passed, partial = current, empty = future
export function RouteProgressBar({
  totalStops,
  passedCount,
  currentProgress, // 0-1 within current segment
}: Props) { ... }
```

---

## 6. State Management

### Sheet State

```tsx
type SheetState = 'peek' | 'half' | 'full';

// Controlled via Vaul's activeSnapPoint
// Map responds to sheet state changes for:
// 1. Padding adjustment (fitBounds)
// 2. Floating controls position
// 3. Map interaction enabled/disabled (optional: disable map touch when sheet is full)
```

### User Interaction Tracking

Same pattern as current `userInteractedRef`:
- When user pans the map → show re-center button
- Re-center button resets tracking
- Sheet drag does NOT count as map interaction

### HeroCard Replacement

The HeroCard's content merges into the sheet's peek section:
- "Próxima parada" label → peek section
- Stop name + time → peek section
- ETA → ETA chip (right-aligned, prominent)
- Location warning → stale overlay on map (already exists in Option A)

Non-running states (waiting, completed, fora de operação) should **not** show the bottom sheet. Fall back to the current Option A layout for those states:
- Show HeroCard (waiting/completed state)
- Show ScheduleTimeline as a card
- No map, no sheet

---

## 7. Gesture & Scroll Coordination

### The Core Challenge

The bottom sheet has conflicting touch targets:
1. **Sheet drag** (grab handle + sheet surface) — vertical gesture to change snap point
2. **Timeline scroll** (sheet content) — vertical scroll within the sheet when at full height
3. **Map pan/zoom** — touch gestures on the map behind the sheet

### Solution

```
┌─────────────────────────┐
│ Header (no gestures)    │  ← z-30, pointer-events: auto
├─────────────────────────┤
│                         │
│  MAP                    │  ← z-0, touch-action: auto (pan/zoom)
│  (visible behind sheet) │
│                         │
├═════════════════════════┤  ← sheet boundary
│ ═══ Grab Handle ═══     │  ← DRAG ZONE: sheet drag only
│                         │
│ Content (scrollable)    │  ← SCROLL ZONE: scroll content, NOT drag
│                         │
└─────────────────────────┘
```

**Rules:**
1. **Grab handle area** → always drags the sheet (Vaul handles this).
2. **Sheet content** → scrolls content when sheet is at full snap; drags sheet when at peek/half snap and content is at scroll top.
3. **Map area** → standard map gestures (pan, pinch-zoom). When sheet is at half/full, the visible map area is smaller but still interactive.

Vaul handles most of this automatically:
- It uses the `scrollable` prop to coordinate scroll vs. drag.
- At non-full snap points, touching content area drags the sheet.
- At full snap point, content scrolls; dragging down from scroll-top collapses the sheet.

---

## 8. Performance Considerations

### Map Rendering

- **Full-screen MapLibre** performs better than a constrained card because WebGL can use the full GPU viewport.
- **No re-mounting:** The map stays mounted across sheet state changes. Only the visible area changes.
- **Tile loading:** More visible area = more tiles to load. But MapLibre's tile cache handles this well.

### Sheet Animation

- Use `will-change: transform` on the sheet container.
- Vaul uses CSS transforms (GPU-accelerated), not layout properties.
- Avoid `position: fixed` on the sheet — use `position: absolute` within the page container to prevent mobile browser toolbar flickering.

### Bundle Impact

- **Vaul:** ~5 KB gzip (new dependency)
- **No other new deps** — MapLibre, react-map-gl, Motion, Lucide all already in the project.
- **Removed:** HeroCard import (merged into sheet) for running states.

### Lazy Loading

```tsx
const RouteDetailSheet = dynamic(
  () => import('@/components/public/route-detail-sheet').then(m => m.RouteDetailSheet),
  { ssr: false }
);
```

The sheet and map should both be dynamically imported since they depend on browser APIs.

---

## 9. Accessibility

### ARIA Structure

```html
<div role="region" aria-label="Acompanhamento da rota">
  <!-- Map -->
  <div role="img" aria-label="Mapa mostrando van próxima a TRT-5 (Paralela)">
    <a href="#route-sheet" class="sr-only">Pular mapa</a>
  </div>

  <!-- Bottom Sheet -->
  <div
    id="route-sheet"
    role="region"
    aria-label="Detalhes da rota"
    aria-live="polite"
  >
    ...
  </div>
</div>
```

### Keyboard Navigation

- Sheet snap points should be controllable via keyboard (Vaul supports this).
- `Escape` at full → collapse to half → collapse to peek.
- Tab order: Header → Skip link → Sheet content → Map controls.

### Screen Reader

- `aria-live="polite"` on the peek section for ETA updates.
- Dynamic `aria-label` on the map describing van position.
- Timeline items use semantic `<ol>` or `<ul>`.

---

## 10. iOS Safari & Mobile Browser Considerations

### Safe Areas

```css
/* Sheet must respect bottom safe area (iPhone notch) */
.sheet-content {
  padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px));
}

/* Header respects top safe area */
.header {
  padding-top: calc(16px + env(safe-area-inset-top, 0px));
}
```

### Viewport Height

Use `dvh` (dynamic viewport height) for the map container to handle mobile browser toolbar show/hide:

```css
.map-container {
  height: 100dvh;
}
```

Fallback: `height: calc(var(--vh, 1vh) * 100)` with a JS resize listener.

### iOS Rubber Banding

Vaul specifically handles this. Without Vaul, you'd need:
- `overscroll-behavior: contain` on the sheet content.
- `touch-action: none` on the grab handle.
- Prevent `touchmove` on the sheet background when scrolled to boundaries.
- Note: both shadcn/ui and MUI have open issues (Oct 2025) with bottom sheet gaps on iOS — Vaul's handling is the most battle-tested solution.

### iOS Touch Quirks

- Safari defaults `passive: true` for `touchstart` — must explicitly set `{ passive: false }` to call `preventDefault()`.
- `touch-action` behavior is unreliable on iOS 15.4+ for horizontal drags.
- Click events on non-clickable elements (divs/spans) require `cursor: pointer` or explicit handlers on iOS Safari.
- Body scroll lock on iOS is a "decade-long problem" — Vaul's solution (inherited from Radix) is the most reliable approach.

---

## 11. Migration Strategy

### Incremental Approach (Recommended)

**Phase 1: Infrastructure**
1. Add shadcn Drawer (`pnpm dlx shadcn@latest add drawer`) — this installs Vaul automatically
2. Create `RouteDetailSheet` component with three snap points
3. Create `RouteProgressBar` component
4. Modify `VanTrackingMap` to support fullscreen variant

**Phase 2: Layout Switch**
5. Create route-specific layout (no padding, no bottom nav)
6. Wire up the new layout for the route detail page
7. Conditional rendering: sheet layout for running routes, card layout for idle routes

**Phase 3: Polish**
8. Map padding responds to sheet state
9. Floating controls positioning
10. Stale data overlay on map
11. Transition animations between card → sheet when route starts

### Feature Flag / Conditional Rollout

Consider a simple check to roll this out gradually:

```tsx
// In route detail page
const useBottomSheet = route.isRunning && route.van.lastLat != null;

return useBottomSheet ? (
  <BottomSheetLayout route={route} />
) : (
  <CardLayout route={route} />  // existing Option A
);
```

This preserves Option A for non-running routes (where the map isn't shown anyway), and only activates Option B when the map would be visible.

---

## 12. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| iOS Safari gesture conflicts | Medium | High | Vaul handles this; test on real devices early |
| Sheet blocks map interaction | Low | Medium | `modal={false}` + proper z-indexing |
| Performance on low-end Android | Low | Medium | MapLibre WebGL already proven in Option A; sheet is lightweight CSS transforms |
| Vaul not supporting persistent (non-dismissible) sheet | Low | High | Already confirmed: `dismissible={false}` is supported |
| Users unfamiliar with sheet gesture | Medium | Low | Drag hint animation on first visit; grab handle is standard mobile pattern |
| Content overflow at peek state | Low | Low | Truncate stop names; fixed-height peek section |

---

## 13. Mockup Reference

Interactive HTML/CSS mockup: `docs/mockups/option-b-bottom-sheet.html`

Features demonstrated:
- Three sheet states (peek, half, full) with interactive toggle
- Exact design system tokens (colors, radii, shadows, typography)
- Map markers matching `VanTrackingMap` styles
- Route polyline (passed/upcoming segments)
- Stale data overlay toggle
- Touch-draggable grab handle
- Timeline matching `ScheduleTimeline` component
- "Ver paradas anteriores" toggle
- Progress bar
- Floating re-center button
- Status badge

---

## Bottom Line

**Use Vaul** as the bottom sheet primitive — it aligns with the shadcn/ui ecosystem, handles iOS Safari edge cases, and adds only ~5 KB. The three-snap-point architecture (peek/half/full) gives users the right amount of information at each level of engagement. The migration is incremental: Option A remains for non-running routes, Option B activates only when the map is relevant. The main engineering work is layout restructuring (full-bleed map, no padding wrapper) and making `VanTrackingMap` aware of the sheet's height for proper viewport fitting.
