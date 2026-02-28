# Research: Public Screens UX Redesign

**Branch**: `003-public-ux-redesign` | **Date**: 2026-02-28

## R1: Animation Library Choice

**Decision**: Add `motion` (formerly Framer Motion) as a new dependency.

**Rationale**: The spec requires AnimatePresence-style page transitions (fade+slide between routes list and detail, exit animations on back navigation), scale-on-tap feedback, and reduced-motion support. CSS-only animations (via `tw-animate-css` already installed) can handle hover states and simple keyframes, but coordinating enter/exit transitions across route changes requires a declarative animation orchestrator. `motion` is the lightweight successor to Framer Motion, is React 19 compatible, and provides `AnimatePresence`, `motion.div`, and `useReducedMotion` out of the box.

**Alternatives considered**:
- **CSS-only (`tw-animate-css`)**: Already installed. Handles hover/focus transitions but cannot coordinate page enter/exit or AnimatePresence patterns. Would require manual `onTransitionEnd` management and duplicate logic per page.
- **React Transition Group**: Lower-level, requires more boilerplate for the same result. Less ecosystem adoption for React 19.
- **View Transitions API**: Browser-native but limited support (no Safari as of 2026-02), not suitable for a production mobile-first app.

---

## R2: Color Palette Approach

**Decision**: Keep the existing Zinc base and Blue theme (per constitution). Extend with semantic Tailwind utility colors for status indicators: `emerald` for active/success, `rose` for urgent/danger. No changes to CSS custom properties or shadcn theme variables.

**Rationale**: The constitution locks "Zinc base, Blue theme" for shadcn/ui. The prototype uses `slate` instead of `zinc`, but the visual difference is minimal (both are gray scales). Adopting `slate` would mean changing the entire shadcn configuration for negligible visual gain. Instead, we use the existing `zinc` for structure and add `emerald`/`rose` Tailwind utilities directly in component classes for status-specific styling. This is already how the current app uses `green-600` and `red-300` — we're just shifting to `emerald` and `rose` for a warmer palette.

**Alternatives considered**:
- **Full palette migration to slate**: Would require reconfiguring shadcn/ui theme, touching all existing components (including admin). Violates KISS and expands scope beyond public screens.
- **Custom CSS variables for semantic colors**: Over-engineering for a small set of status colors. Tailwind utilities are simpler and more explicit.

---

## R3: Tab Navigation with Next.js App Router

**Decision**: Keep existing App Router page routes (`/` and a new `/avisos` replacing `/announcements`). Add a shared layout animation wrapper in the `(public)` layout that uses `motion`'s `AnimatePresence` to animate content transitions between routes. Add a Next.js redirect from `/announcements` to `/avisos`.

**Rationale**: Next.js App Router already provides client-side navigation with `<Link>` (no full page reload). The smooth tab-switching feel comes from wrapping page content in `AnimatePresence` with fade/slide animations. This preserves URL-based routing, browser history, deep linking, and SSR — while adding the visual smoothness specified. The URL change from `/announcements` to `/avisos` aligns with the PT-BR user base and the spec's tab labels.

**Alternatives considered**:
- **Client-side state with single route**: Would lose URL deep linking, SSR, and browser history. Rejected per clarification decision.
- **Parallel routes (Next.js `@` slots)**: Adds architectural complexity for marginal benefit. The two tabs are simple enough that standard page routes with animated transitions suffice.

---

## R4: Route Progress Data ("Parada X de Y")

**Decision**: Add two computed fields (`totalStops` and `currentStopIndex`) to the routes list BFF response (`GET /api/routes`). These are derived from existing `schedule_entries` data already loaded by the BFF.

**Rationale**: The routes list API currently doesn't include schedule count data. The route cards need "Parada X de Y" text (FR-001). The BFF already fetches schedule_entries to compute `nextStop`, so adding a count and index is trivial (no new DB query). This is an additive change — no existing fields are modified or removed, so existing consumers are unaffected. The constitution mandates computed fields in the BFF.

**Note on FR-016**: The spec says "no changes to backend behavior." This additive BFF change doesn't alter behavior — it adds two new fields to an existing response. Existing consumers ignore unknown fields.

**Alternatives considered**:
- **Client-side computation**: Impossible — routes list response doesn't include schedule entries array.
- **Separate API call per route**: Over-fetching, poor performance on list page. Violates KISS.
- **Remove progress from list cards**: Loses a key UX improvement from the prototype.

---

## R5: Timeline Stop Status Computation

**Decision**: Compute timeline stop status (`past`/`current`/`future`) client-side in the timeline component, using existing `schedule` array and `nextStop` from the route detail API response.

**Rationale**: The route detail API already returns the full schedule with times and the computed `nextStop`. Determining which stops are past/current/future is a simple time comparison using the existing `nextStop.time` as the pivot. This is purely a visual concern (only affects the detail page timeline rendering) and doesn't need cross-client consistency. Computing client-side avoids a BFF change and keeps the rendering logic co-located with the visual component.

**Exception to BFF rule**: The constitution says computed fields should be in the BFF "for consistency across clients." Since there is currently only one client (web), and this is a display-only computation (not a business rule), client-side computation is acceptable here. If a mobile client is added later, this can be moved to the BFF.

---

## R6: Notification Dot Data Source

**Decision**: The `BottomNav` component will call `useAnnouncements()` and derive the urgent flag client-side by checking `announcements.some(a => a.isUrgent)`.

**Rationale**: TanStack Query deduplicates requests with the same query key. If the user has already visited the Avisos tab, the data is cached. If not, the BottomNav triggers the fetch (which is lightweight — the announcements endpoint already filters to non-expired only). No new API endpoint or BFF change needed.

**Alternatives considered**:
- **Dedicated lightweight endpoint** (`GET /api/announcements/urgent-count`): Over-engineering for a boolean check. Violates YAGNI.
- **Pass flag from parent**: Would require the public layout to fetch announcements, coupling layout to announcement data. Less clean than letting the nav component own its data needs.
