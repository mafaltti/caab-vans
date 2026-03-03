# Live Tracking — Revised Three-Feature Plan

Good point. Since it lives in `apps/van-tracker/` inside this repo, it should be a Spec Kit feature too. Revised plan:

## Three Features

| Feature | Scope | Depends On | Can Parallel? |
|---|---|---|---|
| `016-tracking-ingestion` | DB migration + `POST /api/tracking/[vanId]` endpoint | — | — |
| `017-stop-inference-eta` | Inference module + ETA + public API extension + admin/public UI | 016 merged | No |
| `018-expo-tracker-app` | Full Expo app in `apps/van-tracker/` | 016 merged (API exists to test against) | Yes, parallel with 017 |

The Expo app only needs the ingestion endpoint (016) to work. It doesn't care about inference, ETA, or frontend UI changes (017). So once 016 is merged to `dev`, you can run 017 and 018 simultaneously.

The `expo-background-geolocation-app.md` is already a near-complete spec — the `/speckit.specify` step for 018 will mostly encode it into the standard Spec Kit format (user stories, acceptance criteria, etc.) rather than re-exploring decisions.

## One Caveat

Spec Kit's quality gates (lint, typecheck, build) are configured for the Next.js app. The Expo project in `apps/van-tracker/` will have its own `tsconfig.json` and dependencies. During `/speckit.plan` for 018, the plan should note that quality gates apply to the Expo project's own tooling (`npx tsc --noEmit` scoped to `apps/van-tracker/`), not the root Next.js build.

---

> Want me to start with `/speckit.specify` for 016 (tracking ingestion)?
