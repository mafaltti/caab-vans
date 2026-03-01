# Research: Align UI with AI Studio Prototype

**Feature**: `011-align-ui-aistudio` | **Date**: 2026-02-28

## Findings

No unknowns or NEEDS CLARIFICATION items existed in the Technical Context. This feature involves purely presentational changes to 3 existing React components using the existing Tailwind CSS utility classes.

### Decision: Reference Implementation

- **Decision**: Use the Google AI Studio prototype (`github.com/mafaltti/caab-vans-aistudio`, `src/App.tsx`) as the authoritative visual reference for all 4 layout changes.
- **Rationale**: The prototype was built as the design target. All layout patterns (flexbox arrangements, Tailwind classes, accent bar technique) are directly visible in the prototype source.
- **Alternatives considered**: None — the prototype is the single source of truth for this alignment task.

### Decision: Chevron Visibility on Inactive Cards

- **Decision**: Remove the chevron from route cards that lack a next-stop info bar (inactive/ended routes). The chevron only appears inside the info bar.
- **Rationale**: In the AI Studio prototype, the chevron lives inside the next-stop section. Cards without that section have no chevron. This is consistent and avoids a floating icon without navigational context.
- **Alternatives considered**: Always showing a chevron (current behavior) — rejected because it doesn't match the prototype and the card is still clickable via the full-card link.

### Decision: Toggle Behavior for Past Stops

- **Decision**: Make the "Ver paradas anteriores" button a bidirectional toggle (show/hide) instead of the current one-way reveal.
- **Rationale**: The AI Studio prototype implements show/hide toggling. This gives users control to collapse past stops after reviewing them, reducing visual clutter.
- **Alternatives considered**: Keeping the one-way reveal (current behavior) — rejected as it doesn't match the prototype.
