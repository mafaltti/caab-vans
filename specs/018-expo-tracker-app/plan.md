# Implementation Plan: Expo Van Tracker App

**Branch**: `018-expo-tracker-app` | **Date**: 2026-03-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-expo-tracker-app/spec.md`

## Summary

Build a standalone Expo + TypeScript Android app at `apps/van-tracker/` that sends device GPS coordinates to the existing `POST /api/tracking/{vanId}` backend endpoint. The app uses `expo-location` + `expo-task-manager` as an Android foreground service to track location with the screen locked. It features two screens (Home for tracking control/status, Settings for API configuration), client-side throttling (5m/3s), offline buffering (50 points via AsyncStorage), and auto-resume on restart. Requires EAS Development Build (not Expo Go).

## Technical Context

**Language/Version**: TypeScript, Expo SDK (latest stable), React Native
**Primary Dependencies**: expo-location, expo-task-manager, expo-crypto, expo-router, @react-native-async-storage/async-storage, @react-native-community/netinfo, expo-dev-client
**Storage**: AsyncStorage (on-device key-value, ~6KB max usage)
**Testing**: Manual device testing (background location cannot be unit-tested; see quickstart.md for test procedure)
**Target Platform**: Android (API 31+, screen-locked background tracking)
**Project Type**: Mobile app (standalone Expo project within existing repo)
**Performance Goals**: Location updates every 3-5 seconds; POST requests complete within standard HTTP timeout
**Constraints**: Offline-capable (50-point buffer), battery-friendly (foreground service, not polling), must survive screen lock and Doze mode
**Scale/Scope**: Single-user app (one van per device), 2 screens, ~10 source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity (KISS/DRY/YAGNI) | PASS | Minimal deps (6 Expo packages), 2 screens, no state management framework, no over-abstraction |
| II. Explicit Trade-offs | N/A | Applies at PR time, not plan time |
| III. Branch & Merge | PASS | On feature branch `018-expo-tracker-app`, PR will target `dev` |
| IV. Quality Gates | PASS with deviation | Standalone Expo project — uses its own TypeScript check, not the Next.js build pipeline. No vitest (background location is manual-test only). Linting via ESLint configured within the Expo project. |
| V. Stack Constraints | JUSTIFIED DEVIATION | Constitution specifies Next.js + Tailwind stack for the web app. This is a **companion mobile app** (React Native / Expo) — it cannot use Next.js. It consumes the same BFF API but is a separate deliverable. No Supabase service role key is used (only the per-van ingestion token). |
| Security | PASS | No Supabase keys in mobile app. Ingestion token is a per-van API key (not a user credential or service role key). Stored in AsyncStorage (acceptable — not a secret requiring encryption). |
| Timezone | PASS | App sends UTC timestamps (`Date.now()`). Server handles `America/Bahia` conversion. |

### Post-Phase 1 Re-check

All gates remain PASS. The design adds no unnecessary complexity — every module maps 1:1 to a spec requirement.

## Project Structure

### Documentation (this feature)

```text
specs/018-expo-tracker-app/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: local storage entities
├── quickstart.md        # Phase 1: setup & test instructions
├── contracts/
│   └── tracking-api.md  # Phase 1: HTTP API contract
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/van-tracker/
├── app.json                    # Expo config (permissions, plugins)
├── eas.json                    # EAS build profiles
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
├── app/
│   ├── _layout.tsx             # Root layout (Stack navigator via Expo Router)
│   ├── index.tsx               # Home screen (start/stop + status)
│   └── settings.tsx            # Settings screen (API URL, Van ID, Token)
├── src/
│   ├── location/
│   │   ├── task.ts             # TaskManager.defineTask (global scope, imported at entry)
│   │   └── tracking.ts         # startTracking() / stopTracking() service wrapper
│   ├── api/
│   │   └── client.ts           # POST /api/tracking/{vanId} with auth header
│   ├── storage/
│   │   ├── settings.ts         # AsyncStorage: API URL, Van ID, Token
│   │   ├── device-id.ts        # AsyncStorage: persisted UUID (expo-crypto)
│   │   ├── buffer.ts           # AsyncStorage: offline location queue (max 50)
│   │   └── tracking-state.ts   # AsyncStorage: tracking-enabled flag, lastSentAt
│   └── lib/
│       └── haversine.ts        # Distance calculation for throttle (5m check)
└── README.md                   # Install, build, run, and test instructions
```

**Structure Decision**: Standalone Expo project in `apps/van-tracker/` with its own dependencies. No monorepo tooling (no shared code with the Next.js web app). Expo Router file-based routing under `app/`. Business logic under `src/` organized by domain (location, api, storage, lib).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Separate project (`apps/van-tracker/`) outside Next.js `src/` | React Native / Expo cannot run inside a Next.js project | No alternative — mobile apps require their own build pipeline |
| Stack deviation (React Native instead of Next.js) | Android native features (foreground service, background GPS) require a native runtime | Web-only PWA cannot access foreground services or reliable background GPS on Android |
