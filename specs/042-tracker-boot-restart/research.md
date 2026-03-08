# Research: Tracker Boot Restart

**Feature**: 042-tracker-boot-restart
**Date**: 2026-03-06

## Decision 1: Boot Restart Approach

**Decision**: BroadcastReceiver launches the app headlessly, which triggers the existing auto-resume logic in `_layout.tsx` → `startTracking()`.

**Rationale**: Reuses the existing JS tracking logic (throttle, buffer, backoff, battery-adaptive, diagnostics) without code duplication. The app auto-resume path is already battle-tested.

**Alternatives considered**:
- **BroadcastReceiver → directly start a custom ForegroundService (native Java)**: Would require duplicating all JS tracking logic (throttle, buffer, backoff, health metadata) in Kotlin. Maintenance nightmare with two parallel codebases. Rejected.
- **BroadcastReceiver → invoke expo-task-manager native APIs**: No public native API exists in expo-task-manager. The task invocation flow is internal to expo-location's native layer. Not feasible without custom native module work that breaks the Expo model. Rejected.

---

## Decision 2: Config Plugin Architecture

**Decision**: Single Expo config plugin (`plugins/withBootRestart.ts`) that uses `withAndroidManifest` to register the receiver + permissions, and `withDangerousMod` to inject the native Kotlin receiver and device-protected storage helper.

**Rationale**: Config plugins are the Expo-recommended way to modify native code without ejecting. The plugin runs at build time (EAS Build), injecting manifest entries and native source files. This approach is already used by `expo-location` and `@sentry/react-native/expo` in the project.

**Alternatives considered**:
- **Separate npm package for the plugin**: Over-engineering for a single project. A local plugin file is simpler and sufficient. Rejected per YAGNI.
- **Manual Android native editing (eject)**: Breaks Expo managed workflow, requires maintaining native code manually. Rejected.

---

## Decision 3: Device-Protected Storage

**Decision**: A tiny native Kotlin helper (`DeviceProtectedStorage`) injected by the config plugin, exposed to JS via React Native bridge. Stores only the `tracking_enabled` boolean flag in device-protected SharedPreferences.

**Rationale**: AsyncStorage uses credential-protected storage (inaccessible during Direct Boot). The boot receiver needs to read the tracking flag before unlock. A minimal native module (~30 lines of Kotlin) bridges this gap. The same SharedPreferences file is read by both the native BroadcastReceiver and the JS wrapper.

**Alternatives considered**:
- **Configure AsyncStorage to use device-protected context**: Not possible — AsyncStorage is hardcoded to credential-protected SharedPreferences. No configuration option exists.
- **Skip Direct Boot, use BOOT_COMPLETED only (after unlock)**: Simpler but creates a gap for unattended reboots (overnight OTA). Spec clarification chose Direct Boot. Rejected.
- **Store all settings in device-protected storage**: Over-engineering. Only the boolean flag is needed before unlock. Ingestion token (sensitive) stays in SecureStore (credential-protected). Rejected per KISS.

---

## Decision 4: Foreground Service Start from Boot Receiver

**Decision**: The BroadcastReceiver launches the React Native app via `startActivity()` with `FLAG_ACTIVITY_NEW_TASK`. The app's `_layout.tsx` auto-resume logic then calls `Location.startLocationUpdatesAsync()`, which starts the foreground service.

**Rationale**: Android 12+ grants boot receivers (BOOT_COMPLETED, LOCKED_BOOT_COMPLETED) an exemption to start foreground services. By launching the app activity, the JS auto-resume code runs, and the foreground service start happens within the exemption window. This avoids needing a custom native foreground service.

**Key constraint**: The `while-in-use` permission restriction for location foreground services on Android 12+ is handled because the boot receiver exemption explicitly covers foreground service starts within the receiver's execution window.

---

## Decision 5: Boot-Loop Guard Implementation

**Decision**: Store `last_boot_attempt` timestamp in device-protected SharedPreferences. BroadcastReceiver checks this before proceeding — if < 60 seconds since last attempt, skip.

**Rationale**: Simple, no external dependencies, persists across reboots (device-protected storage survives boot). The 60-second threshold matches the spec requirement (FR-009).

---

## Decision 6: App Update Handling

**Decision**: Register `MY_PACKAGE_REPLACED` broadcast in the same BroadcastReceiver. Same logic: check tracking flag, launch app if needed.

**Rationale**: Clarification session confirmed app updates should also trigger auto-resume. The same receiver handles all three broadcasts (LOCKED_BOOT_COMPLETED, BOOT_COMPLETED, MY_PACKAGE_REPLACED) with identical logic.

**Note**: `MY_PACKAGE_REPLACED` fires after credential-protected storage is available (app was running before update), so device-protected storage check is sufficient but credential-protected is also accessible.

---

## Decision 7: Plugin File Location

**Decision**: `apps/van-tracker/plugins/withBootRestart.ts` — local to the tracker app, not shared.

**Rationale**: The boot restart feature is specific to the tracker app. No other app in the repo needs it. A local plugin avoids premature abstraction (YAGNI, only 1 occurrence).

---

## Technical Findings

### Android Broadcast Receiver Registration

The manifest entry must include:
- `android:directBootAware="true"` — required for `LOCKED_BOOT_COMPLETED`
- `android:exported="true"` — required for receivers with intent filters (system broadcasts)
- Three intent filter actions: `LOCKED_BOOT_COMPLETED`, `BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`
- Permission: `RECEIVE_BOOT_COMPLETED` (normal permission, auto-granted)

### Expo Config Plugin Patterns

- `withAndroidManifest(config, callback)` — modifies parsed manifest JSON
- `withDangerousMod(config, ['android', callback])` — writes native source files
- `AndroidConfig.Permissions.withPermissions(config, [...])` — adds permissions
- Idempotency: plugins must check for existing entries before adding (avoid duplicates on re-prebuild)

### OEM Restrictions

Samsung, Xiaomi, Huawei, and Oppo have custom battery optimization that may prevent boot receivers from firing. Mitigation:
- Document whitelisting steps per OEM in README
- Existing app-launch auto-resume (SC-005) serves as fallback
- No programmatic workaround exists — this is a platform limitation
