# What Will We Be Using Sentry For?

## QUESTION: What will we be using Sentry for?

Based on the spec, Sentry is for **crash reporting and error tracking** on the `van-tracker` mobile app. Specifically:

- **Automatic crash capture** — when the app crashes (JS or native), Sentry captures the stack trace and device context
- **Breadcrumbs** — trail of events leading up to a crash (navigation, network requests, user actions), helping diagnose what happened
- **Source maps** — readable stack traces instead of minified code in crash reports

This matters for the tracker because:

- It runs as a background service on low-end Android devices with 3G connectivity
- Android OEMs aggressively kill background tasks — crashes may happen silently without the driver noticing
- Without Sentry, you'd have zero visibility into why a tracker stopped working on a specific van

The optional context enrichment from the guide would also let you tag errors with `vanId`, `bufferSize`, and `consecutiveFailures`, so you can correlate crashes with specific vans and degraded states.
