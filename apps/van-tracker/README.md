# CAAB Van Tracker

Standalone Expo + TypeScript Android app that sends device GPS coordinates to the CAAB Vans backend endpoint. Uses expo-location + expo-task-manager as an Android foreground service.

## Prerequisites

- Node.js 18+
- npm
- EAS CLI: `npm install -g eas-cli`
- Expo account (run `eas login`)
- Android device with USB debugging enabled (API 31+ recommended)

## Install

```bash
cd apps/van-tracker
npm install
```

## EAS Setup

```bash
eas build:configure
eas build --platform android --profile development
# Or build locally (requires Android SDK):
eas build --platform android --profile development --local
```

## Build Profiles

- `development`: Dev client APK with hot reload support
- `preview`: APK for internal testing

## Run on Device

```bash
npx expo start
# Install APK on device via:
adb install path/to/app.apk
```

## Testing Background Tracking

1. Open app → Settings → Enter API Base URL, Van ID, Ingestion Token
2. Home → Start Tracking → Grant all permissions
3. Verify status shows "TRACKING" and coordinates update
4. Lock screen → Wait 1-2 min → Check server for continued pings
5. Unlock → Verify coordinates still updating
6. Stop Tracking

## Troubleshooting

- No location after screen lock: Disable battery optimization for the app
- Permission denied: Reinstall app to reset permissions
- 401 errors: Verify ingestion token in Settings
- OEM battery killers (Samsung, Xiaomi, Huawei): User must whitelist the app manually
- Build fails: Update eas-cli (`npm install -g eas-cli@latest`), verify login (`eas whoami`)

## Dependencies

| Package | Purpose |
|---------|---------|
| expo-location | GPS tracking (foreground + background) |
| expo-task-manager | Background task registration |
| expo-crypto | UUID generation for device ID |
| expo-dev-client | Development build support |
| @react-native-async-storage/async-storage | Local key-value persistence |
| @react-native-community/netinfo | Network connectivity detection |
| expo-router | File-based navigation |
