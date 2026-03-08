# Steps to Get a New Tracker App Version

1. **Merge PR to `dev`** — Open a PR from `039-fix-duplicate-pings` → `dev`, get it reviewed, and merge it.

2. **Build a new EAS update or binary** — The tracker is an Expo app (`apps/van-tracker/`). Depending on your setup:

   - **OTA update (EAS Update):** If the changes are JS-only (which they are — `task.ts`, `tracking.ts`, `buffer.ts`), you can push an OTA update:

     ```bash
     cd apps/van-tracker
     eas update --branch <channel> --message "fix: eliminate duplicate pings"
     ```

   - **New build (if needed):** If you need a new APK/IPA:

     ```bash
     cd apps/van-tracker
     eas build --platform android --profile preview
     ```

3. **Install/distribute** — If it's an OTA update, the app picks it up automatically on next launch. If it's a new build, distribute the APK/IPA accordingly.
