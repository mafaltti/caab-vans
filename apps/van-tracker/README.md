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

## Production Provisioning

Use this flow when preparing a phone for a client deployment:

1. Build and install the APK via EAS.
2. In the app settings, enter:
   - `API Base URL`: the public Next.js app URL, for example `https://APP_DOMAIN`
   - `Van ID`: the UUID created in the admin panel
   - `Ingestion Token`: the token generated for that van
3. Open the diagnostics screen once and confirm logging is available.
4. Start tracking and verify the server receives pings for the correct van.

Important:

- The app posts to the Next.js app domain, not directly to the Supabase gateway domain.
- Battery optimization whitelisting is required on many Android devices for reliable background behavior.
- Diagnostics can be exported from the in-app Diagnostics screen for support and incident review.
- Client-specific branding, Sentry ownership, and observability changes are follow-up work outside this cleanup pass.

## Boot Restart

After device reboot, battery death, or app update, tracking resumes automatically without user interaction. Implemented via an Expo config plugin that injects a native Android BroadcastReceiver (Direct Boot-aware).

**Requirements**: EAS Build (config plugins don't work with Expo Go).

**OEM Battery Optimization Whitelisting** — required for boot restart to work reliably:

| Manufacturer | Path |
|---|---|
| Samsung | Settings > Battery > App Power Management > disable for CAAB Tracker |
| Xiaomi | Settings > Battery > App battery saver > CAAB Tracker > No restrictions |
| Huawei | Settings > Battery > App launch > CAAB Tracker > Manual > enable all toggles |

If boot restart does not work after whitelisting, the existing app-launch auto-resume serves as fallback (open the app manually).

## Troubleshooting

- No location after screen lock: Disable battery optimization for the app
- Permission denied: Reinstall app to reset permissions
- 401 errors: Verify ingestion token in Settings
- OEM battery killers (Samsung, Xiaomi, Huawei): User must whitelist the app manually
- Build fails: Update eas-cli (`npm install -g eas-cli@latest`), verify login (`eas whoami`)
- Need logs for support: open `Settings -> Diagnostics` and export the diagnostic log

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
