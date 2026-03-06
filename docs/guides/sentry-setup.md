# Sentry Setup Guide — CAAB Tracker App

Sentry provides crash reporting and error tracking for the van-tracker Expo app. The integration is already wired into the codebase — this guide covers what's done and what a new deployment needs to configure.

## What's Already Configured

These files are committed and don't need changes:

- **`apps/van-tracker/package.json`** — `@sentry/react-native` dependency installed
- **`apps/van-tracker/app.json`** — Sentry Expo plugin configured with org/project slugs
- **`apps/van-tracker/app/_layout.tsx`** — `Sentry.init()` with DSN, `Sentry.wrap()` on root component

### Current Configuration

| Setting | Value | File |
|---------|-------|------|
| Package | `@sentry/react-native ~7.11.0` | `package.json` |
| DSN | Hardcoded in `Sentry.init()` | `_layout.tsx` |
| Organization | `carneiro` | `app.json` |
| Project | `caab-tracker` | `app.json` |
| Session tracking | Enabled | `_layout.tsx` |
| Traces sample rate | 20% | `_layout.tsx` |
| Native crash handling | Enabled | `_layout.tsx` |

## What a New Deployment Needs

If you're deploying this repo to a new Sentry project (different org or project), update these values:

### 1. Create a Sentry Project

1. Log in to Sentry and create a new project
2. Select platform: **React Native**
3. Note down your **DSN**, **organization slug**, and **project slug**

### 2. Update the DSN

Edit `apps/van-tracker/app/_layout.tsx` — replace the DSN string in `Sentry.init()`:

```typescript
Sentry.init({
  dsn: "YOUR_NEW_DSN",
  // ... rest stays the same
});
```

### 3. Update org/project slugs

Edit `apps/van-tracker/app.json` — update the plugin config:

```json
[
  "@sentry/react-native/expo",
  {
    "organization": "YOUR_ORG_SLUG",
    "project": "YOUR_PROJECT_SLUG"
  }
]
```

### 4. Set the Auth Token for Source Map Uploads

Source maps let Sentry show readable stack traces instead of minified code. The auth token is **not** committed to the repo — each deployment must set it.

#### Generate a token

1. Go to your Sentry instance > **Settings > Auth Tokens** (direct URL: `https://sentry.io/settings/auth-tokens/`)
2. Create a token with **Release** (Admin) and **Organization** (Read) permissions
3. If you can't find Auth Tokens, try **Settings > Developer Settings > Internal Integrations** — create an integration and copy its token

#### Store the token in EAS

```bash
cd apps/van-tracker
npx eas env:create --name SENTRY_AUTH_TOKEN --value "your-token" --environment production --visibility secret
```

This makes the token available during EAS builds without committing it to code.

### 5. Build the App

A native build is required after any Sentry config changes:

```bash
cd apps/van-tracker
npx eas build --platform android --profile preview
```

Source maps are uploaded automatically during the build when the auth token is configured.

## Verifying the Integration

### Quick test

Add this temporarily anywhere in the app:

```typescript
import * as Sentry from "@sentry/react-native";
Sentry.captureException(new Error("Test error from CAAB Tracker"));
```

### What to check

1. Open Sentry dashboard > **Issues** — confirm the test error appears
2. Check the stack trace shows readable file names (source maps working)
3. Check breadcrumbs include navigation events
4. Force-kill and reopen the app — confirm native crash appears

## Optional: Add Tracker Context to Errors

Enrich Sentry events with tracker state for easier debugging:

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

This helps correlate Sentry errors with specific vans and degraded tracker states.

## Reference

| What | Where |
|------|-------|
| Sentry init + DSN | `apps/van-tracker/app/_layout.tsx` |
| Expo plugin config | `apps/van-tracker/app.json` (plugins array) |
| Package version | `apps/van-tracker/package.json` |
| Auth token | EAS secret `SENTRY_AUTH_TOKEN` (not in repo) |
| Sentry dashboard | https://sentry.io |
