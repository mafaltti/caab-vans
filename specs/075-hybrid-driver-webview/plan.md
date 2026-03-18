# Implementation Plan: Hybrid Driver WebView in Tracker App

**Branch**: `075-hybrid-driver-webview` | **Date**: 2026-03-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/075-hybrid-driver-webview/spec.md`

## Summary

Add a Driver screen to the Expo tracker app that embeds the existing web `/driver` flow in a WebView, while keeping native GPS tracking separate. Restructure web auth so drivers log in through `/driver/login` instead of `/admin/login`. Add app-wide keep-awake in the foreground to reduce Android sleep/kill pressure on tracking.

**Technical approach**: The WebView wraps existing web pages (no new backend/API changes). Web auth restructure uses Next.js route groups to separate public login from protected driver pages. Keep-awake uses the imperative expo-keep-awake API with AppState listeners in the root layout.

## Technical Context

**Language/Version**: TypeScript (Next.js 16 + Expo SDK 55 / React Native 0.83)
**Primary Dependencies**: react-native-webview ~13.x (new), expo-keep-awake ~55.0.x (new), existing Next.js/Expo stack
**Storage**: N/A (no new storage; existing Postgres/Supabase unchanged)
**Testing**: Vitest (web unit tests), manual testing (native app)
**Target Platform**: Android (tracker app), Web (Next.js — all browsers)
**Project Type**: Mobile app + web service (hybrid feature spanning both)
**Performance Goals**: N/A (WebView loads existing pages; no new performance-critical paths)
**Constraints**: Android-only native app; cookie-based auth in WebView; no native-to-web SSO in v1
**Scale/Scope**: Single-user app (one driver per device); 5 modified files web-side, 4 modified/new files native-side

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | WebView wraps existing pages — no duplicated logic. `fetchWithDriverAuth` is a 2nd variant (not 3rd), but mirrors an existing pattern with a 1-line diff. Acceptable DRY exception. |
| II. Explicit Trade-offs | PASS | PR will document: (a) maps link `target="_blank"` removal degrades browser UX for WebView compatibility, (b) keep-awake is unconditional in foreground for simplicity. |
| III. Branch & Merge | PASS | Feature branch `075-hybrid-driver-webview` targets `dev`. |
| IV. Quality Gates | PASS | lint + typecheck + build will run. Manual testing for native. |
| V. Stack Constraints | PASS | Uses approved stack: Next.js App Router, Tailwind, Expo, TypeScript. No Edge Functions. |
| Security | PASS | No new keys exposed. Existing session-cookie auth reused. Service role key stays server-only. |
| Timezone | N/A | No date/time changes. |

### Post-Design Gate

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Simplicity | PASS | No new abstractions beyond the fetch helper. WebView screen is self-contained. Route group restructure is idiomatic Next.js. |
| II. Trade-offs | PASS | Documented in research.md: history shim for back navigation (standard pattern, not the prohibited popup bridge). Logout button gets a `redirectTo` prop (minimal change, no new component). |
| V. Stack Constraints | PASS | react-native-webview and expo-keep-awake are standard Expo ecosystem packages. |

## Project Structure

### Documentation (this feature)

```text
specs/075-hybrid-driver-webview/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: technology research
├── data-model.md        # Phase 1: data model (no new entities)
├── quickstart.md        # Phase 1: setup and verification
├── contracts/
│   └── web-routes.md    # Phase 1: new/modified web route contracts
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
# Native tracker app (apps/van-tracker/)
apps/van-tracker/
├── package.json                        # + react-native-webview, expo-keep-awake
├── app/
│   ├── _layout.tsx                     # + keep-awake (AppState-driven)
│   ├── index.tsx                       # + "Open Driver" CTA button
│   └── driver.tsx                      # NEW: WebView screen
└── src/
    └── hooks/
        └── useKeepAwakeWhileForeground.ts  # NEW: keep-awake hook

# Next.js web app (src/)
src/
├── middleware.ts                       # + /driver/login exception, driver redirect
├── lib/api/
│   └── fetch-with-driver-auth.ts       # NEW: driver-specific 401 handler
├── app/driver/
│   ├── login/
│   │   └── page.tsx                    # NEW: driver login page
│   └── (protected)/
│       ├── layout.tsx                  # MOVED from src/app/driver/layout.tsx
│       ├── page.tsx                    # MOVED from src/app/driver/page.tsx
│       └── routes/[routeId]/
│           └── page.tsx               # MOVED from src/app/driver/routes/[routeId]/page.tsx
├── components/
│   ├── admin/
│   │   └── logout-button.tsx           # + redirectTo prop
│   └── driver/
│       └── active-route/
│           └── exception-drawer.tsx    # remove target="_blank" from maps link
```

**Structure Decision**: This feature spans two existing project areas (native tracker app and Next.js web app) that are already separate. No new project directories or architectural boundaries are introduced.

## Complexity Tracking

No constitution violations. No complexity tracking needed.
