# Generating APK for Van Phones

## Build a standalone APK

Your `eas.json` already has a `preview` profile configured to build an APK. Run this from the `apps/van-tracker` directory:

```bash
cd apps/van-tracker
eas build --profile preview --platform android
```

This builds an installable `.apk` on Expo’s cloud servers. When it finishes, you’ll get a download link.

## Install on phones

1. Download the APK from the link EAS gives you
2. Transfer it to each phone (via link, AirDrop, USB, etc.)
3. Install it — the phone may ask to allow “Install from unknown sources”
4. Open the app, go to **Settings**, and configure the **API URL**, **Van ID**, and **Token** for each van

## Profile differences

| Profile | Use case |
|---|---|
| `development` | Dev build with dev client (what you’re using now) |
| `preview` | Standalone APK for internal testing — **use this one** |
| `production` | AAB for Play Store (not needed yet) |

> **Note:** The preview build won’t need a dev server running — it’s a self-contained app. Just make sure the API Base URL in settings points to your production/accessible server, not `localhost`.
