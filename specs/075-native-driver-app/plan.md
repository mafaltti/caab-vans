# Implementation Plan: Native Driver App

**Branch**: `075-native-driver-app` | **Date**: 2026-03-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/075-native-driver-app/spec.md`

## Summary

Build the primary driver experience natively in the Expo van-tracker app. The work spans two codebases: (1) server-side — extend auth to accept bearer tokens and add bound-van enforcement to 7 driver endpoints, (2) Expo app — add Supabase Auth, driver login, route list, active route monitoring, exception handling, shift orchestration, and tracking lifecycle integration. No database migration required; all endpoints and response shapes remain backward-compatible.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16 server + Expo SDK 55 / React Native 0.83)
**Primary Dependencies**: Next.js App Router, Supabase Auth (`@supabase/ssr` server, `@supabase/supabase-js` native), expo-location, expo-task-manager, expo-router, expo-secure-store
**Storage**: PostgreSQL via Supabase (server, unchanged), AsyncStorage + SecureStore + Android device-protected SharedPreferences (native)
**Testing**: Vitest (server), manual Android acceptance (native)
**Target Platform**: Android (Expo/React Native) + Next.js server (Node.js)
**Project Type**: Mobile app (driver surface) + web service (BFF API)
**Performance Goals**: 5s polling interval, <3s exception actions, <30s reboot recovery, <60s sign-in-to-shift-start
**Constraints**: Offline-capable tracking (500-point buffer, 24h TTL), no DB migration, backward-compatible API
**Scale/Scope**: ~5-10 vans, ~10-15 drivers, 7 screens in Expo app, 7 server endpoint updates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Simplicity (KISS/DRY/YAGNI)** | PASS | No new abstractions beyond what's needed. Direct fetch instead of adding TanStack Query. Reuses existing tracking infrastructure. |
| **II. Explicit Trade-offs** | PASS | Trade-offs documented in research.md (fetch vs TanStack Query, SDK vs custom JWT). |
| **III. Branch & Merge Discipline** | PASS | Feature branch `075-native-driver-app` from `dev`. PRs target `dev`. |
| **IV. Quality Gates** | PASS | Server changes tested with Vitest. Lint + typecheck enforced. |
| **V. Stack Constraints** | PASS | Server: Next.js Route Handlers + Zod. Native: Expo SDK 55. No Edge Functions. Service role key server-only. |
| **Security Constraints** | PASS | Anon key used in native client (public). Service role key stays server-only. Bearer token validated server-side via Supabase Auth. |
| **Timezone** | PASS | All times in `America/Bahia`. Schedule times in HH:mm. |

### Post-Design Re-Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Simplicity** | PASS | No new npm dependencies on server. One new dep on native (`@supabase/supabase-js`). Storage split is minimal (3 modules). |
| **II. Trade-offs** | PASS | Documented: polling via setInterval (simpler) vs TanStack Query (heavier). AsyncStorage session adapter (standard) vs custom storage. |
| **V. Stack Constraints** | PASS | Computed fields (ETA, status) remain in BFF. Native app only displays server-computed values. |
| **Security** | PASS | Bearer tokens validated via `supabase.auth.getUser(token)`. Bound-van validated via ingestion token (same as tracking endpoints). No new secrets exposed to client. |

## Project Structure

### Documentation (this feature)

```text
specs/075-native-driver-app/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Entity definitions
├── quickstart.md        # Getting started guide
├── contracts/
│   ├── server-auth.md   # Auth contract changes
│   └── native-api-client.md  # Native API usage
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# Server (Next.js) — modifications to existing files
src/
├── lib/
│   ├── api/
│   │   └── auth.ts                    # Add requireAuth(request), requireBoundVan()
│   └── supabase/
│       └── server.ts                  # Add createBearerClient()
├── app/
│   └── api/
│       ├── driver/
│       │   └── routes/
│       │       ├── route.ts           # Add bound-van filtering
│       │       └── [routeId]/
│       │           └── route.ts       # Add bound-van rejection
│       └── routes/
│           └── [routeId]/
│               ├── start/route.ts     # Add bound-van rejection
│               ├── end/route.ts       # Add bound-van rejection
│               ├── confirm-start-stop/route.ts
│               ├── skip-stop/route.ts
│               └── detour/route.ts

# Expo App — new and modified files
apps/van-tracker/
├── app/
│   ├── _layout.tsx                    # Bootstrap gate + shift-gated recovery (MODIFY)
│   ├── login.tsx                      # Driver login screen (NEW)
│   ├── device-setup.tsx               # Refactored from settings.tsx (NEW)
│   ├── (driver)/
│   │   ├── _layout.tsx                # Driver group layout (NEW)
│   │   ├── index.tsx                  # Route list screen (NEW)
│   │   └── routes/
│   │       └── [routeId].tsx          # Active route screen (NEW)
│   ├── support.tsx                    # Support area entry (NEW)
│   ├── index.tsx                      # Existing home — repurposed/removed (MODIFY)
│   ├── settings.tsx                   # Remove from main nav (MODIFY)
│   └── diagnostics.tsx                # Move under support (MODIFY)
├── src/
│   ├── lib/
│   │   ├── supabase-client.ts         # Supabase auth client (NEW)
│   │   └── driver-api.ts              # fetchWithDriverAuth() helper (NEW)
│   ├── storage/
│   │   ├── settings.ts                # Rename type to DeviceProvisioning (MODIFY)
│   │   ├── driver-session.ts          # Driver session storage (NEW)
│   │   ├── shift-state.ts             # Shift state + device-protected sync (NEW)
│   │   ├── device-protected-state.ts  # Add shiftActive/activeRouteId (MODIFY)
│   │   └── tracking-state.ts          # Existing (no changes)
│   ├── hooks/
│   │   └── use-shift-reconciliation.ts # Server reconciliation hook (NEW)
│   ├── location/
│   │   └── tracking.ts               # Decouple permissions (MODIFY)
│   ├── components/
│   │   ├── next-stop-hero.tsx         # Next stop display (NEW)
│   │   ├── tracker-health.tsx         # Tracker health panel (NEW)
│   │   ├── schedule-timeline.tsx      # Stop timeline (NEW)
│   │   ├── exception-drawer.tsx       # Skip/detour/navigate actions (NEW)
│   │   ├── cold-start-dialog.tsx      # Cold-start stop selection (NEW)
│   │   └── route-card.tsx             # Route list item (NEW)
│   └── types/
│       └── driver.ts                  # Driver-specific types (NEW)

# Android native — modifications
apps/van-tracker/android/
└── app/src/main/java/com/caab/vantracker/
    └── DeviceProtectedStorage.kt      # Add shiftActive/activeRouteId (MODIFY)
```

**Structure Decision**: This feature spans the existing server (Next.js under `src/`) and the existing Expo app (under `apps/van-tracker/`). No new top-level directories. Server changes are limited to auth helpers and 7 existing endpoint files. Expo changes add new screens via the existing expo-router file system and new storage/lib modules following the established pattern.

## Complexity Tracking

> No constitution violations. All changes follow existing patterns.

| Decision | Rationale | Simpler Alternative Rejected |
|----------|-----------|------------------------------|
| `@supabase/supabase-js` in Expo | Required for auth — SDK handles token refresh, session persistence | Manual JWT management is error-prone and reinvents SDK features |
| 3 storage modules (provisioning, session, shift) | Different lifecycles and access patterns | Single settings object conflates support-managed config with driver state |
| Device-protected storage expansion | Android boot resilience for shift state | AsyncStorage alone is inaccessible before device unlock |
