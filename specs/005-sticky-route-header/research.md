# Research: Sticky Route Detail Header

## R-001: CSS `position: sticky` within the layout scroll context

**Decision**: Use `sticky top-0 z-20` on the header div. Pull the header out of the `space-y-6` content wrapper so it sits as a direct child of the page root, allowing it to stick relative to the viewport scroll.

**Rationale**: The public layout (`(public)/layout.tsx`) uses `min-h-screen bg-zinc-50` with a `<main>` that has `mx-auto max-w-lg px-4 pb-20 pt-6`. The page's content is rendered inside this `<main>`, and the body/viewport is the scroll container. CSS `position: sticky` works natively here — no JavaScript scroll listeners needed.

**Alternatives considered**:
- `position: fixed` — rejected because it removes the element from document flow, causing content to jump and requiring a spacer element. More complex, same visual result.
- JavaScript `IntersectionObserver` — rejected because `position: sticky` achieves the same effect with zero JS. KISS principle.

## R-002: Frosted glass effect with `backdrop-blur`

**Decision**: Use `bg-zinc-50/90 backdrop-blur-md` for the frosted glass effect, matching the project's zinc color palette.

**Rationale**: The AI Studio prototype uses `bg-slate-50/90 backdrop-blur-md`. This project uses zinc (not slate) per shadcn/ui configuration. The equivalent is `bg-zinc-50/90`. The `backdrop-blur-md` (12px blur) provides a visible but not heavy frosted effect. The 90% opacity (`/90`) ensures text remains readable over scrolling content (WCAG AA compliant for dark text on near-white background).

**Alternatives considered**:
- `backdrop-blur-sm` (4px) — too subtle, content beneath is too readable and distracting.
- `backdrop-blur-lg` (16px) — heavier than needed; `md` matches the AI Studio reference.
- Fully opaque background (`bg-zinc-50`) — rejected because the frosted glass effect is an explicit spec requirement.

## R-003: Border treatment

**Decision**: Use `border-b border-zinc-200/50` for a subtle bottom separator.

**Rationale**: Matches the AI Studio implementation directly. The `/50` (50% opacity) keeps the border subtle — visible enough to separate header from content but not visually heavy.

## R-004: Layout restructuring to support sticky

**Decision**: Split the page root into two siblings: (1) sticky header div, (2) content div with `space-y-6` and padding.

**Rationale**: Currently the header and content (HeroCard, ScheduleTimeline) are all inside a single `<div className="space-y-6">`. For `sticky` to work, the header needs to be a sibling of the content wrapper — not a child of it. The header gets its own padding (`px-4 py-4`) and the content wrapper retains `p-4 space-y-6`. This matches the AI Studio implementation structure.

**Key detail**: The public layout already applies `px-4` to `<main>`. The route detail page currently has no outer padding (it inherits from layout). After restructuring:
- The sticky header needs negative margin or its own padding to align with layout padding.
- Simplest approach: the page fragment already sits inside the layout's `px-4`, so the sticky header just needs `py-4` for vertical spacing and the border/background classes. No horizontal padding override needed.

## R-005: Loading skeleton consistency

**Decision**: Apply the same sticky structure to the loading skeleton state.

**Rationale**: FR-006 requires the loading state to mirror the sticky layout to prevent layout shift when data loads. The skeleton header wrapper gets the same `sticky top-0 z-20 bg-zinc-50/90 backdrop-blur-md border-b border-zinc-200/50` classes.
