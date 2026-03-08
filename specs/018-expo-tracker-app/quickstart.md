# Quickstart: Expo Van Tracker App

**Date**: 2026-03-01 | **Branch**: `018-expo-tracker-app`

## Prerequisites

- Node.js 18+
- npm
- EAS CLI: `npm install -g eas-cli`
- Expo account: `eas login`
- Android device or emulator (API 31+ recommended)
- USB debugging enabled on physical device

## Project Setup

```bash
# From repo root
cd apps/van-tracker

# Install dependencies
npm install

# Install Expo packages (auto-resolves compatible versions)
npx expo install expo-location expo-task-manager expo-crypto expo-dev-client @react-native-async-storage/async-storage @react-native-community/netinfo
```

## EAS Configuration

```bash
# Initialize EAS (first time only — creates eas.json)
eas build:configure

# Create a development build APK
eas build --platform android --profile development

# Or build locally (requires Android SDK):
eas build --platform android --profile development --local
```

## Running the App

```bash
# Start the JS bundler
npx expo start

# The dev client on the device connects automatically
# If not, scan the QR code or enter the URL manually
```

## Install APK on Device

After EAS build completes:
- Download APK from the EAS dashboard link
- Or use: `adb install path/to/app.apk`
- Open the app, it will connect to the bundler

## Testing Background Tracking (Screen Locked)

1. Open the app and go to **Settings**
2. Enter:
   - **API Base URL**: Your backend URL (e.g., `https://vans.danilocarneiro.com`)
   - **Van ID**: A valid van UUID from the admin panel
   - **Ingestion Token**: The van's ingestion token from admin
3. Return to **Home** and tap **Start Tracking**
4. Grant all location permissions when prompted (foreground, then background)
5. Grant notification permission (Android 13+)
6. Verify the status shows "Tracking: ON" and coordinates update
7. **Lock the screen** and wait 1-2 minutes
8. Check the server logs or database — location pings should continue arriving
9. Unlock the screen — Home screen should show recent coordinates
10. Tap **Stop Tracking** to end the session

## Troubleshooting

- **No location updates after screen lock**: Check battery optimization settings. Disable battery optimization for the tracker app.
- **Permission denied**: Uninstall and reinstall the app to reset permissions, or go to Android Settings > Apps > Van Tracker > Permissions.
- **401 errors**: Verify the ingestion token in Settings matches the one in the admin panel.
- **Build fails**: Ensure `eas-cli` is up to date (`npm install -g eas-cli@latest`) and you're logged in (`eas whoami`).

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `expo-location` | GPS location tracking (foreground + background) |
| `expo-task-manager` | Background task registration for Android |
| `expo-crypto` | UUID generation for device ID |
| `expo-dev-client` | Development build support (replaces Expo Go) |
| `@react-native-async-storage/async-storage` | Local key-value persistence |
| `@react-native-community/netinfo` | Network connectivity detection |
| `expo-router` | File-based navigation (Home + Settings screens) |
