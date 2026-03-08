# Data Model: Tracker Boot Restart

**Feature**: 042-tracker-boot-restart
**Date**: 2026-03-06

## No Database Changes

This feature does not add or modify any database tables, columns, or indexes. All changes are local to the Android tracker app.

## Local Storage Model

### Device-Protected SharedPreferences

**File**: `device_protected_prefs` (Android device-protected context)
**Purpose**: Store minimal flags accessible during Direct Boot (before user unlock)

| Key                | Type    | Default | Description                                    |
|--------------------|---------|---------|------------------------------------------------|
| `tracking_enabled` | boolean | false   | Whether tracking was active before shutdown     |
| `last_boot_attempt`| long    | 0       | Unix timestamp (ms) of last boot restart attempt|

**Access pattern**:
- **Write**: JavaScript layer (via native bridge) when tracking starts/stops
- **Read**: Native BroadcastReceiver on boot + JavaScript layer as fallback

### Credential-Protected Storage (Existing — No Changes)

| Storage          | Key                  | Purpose                           |
|------------------|----------------------|-----------------------------------|
| AsyncStorage     | `@trackingEnabled`   | UI-layer tracking flag (existing) |
| AsyncStorage     | `@lastSentAt`        | Last ping timestamp (existing)    |
| AsyncStorage     | `@lastTaskInvocationAt` | Task health check (existing)   |
| SecureStore      | `ingestionToken`     | API auth token (existing)         |

**Note**: The `@trackingEnabled` AsyncStorage key continues to be written alongside the device-protected flag. The app-launch auto-resume in `_layout.tsx` reads from AsyncStorage (credential-protected). The boot receiver reads from device-protected storage. Both are kept in sync by `setTrackingEnabled()`.

## State Transitions

```
Device boot (locked)
  └─ LOCKED_BOOT_COMPLETED broadcast
       └─ Boot receiver reads device-protected storage
            ├─ tracking_enabled = false → no action
            └─ tracking_enabled = true
                 ├─ last_boot_attempt < 60s ago → skip (boot-loop guard)
                 └─ last_boot_attempt >= 60s ago
                      └─ Launch app → startTracking() → foreground service starts

Device unlock
  └─ BOOT_COMPLETED broadcast (fallback for Android < 7.0)
       └─ Same logic as above

App update
  └─ MY_PACKAGE_REPLACED broadcast
       └─ Same logic as above
```

## Entity: Config Plugin

**Not a data entity** — a build-time artifact that generates:

1. `BootRestartReceiver.kt` — native BroadcastReceiver (Kotlin)
2. `DeviceProtectedStorage.kt` — native module for device-protected SharedPreferences
3. `DeviceProtectedStoragePackage.kt` — React Native package registration
4. AndroidManifest.xml entries — receiver declaration + permissions
