# EAS Setup Prerequisites

> I see this uses Expo and EAS. Do I have to setup anything before running speckit implement? EAS account or anything like this?

**No EAS account needed for implementation.** The tasks only create source code and config files (`eas.json`, `app.json`, etc.) — they don't run any EAS builds.

You just need **Node.js + npm** (which you already have for the Next.js project).

The EAS account is only needed later when you want to build the APK (`eas build --platform android`), which is a manual post-implementation step described in the `quickstart.md` and `README`.

You're good to go with `/speckit.implement`.
