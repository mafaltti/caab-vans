# Sentry in Van Tracker — What Needs to Be Done?

## QUESTION: Regarding Sentry in van tracker, do we need to do anything?

● Agent(`Check Sentry setup requirements for van tracker`) — Done (25 tool uses · 39.4k tokens · 1m 10s)

Nothing to do on this server. Sentry is purely client-side — the tracker app sends crash reports directly to Sentry's cloud.

## What's Already Done

- `@sentry/react-native` installed and `Sentry.init()` configured with a real DSN
- Expo plugin registered in `app.json` with org/project slugs

## What's Needed (But Not on This Server)

1. Verify the Sentry project exists at `sentry.io` under org `"carneiro"`, project `"caab-tracker"`
2. Set `SENTRY_AUTH_TOKEN` in EAS secrets — without this, source maps won't upload and crash stack traces will be unreadable
3. Build a new APK via EAS Build so the Sentry native module is baked in
4. Optionally enrich errors with van context (`Sentry.setTag("vanId", ...)`) in `task.ts`

All of these are developer/build tasks, not server infrastructure.
