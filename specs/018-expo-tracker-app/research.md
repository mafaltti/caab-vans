# Research: Expo Van Tracker App

**Date**: 2026-03-01 | **Branch**: `018-expo-tracker-app`

## Decision Log

### D1: Navigation Framework

- **Decision**: Expo Router (file-based routing)
- **Rationale**: Officially recommended by Expo, zero-config for 2 screens (`app/index.tsx` + `app/settings.tsx`), built on React Navigation internally. Minimal boilerplate.
- **Alternatives considered**: React Navigation standalone — rejected because it requires manual navigator setup that adds no value for a 2-screen app.

### D2: Local Storage

- **Decision**: `@react-native-async-storage/async-storage`
- **Rationale**: The canonical key-value storage for React Native / Expo. ~1.4M weekly downloads, actively maintained, listed in Expo docs. Unencrypted but acceptable — we store configuration data and a location buffer, not user credentials.
- **Alternatives considered**: `expo-secure-store` — rejected for general storage because it has a 2KB value size limit and is designed for secrets. The ingestion token is not a user credential (it's a per-van API key shared out-of-band), and AsyncStorage is simpler.

### D3: UUID Generation

- **Decision**: `expo-crypto` (`randomUUID()`)
- **Rationale**: Part of Expo SDK — zero additional dependencies. Cryptographically secure, synchronous, works on Android/iOS/web.
- **Alternatives considered**: `uuid` npm package — rejected because it requires a `react-native-get-random-values` polyfill to work in React Native. Extra dependency for no benefit.

### D4: Network Detection

- **Decision**: `@react-native-community/netinfo`
- **Rationale**: More reliable than `expo-network` (known state-update bug in expo-network, GitHub #37972). Provides event-based subscriptions (efficient, no polling). ~1.4M weekly downloads. Has `useNetInfo()` React hook.
- **Alternatives considered**: `expo-network` — rejected due to known connectivity state bug and polling-only API.

### D5: Expo SDK Version

- **Decision**: Use the latest stable Expo SDK at project creation time (currently SDK 52+). Use `npx expo install` for all Expo packages to auto-resolve compatible versions.
- **Rationale**: `npx expo install` handles version pinning. No need to lock to a specific SDK — the `create-expo-app` tool creates a project on the latest stable SDK.
- **Alternatives considered**: Pinning to SDK 52 for more community examples — unnecessary since background location APIs are stable across recent SDKs.

### D6: Project Structure (Standalone vs Monorepo)

- **Decision**: Standalone Expo project at `apps/van-tracker/` with its own `package.json`, `tsconfig.json`, and `app.json`. No monorepo tooling.
- **Rationale**: The existing repo is a single Next.js project (no workspace config). Adding workspace/monorepo tooling just for the tracker app violates YAGNI. A standalone directory with its own deps is simplest.
- **Alternatives considered**: npm workspaces — rejected because there's no shared code between the Next.js web app and the Expo tracker app. The only shared contract is the HTTP API.

### D7: Background Location Configuration

- **Decision**: Use `expo-location` `startLocationUpdatesAsync` with `foregroundService` option. Define task via `expo-task-manager` `defineTask` at global scope in a dedicated file.
- **Rationale**: This is the only supported approach for reliable background GPS on Android with Expo. The foreground service is exempt from most Doze mode restrictions.
- **Key configuration**:
  - `accuracy: Location.Accuracy.High` (~10m GPS precision)
  - `timeInterval: 3000` (3s between updates — matches spec throttle)
  - `distanceInterval: 5` (5m between updates — matches spec throttle)
  - `foregroundService.killServiceOnDestroy: false` (survive app swipe-away)
- **Gotchas**:
  - `defineTask()` MUST be at module top-level scope, not inside components
  - Permission request order: foreground first, then background (Android requirement)
  - Android 12+: foreground service can only start while app is in foreground (user action)
  - Android 13+: POST_NOTIFICATIONS permission must be requested for the notification
  - OEM battery killers (Samsung, Xiaomi, Huawei) may require user to whitelist the app

### D8: EAS Build Approach

- **Decision**: EAS Development Build with APK output for direct install on Android devices.
- **Rationale**: Background location and foreground services are NOT supported in Expo Go. EAS dev builds include `expo-dev-client` for development convenience (hot reload, dev tools) while supporting native modules.
- **Configuration**: `eas.json` with `development` profile: `developmentClient: true`, `distribution: internal`, `buildType: apk`.
- **Build command**: `eas build --platform android --profile development`

## Key Technical Constraints

1. **TaskManager global registration**: The background task must be defined at module scope and imported at app entry. This is Android's requirement — when the OS relaunches the app in background, only the JS bundle runs (no React components mount).

2. **Two-step permission flow**: Android mandates requesting foreground location before background location. Requesting background without foreground results in silent denial.

3. **Foreground service start restriction (Android 12+)**: Must start tracking from a user interaction while the app is in foreground. Cannot auto-start from a background event. Auto-resume on app launch works because the app is momentarily in foreground during launch.

4. **Doze mode**: Foreground services are largely exempt, but OEM-specific battery optimizations may still interfere. The README should document the "disable battery optimization" recommendation for drivers.

5. **No Expo Go**: Background location is only available in custom dev builds. The entire dev/test workflow requires EAS builds.
