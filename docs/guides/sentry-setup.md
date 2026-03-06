# Sentry Setup Guide — CAAB Tracker App

This guide covers integrating Sentry crash reporting into the van-tracker Expo app (task T025 from spec 040-tracker-resilience).

## Prerequisites

- A Sentry account (https://sentry.io or self-hosted instance)
- Expo EAS CLI configured (`npx eas-cli`)

## 1. Create Sentry Project

1. Log in to Sentry and create a new project
2. Select platform: **React Native**
3. Note down:
   - **DSN** — looks like `https://abc123@o123456.ingest.sentry.io/789`
   - **Organization slug** — e.g. `caab`
   - **Project slug** — e.g. `van-tracker`

## 2. Generate Auth Token

1. Go to Sentry > Settings > Auth Tokens
2. Create a token with scopes: `project:releases`, `org:read`
3. Save the token — you'll need it for source map uploads

## 3. Install Dependencies

```bash
cd apps/van-tracker
npx expo install @sentry/react-native
```

> Note: `sentry-expo` was the legacy package. The current recommended package for Expo SDK 55+ is `@sentry/react-native` with the Expo plugin.

## 4. Configure app.json

Add the Sentry plugin to the `plugins` array in `apps/van-tracker/app.json`:

```json
{
  "expo": {
    "plugins": [
      "expo-router",
      [
        "expo-location",
        {
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true
        }
      ],
      [
        "@sentry/react-native/expo",
        {
          "organization": "YOUR_ORG_SLUG",
          "project": "YOUR_PROJECT_SLUG"
        }
      ]
    ]
  }
}
```

## 5. Configure _layout.tsx

Edit `apps/van-tracker/app/_layout.tsx`:

```typescript
import "@/location/task";
import * as Sentry from "@sentry/react-native";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { isSettingsComplete } from "@/storage/settings";
import { getTrackingEnabled } from "@/storage/tracking-state";
import { startTracking } from "@/location/tracking";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  enableAutoSessionTracking: true,
  tracesSampleRate: 0.2,
  attachScreenshot: true,
  enableNativeCrashHandling: true,
});

function RootLayout() {
  useEffect(() => {
    (async () => {
      try {
        const wasTracking = await getTrackingEnabled();
        const settingsOk = await isSettingsComplete();
        if (wasTracking && settingsOk) {
          await startTracking();
        }
      } catch {
        // Permission issues on resume are non-fatal — user can manually restart
      }
    })();
  }, []);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "CAAB Tracker" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
    </Stack>
  );
}

export default Sentry.wrap(RootLayout);
```

Key points:
- `Sentry.init()` must run before the component renders (top-level)
- `Sentry.wrap()` captures uncaught JS errors and navigation breadcrumbs
- `tracesSampleRate: 0.2` — adjust based on volume (20% of transactions traced)

## 6. Set Auth Token for Source Maps

Source maps allow Sentry to show readable stack traces instead of minified code.

### Option A: Environment variable (recommended for CI)

```bash
export SENTRY_AUTH_TOKEN="your-auth-token"
```

EAS Build automatically picks this up if set in your EAS secrets:

```bash
npx eas secret:create --name SENTRY_AUTH_TOKEN --value "your-auth-token"
```

### Option B: .env file (local development)

Create `apps/van-tracker/.env` (already in .gitignore):

```
SENTRY_AUTH_TOKEN=your-auth-token
```

## 7. Rebuild the App

After adding the Sentry plugin, a new native build is required:

```bash
cd apps/van-tracker
npx eas build --platform android --profile preview
```

Source maps are uploaded automatically during the EAS build process when the auth token is configured.

## 8. Verify Integration

### Quick test (development)

Add a test button temporarily or run from the console:

```typescript
Sentry.captureException(new Error("Test error from CAAB Tracker"));
```

### What to verify

1. Open Sentry dashboard > Issues — confirm the test error appears
2. Check the stack trace shows readable file names (source maps working)
3. Check breadcrumbs include navigation events
4. Force-kill and reopen the app — confirm native crash appears in Sentry

## 9. Optional: Add Context to Errors

Enrich Sentry events with tracker context for easier debugging:

```typescript
// In task.ts, after settings are loaded:
Sentry.setTag("vanId", settings.vanId);
Sentry.setContext("tracker", {
  bufferSize,
  consecutiveFailures,
  backoffUntil,
  isLowBattery,
});
```

This helps operations correlate Sentry errors with specific vans and tracker states.

## Checklist

- [ ] Sentry project created
- [ ] DSN added to `_layout.tsx`
- [ ] Org/project slugs added to `app.json` plugin config
- [ ] Auth token set in EAS secrets
- [ ] New native build completed
- [ ] Test error visible in Sentry dashboard
- [ ] Source maps showing readable stack traces
