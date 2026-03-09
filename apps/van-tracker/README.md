# CAAB Van Tracker

Standalone Expo + TypeScript Android app that sends device GPS coordinates to the CAAB Vans backend. It uses `expo-location` plus `expo-task-manager` as an Android foreground service.

## Prerequisites

- Node.js 22 recommended (match the root workspace)
- npm
- EAS CLI: `npm install -g eas-cli`
- Expo account (`eas login`)
- Android device with USB debugging enabled (API 31+ recommended)
- Android SDK only if you want local Android builds

## Install

```bash
cd apps/van-tracker
npm install
```

Validation:

```bash
npm run check
```

## EAS Setup

```bash
eas build:configure
eas build --platform android --profile development
# Or build locally (requires Android SDK):
eas build --platform android --profile development --local
```

## Build Profiles

Profiles are defined in `eas.json`:

- `development`: dev-client APK for interactive development
- `preview`: APK for internal testing and side-loading
- `production`: default EAS production profile

Use `preview` or `production` builds for real locked-screen testing. Expo Go is not sufficient for background tracking or boot-restart behavior.

## Run on Device

```bash
npx expo start --dev-client
adb install path/to/app.apk
```

## Runtime Settings

The app is configured from the in-app Settings screen:

- `API Base URL`: public Next.js app URL, for example `https://APP_DOMAIN`
- `Van ID`: UUID from the admin panel
- `Ingestion Token`: token generated for that van

Storage details:

- `Ingestion Token` is stored in SecureStore
- `API Base URL` and `Van ID` are stored in AsyncStorage

## Testing Background Tracking

1. Open the app and fill in Settings.
2. Start tracking and grant all permissions.
3. Verify status shows tracking and coordinates update.
4. Lock the screen for 1-2 minutes.
5. Confirm the backend still receives pings.
6. Stop tracking.

## Runtime Behavior

Current behavior from the implementation:

- Starts Android foreground-service tracking through `expo-location`
- High-accuracy mode uses a 5 second interval and 10 meter distance interval
- Battery saver switches to balanced accuracy and 10 second updates when battery drops below 20%, then returns to high accuracy above 25%
- Drops inaccurate points over 50m, duplicate timestamps, and stale fixes
- Throttles near-duplicate sends to avoid over-posting
- Buffers up to 100 unsent points for 24 hours
- Sends the newest point first to `/api/tracking/:vanId`, then flushes buffered points to `/api/tracking-batch/:vanId`
- Backs off after network or server failures
- Pauses auth-sensitive sends after 3 consecutive `401` responses until settings are corrected
- Stores a capped diagnostics log that can be exported from the Diagnostics screen

## Production Provisioning

Use this flow when preparing a phone for a deployment:

1. Build and install the APK via EAS.
2. Enter the runtime settings listed above.
3. Open the Diagnostics screen once and confirm logging is available.
4. Start tracking and verify the server receives pings for the correct van.

Important:

- The app posts to the Next.js app domain, not directly to the Supabase gateway domain.
- Battery optimization whitelisting is required on many Android devices for reliable background behavior.
- Diagnostics can be exported from the in-app Diagnostics screen for support and incident review.

## Boot Restart

After device reboot, battery death, or app update, tracking resumes automatically without user interaction. This is implemented via the custom Expo config plugin at `plugins/withBootRestart.js`, which injects a native Android `BroadcastReceiver`.

Requirements:

- EAS Build (config plugins do not work with Expo Go)
- Battery optimization whitelisting on many OEM Android builds

OEM battery optimization whitelisting:

| Manufacturer | Path |
|---|---|
| Samsung | Settings > Battery > App Power Management > disable for CAAB Tracker |
| Xiaomi | Settings > Battery > App battery saver > CAAB Tracker > No restrictions |
| Huawei | Settings > Battery > App launch > CAAB Tracker > Manual > enable all toggles |

If boot restart does not work after whitelisting, the existing app-launch auto-resume serves as fallback.

## Sentry

`app.json` currently includes the `@sentry/react-native/expo` plugin with the `carneiro / caab-tracker` project configuration. If you ship this app under a different owner, update that config before building.

## Troubleshooting

- No location after screen lock: disable battery optimization for the app
- Permission denied: reinstall the app to reset permissions
- 401 errors: verify the ingestion token in Settings
- Persistent buffering: inspect Diagnostics and verify network reachability to the app domain
- OEM battery killers (Samsung, Xiaomi, Huawei): whitelist the app manually
- Build fails: update `eas-cli`, verify `eas whoami`, and confirm the account has access to the project
- Need support logs: open `Settings -> Diagnostics` and export the diagnostic log

## Dependencies

| Package | Purpose |
|---------|---------|
| `expo-location` | GPS tracking (foreground + background) |
| `expo-task-manager` | Background task registration |
| `expo-crypto` | UUID generation for device ID |
| `expo-dev-client` | Development build support |
| `expo-secure-store` | Secure storage for the ingestion token |
| `@react-native-async-storage/async-storage` | Local key-value persistence |
| `@react-native-community/netinfo` | Network connectivity detection |
| `expo-router` | File-based navigation |
