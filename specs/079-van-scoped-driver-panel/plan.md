# Implementation Plan: Van-Scoped Driver Panel

**Branch**: `079-van-scoped-driver-panel` | **Date**: 2026-03-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/079-van-scoped-driver-panel/spec.md`

## Summary

Pass `vanId` as a query parameter from the tracker WebView to the driver panel. The web panel reads it via `useSearchParams`, forwards it through the `useDriverRoutes` hook, and the API conditionally filters the routes query by `van_id`. Omitting `vanId` preserves current behavior (all assigned routes shown).

## Technical Context

**Language/Version**: TypeScript ~5, React 19, React Native (Expo SDK 55)
**Primary Dependencies**: Next.js 16 (App Router), TanStack Query, Expo WebView, Supabase JS client
**Storage**: PostgreSQL via Supabase (no schema changes)
**Testing**: Vitest (no affected test suites exist for these files)
**Target Platform**: Web (mobile browser) + Android tracker app
**Project Type**: Web service + mobile app (monorepo)
**Performance Goals**: N/A — adding one optional filter to an existing indexed query
**Constraints**: Backward compatibility required — omitting `vanId` must produce identical behavior to current code
**Scale/Scope**: 4 files modified, ~20 lines of net new code

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal change — one optional parameter threaded through 4 files. No new abstractions. |
| II. Explicit Trade-offs | PASS | Will be documented in PR description. |
| III. Branch & Merge Discipline | PASS | Feature branch `079-van-scoped-driver-panel`, PR targets `dev`. |
| IV. Quality Gates | PASS | Will run lint, typecheck, build before PR. |
| V. Stack Constraints | PASS | Uses existing stack: Next.js Route Handlers, TanStack Query, Supabase client, Expo WebView. |
| Security Constraints | PASS | `vanId` only narrows results within driver's existing assignment. Cannot widen access. Service-role key remains server-only. |
| Timezone & Data | N/A | No time/date changes. |

**Post-Phase 1 re-check**: All gates still pass. No new abstractions, dependencies, or schema changes introduced.

## Project Structure

### Documentation (this feature)

```text
specs/079-van-scoped-driver-panel/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files modified)

```text
src/
├── app/
│   ├── api/driver/routes/
│   │   └── route.ts             # Add optional vanId filter to GET handler
│   └── driver/(protected)/
│       └── page.tsx             # Read vanId from URL, pass to hook
└── lib/queries/
    └── use-driver-routes.ts     # Accept vanId param, include in key + URL

apps/van-tracker/app/
└── driver.tsx                   # Pass vanId from settings to WebView URL
```

**Structure Decision**: Existing monorepo structure — Next.js web app under `src/` and Expo tracker under `apps/van-tracker/`. No new files or directories needed; all changes are modifications to existing files.
