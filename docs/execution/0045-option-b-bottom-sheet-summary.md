# Option B — Bottom Sheet: Deliverables Summary

## Deliverables

### 1. Interactive HTML/CSS Mockup

`docs/mockups/option-b-bottom-sheet.html` — open in any browser

**Interactive features:**

- **Three sheet states** — click Peek / Half / Full buttons (or drag the handle on touch devices)
- **Stale data toggle** — see how outdated GPS is handled
- **Past stops toggle** — expand/collapse past stops in the timeline
- All design tokens match the actual codebase (`zinc-*`, `blue-600`, `rounded-3xl`, Geist font)

### 2. Implementation Analysis

`docs/execution/0033-option-b-bottom-sheet-analysis.md`

**Key recommendations:**

| Topic | Recommendation |
|---|---|
| Library | Vaul via `shadcn@latest add drawer` — zero-config, already in our ecosystem |
| Snap points | Peek (25%), Half (55%), Full (92%) |
| Layout | Full-bleed map + persistent non-modal sheet; Option A remains for non-running routes |
| Map changes | Dynamic `fitBounds` padding based on sheet state |
| Gestures | Vaul handles drag/scroll coordination + iOS Safari edge cases |
| Risk | Vaul is "unmaintained" but stable (8.2k stars, 357k+ projects); `react-modal-sheet` as fallback |
