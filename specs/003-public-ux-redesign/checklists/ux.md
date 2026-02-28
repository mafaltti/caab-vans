# UX Requirements Quality Checklist: Public Screens UX Redesign

**Purpose**: Validate visual design, interaction, and animation requirements for completeness, clarity, and consistency before implementation.
**Created**: 2026-02-28
**Feature**: [spec.md](../spec.md)
**Focus**: Visual & Interaction requirements quality
**Depth**: Standard (pre-implementation review)

## Requirement Completeness

- [ ] CHK001 - Are visual styling requirements defined for all three route card states (active, inactive, loading skeleton)? [Completeness, Spec §FR-001/FR-002/FR-017]
- [ ] CHK002 - Are the hero card's three display states (active with next stop, schedule ended, no schedule) each specified with distinct visual treatments? [Completeness, Spec §FR-003, Edge Cases]
- [ ] CHK003 - Is the gradient direction, color stops, and fallback for the hero card background explicitly specified? [Completeness, Spec §FR-003]
- [ ] CHK004 - Are loading skeleton shapes defined for all redesigned component types (route card, hero card, timeline, announcement card)? [Completeness, Spec §FR-017]
- [ ] CHK005 - Are all icon requirements specified with exact icon names from the Lucide library (Bus, MapPin, Clock, Navigation, CheckCircle2, Pin, AlertCircle, Info, etc.)? [Completeness, Gap]
- [ ] CHK006 - Is the decorative blur circle element on the hero card specified with size, position, opacity, and blur radius? [Completeness, Gap]
- [ ] CHK007 - Are empty state visual requirements defined for all four empty scenarios (no routes, no stops, no announcements, schedule ended)? [Completeness, Spec Edge Cases]

## Requirement Clarity

- [ ] CHK008 - Is "colored left accent" on active route cards quantified with specific width, color value, and positioning? [Clarity, Spec §FR-002]
- [ ] CHK009 - Is "pulsing dot indicator" defined with animation timing, size, and color? [Clarity, Spec §FR-002]
- [ ] CHK010 - Is "gradient hero card" specified with exact gradient colors, direction, border-radius, and shadow values? [Clarity, Spec §FR-003]
- [ ] CHK011 - Is "frosted-glass background effect" on the sticky header defined with specific opacity, blur radius, and fallback behavior? [Clarity, Spec §FR-007]
- [ ] CHK012 - Is "highlighted icon container" for the active bottom nav tab specified with background color, size, and padding? [Clarity, Spec §FR-008]
- [ ] CHK013 - Is "notification dot" dimensioned with specific size, color, border, and positioning relative to the tab icon? [Clarity, Spec §FR-009]
- [ ] CHK014 - Is "colored accent bar" on urgent announcements specified with width, color, and positioning? [Clarity, Spec §FR-011]
- [ ] CHK015 - Are badge typography requirements ("URGENTE"/"INFORMATIVO") specified with font size, weight, letter-spacing, and casing? [Clarity, Spec §FR-010]

## Interaction State Consistency

- [ ] CHK016 - Are hover/focus state requirements consistently defined for all interactive card types (route cards, announcement cards)? [Consistency, Spec §FR-014]
- [ ] CHK017 - Is the scale-down feedback effect specified with consistent scale values across all tappable cards? [Consistency, Spec §FR-014]
- [ ] CHK018 - Are shadow elevation changes on hover/tap consistently specified across route cards and announcement cards? [Consistency, Gap]
- [ ] CHK019 - Are the chevron icon interaction states (color shift, position shift) specified for the route card? [Completeness, Spec §US1 AS5]
- [ ] CHK020 - Is the "Abrir localizacao ao vivo" button interaction state (hover, active, disabled) defined? [Gap]
- [ ] CHK021 - Are touch target size requirements (min-height 44px) maintained or explicitly restated for all redesigned interactive elements? [Consistency, Gap]

## Animation & Transition Requirements

- [ ] CHK022 - Are page transition animation parameters defined with specific duration, easing, and direction for each variant (fade-slide-up, slide-from-right)? [Clarity, Spec §FR-013]
- [ ] CHK023 - Is the list entry stagger animation specified with delay increment between items? [Clarity, Gap]
- [ ] CHK024 - Are enter AND exit animations both specified for all page transitions (not just enter)? [Completeness, Spec §FR-013, US5 AS3]
- [ ] CHK025 - Is the pulsing animation on the current timeline node specified with distinct parameters from the status badge pulse? [Consistency, Spec §FR-005]
- [ ] CHK026 - Is the reduced-motion behavior specified for each individual animation type (page transitions, scale feedback, pulsing dots, list stagger)? [Completeness, Spec §FR-015]
- [ ] CHK027 - Are animation performance budgets defined (e.g., 60fps target, no layout thrashing)? [Gap]
- [ ] CHK028 - Is the "bounce" animation on the Navigation icon in the hero card specified? [Gap]

## Visual Hierarchy & Typography

- [ ] CHK029 - Are font size, weight, and color defined for the "PROXIMA PARADA" label in the hero card? [Clarity, Spec §FR-003]
- [ ] CHK030 - Are font sizing differences between the route card title, progress text, and next-stop text explicitly specified? [Clarity, Spec §FR-001]
- [ ] CHK031 - Is the "Parada atual / Proxima" label on the current timeline stop specified with font size, weight, and color? [Clarity, Spec §FR-005]
- [ ] CHK032 - Are timestamp formatting and color requirements consistent between the hero card and announcement cards? [Consistency, Spec §FR-003/FR-010]
- [ ] CHK033 - Is monospace font usage for time values consistently specified across route cards, hero card, and timeline stops? [Consistency, Gap]

## Timeline Component Specificity

- [ ] CHK034 - Is the vertical connecting line specified with width, color, and positioning relative to timeline nodes? [Clarity, Spec §FR-005]
- [ ] CHK035 - Are timeline node sizes specified for all three states (past, current, future) with consistent dimensions? [Clarity, Spec §FR-005]
- [ ] CHK036 - Is the "Ver X paradas anteriores" button specified with visual treatment (position, color, icon, typography)? [Clarity, Spec §FR-006]
- [ ] CHK037 - Is the expand/collapse animation for past stops specified (instant toggle vs. animated reveal)? [Gap, Spec §FR-006]
- [ ] CHK038 - Are spacing requirements between timeline entries defined? [Gap]

## Color System Consistency

- [ ] CHK039 - Are the emerald/rose semantic color usages specified consistently across all components (status badge, accent bar, notification dot, type badges)? [Consistency, Plan §R2]
- [ ] CHK040 - Is the color scheme for inactive/muted states consistently defined (route card icon, status badge, timeline past nodes)? [Consistency, Gap]
- [ ] CHK041 - Are color contrast ratios for text on gradient backgrounds (hero card white text on blue-indigo) addressed? [Gap, Accessibility]

## Scenario Coverage

- [ ] CHK042 - Is the route card visual treatment specified when `scheduleStatus` is `not_started` (distinct from `ended` and `active`)? [Coverage, Gap]
- [ ] CHK043 - Are requirements defined for the hero card's outdated location warning indicator (icon, color, position, text)? [Completeness, Spec Edge Cases]
- [ ] CHK044 - Is the bottom nav tab behavior specified when the user is on a route detail page (which tab appears active)? [Coverage, Gap]
- [ ] CHK045 - Are requirements specified for the back button ("Voltar") visual treatment (icon, text, padding, tap target)? [Gap]

## Notes

- Check items off as completed: `[x]`
- Items marked [Gap] indicate requirements that may need to be added to the spec
- Items marked [Clarity] indicate requirements that exist but need more specific parameters
- Items marked [Consistency] indicate requirements that should be cross-checked across components
- This checklist evaluates REQUIREMENTS QUALITY, not implementation correctness
