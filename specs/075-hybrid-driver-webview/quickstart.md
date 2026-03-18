# Quickstart: 075 Hybrid Driver WebView

**Branch**: `075-hybrid-driver-webview`

## Prerequisites

- Node.js (project version)
- Expo CLI (`npx expo`)
- Android device or emulator with USB debugging
- Running instance of the web app (for WebView to connect to)

## Setup

### 1. Install new native dependencies

```bash
cd apps/van-tracker
npx expo install react-native-webview expo-keep-awake
```

### 2. Rebuild the development client

Since `react-native-webview` is a native module, a new dev client build is required:

```bash
npx expo run:android
# OR via EAS:
eas build --profile development --platform android
```

### 3. Web app changes (no new dependencies)

The web auth restructure (route groups, driver login page, fetch helper) uses only existing Next.js and project dependencies. No additional installs needed.

## Development Flow

### Web auth changes (test in browser first)

1. Restructure driver routes into `(protected)` route group
2. Create `/driver/login` page
3. Update middleware, fetch helper, logout redirect
4. Test in browser: visit `/driver` → should redirect to `/driver/login`
5. Run quality gates: `npx eslint . && npx tsc --noEmit && npx next build`

### Native app changes (test on device)

1. Add `driver.tsx` screen with WebView
2. Add "Open Driver" CTA to home screen
3. Add keep-awake to root layout
4. Test on Android device with the web app URL configured in settings

## Verification Checklist

- [ ] `/driver` in browser redirects to `/driver/login` when unauthenticated
- [ ] Driver login → lands on `/driver`
- [ ] Admin login from `/driver/login` → lands on `/admin`
- [ ] Driver 401 → redirects to `/driver/login`
- [ ] Admin 401 → redirects to `/admin/login` (unchanged)
- [ ] Driver logout → redirects to `/driver/login`
- [ ] Tracker app home shows "Open Driver" when fully provisioned
- [ ] WebView loads `/driver/login` when no session
- [ ] Google Maps link opens native Maps app
- [ ] Back button navigates WebView history before exiting
- [ ] Screen stays on while app is foregrounded
- [ ] Screen sleeps when app is backgrounded
- [ ] Native tracking start/stop unchanged
- [ ] `next build` passes
- [ ] `tsc --noEmit` passes
- [ ] `eslint` passes
