# Quickstart: Tracker Boot Restart

**Feature**: 042-tracker-boot-restart
**Date**: 2026-03-06

## Prerequisites

- EAS CLI installed (`npm install -g eas-cli`)
- Android device or emulator (API 26+)
- Existing tracker app builds and runs via `npx expo start`

## What This Feature Adds

1. **Expo config plugin** (`plugins/withBootRestart.ts`) that injects:
   - Native BroadcastReceiver for boot/update broadcasts
   - Native module for device-protected storage
   - AndroidManifest permissions and receiver declaration

2. **JS wrapper** for device-protected storage (`src/storage/device-protected-state.ts`)

3. **Modified tracking state** — `setTrackingEnabled()` writes to both AsyncStorage and device-protected storage

## File Map

```
apps/van-tracker/
├── plugins/
│   └── withBootRestart.ts          # Config plugin (NEW)
├── src/
│   └── storage/
│       ├── tracking-state.ts       # MODIFIED — dual-write to device-protected
│       └── device-protected-state.ts  # NEW — JS bridge to native module
├── app/
│   └── _layout.tsx                 # MODIFIED — log boot_restart trigger source
└── app.json                        # MODIFIED — register plugin
```

## How to Test

### 1. Build a Development Client

Config plugins require a native build (not Expo Go):

```bash
cd apps/van-tracker
npx expo prebuild --platform android
eas build --platform android --profile development
```

### 2. Test Boot Restart

1. Install the dev build on a device
2. Open the app, configure settings (API URL, Van ID, Token)
3. Start tracking — verify "TRACKING" status and notification
4. Power off the device
5. Power on the device
6. **Expected**: Notification "CAAB Tracker — Sharing location" appears within 90 seconds, before or after unlock
7. Open the app → Diagnostics → verify `boot_restart` event logged

### 3. Test App Update Restart

1. With tracking active, install a new build over the existing one
2. **Expected**: Tracking resumes automatically after the update

### 4. Test Boot-Loop Guard

1. Start tracking
2. Reboot the device
3. Immediately force-reboot again (within 60 seconds)
4. **Expected**: Second boot does NOT trigger a restart attempt

### 5. Test Negative Case

1. Stop tracking manually
2. Reboot the device
3. **Expected**: App does NOT start, no notification appears

## Troubleshooting

- **No restart after boot on Samsung/Xiaomi/Huawei**: Check battery optimization settings. The app must be whitelisted ("Unrestricted" battery usage).
- **Plugin not applying**: Run `npx expo prebuild --clean --platform android` to force a fresh native project generation.
- **Build errors**: Ensure `app.json` references the plugin correctly: `"./plugins/withBootRestart"`.
