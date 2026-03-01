# Research: Clarify Next Stop Label

**Feature**: 013-clarify-next-stop-label
**Date**: 2026-03-01

## Findings

### 1. Current State of the Label

- **File**: `src/components/public/schedule-timeline.tsx`, line 145
- **Current text**: `Parada atual / Próxima`
- **Condition**: Rendered only when `stop.status === "current"`
- **Styling**: `text-xs text-blue-500` — unchanged by this feature

### 2. Consistency Audit

- **Hero card** (`src/components/public/hero-card.tsx`, line 80): Already uses `Próxima parada`.
- **No other components** reference the old "Parada atual / Próxima" wording (confirmed via codebase search).
- The old spec (`specs/003-public-ux-redesign/spec.md`, acceptance scenario 6) originally defined this as "Parada atual / Proxima" — this feature intentionally supersedes that label.

### 3. Decision

- **Decision**: Replace "Parada atual / Próxima" with "Próxima parada".
- **Rationale**: Aligns timeline label with hero card wording, removes ambiguity about current vs. next stop.
- **Alternatives considered**:
  - "Parada atual" (only current) — rejected: doesn't convey "upcoming" intent.
  - "Próxima" (short form) — rejected: "Próxima parada" is the established pattern in the hero card.
  - Keep current — rejected: user-reported confusion about the dual label.

## Unknowns Resolved

No NEEDS CLARIFICATION items existed in the spec or technical context. All decisions are straightforward.
