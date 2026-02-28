# Research: Public UX Alignment

**Date**: 2026-02-28
**Feature**: 006-public-ux-alignment

## R1: Safe-Area Padding in Tailwind CSS v4

**Decision**: Use inline `pb-[env(safe-area-inset-bottom)]` Tailwind arbitrary value.

**Rationale**: Tailwind CSS v4 does not include a built-in `pb-safe` utility class. The arbitrary value syntax `pb-[env(safe-area-inset-bottom)]` generates the correct CSS without needing a custom utility or plugin. The `<meta name="viewport">` tag must include `viewport-fit=cover` for `env(safe-area-inset-bottom)` to return a non-zero value on devices with safe areas. On devices without safe areas, it gracefully returns `0px`.

**Alternatives considered**:
- Custom `@utility pb-safe` in globals.css — adds complexity for a single use case. Rejected per YAGNI.
- Hardcoded padding — doesn't adapt to device-specific safe areas. Rejected.

## R2: Hero Card Button — Preserving Link Semantics

**Decision**: Use shadcn `Button` with `asChild` prop wrapping the existing `<a>` tag.

**Rationale**: The location button opens an external URL (Google Maps live location). Using `<a>` is semantically correct for navigation and better for accessibility (screen readers announce it as a link). shadcn/ui's `Button` component supports `asChild` via Radix Slot, which renders the `<a>` tag with button styling. This preserves both semantics and the reference design's visual appearance.

**Alternatives considered**:
- Replace `<a>` with `<button>` + `onClick` with `window.open()` — worse accessibility, loses right-click "open in new tab". Rejected.
- Use `Link` from Next.js — this is an external URL, not an internal route. Not applicable.

## R3: Badge Shape — rounded vs rounded-full

**Decision**: Override shadcn Badge's default `rounded-full` with `rounded` via className for announcement type badges only.

**Rationale**: The reference design uses a subtle rounded shape (not pill) for announcement type badges ("Urgente", "Informativo"), but the route status badge retains the pill shape (`rounded-full`). shadcn Badge defaults to `rounded-full`, but className overrides work cleanly since Tailwind Merge handles conflicting border-radius classes.

**Alternatives considered**:
- Add a new variant to Badge component — over-engineering for a single visual tweak. Rejected per YAGNI.
- Use plain spans instead of Badge — defeats the purpose of adopting shadcn components. Rejected.

## R4: Card Component Padding Overrides

**Decision**: Override `Card`'s default `py-6` and `CardContent`'s default `px-6` via className to match existing padding patterns.

**Rationale**: The shadcn Card component applies `py-6` and `gap-6` by default. The current route card uses `p-4` and announcement card uses `p-5`. Since we want to match the reference design's padding (which uses `p-4` for route cards and `p-5` for announcements), we'll override via className. Tailwind Merge handles the conflict resolution.

**Alternatives considered**:
- Modify the base Card component to remove default padding — would break admin components that rely on it. Rejected.

## R5: Viewport Meta Tag for Safe-Area

**Decision**: Verify and update the Next.js viewport meta tag to include `viewport-fit=cover`.

**Rationale**: For `env(safe-area-inset-bottom)` to work, the viewport meta tag must include `viewport-fit=cover`. Next.js App Router manages viewport config via the `viewport` export from `layout.tsx`. Need to ensure this is set in the root layout.

**Alternatives considered**:
- Skip safe-area support — would leave content behind home indicators on notched devices. Rejected per FR-026.
