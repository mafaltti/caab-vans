# Van-Tracker Extraction — Complete Analysis

## Executive Summary

van-tracker is already a standalone app that happens to share a Git directory. There is zero code, build, or deployment coupling. The only connection is a single HTTP endpoint configured at runtime. Extraction requires zero code changes and can be done in ~30 minutes.

---

## Coupling Matrix (All Four Dimensions)

| Dimension | Coupling Level | Evidence |
|---|---|---|
| Code | ZERO | No shared imports, types, or utilities. Separate type domains (device state vs DB entities). No references from `src/` → `apps/van-tracker/` or vice versa. |
| Build/CI/CD | ZERO | Separate lockfiles, separate build tools (EAS vs Next.js), separate configs (tsconfig, eslint, prettier all duplicated independently). No CI/CD automation exists for either project. Not a real monorepo (no workspaces, Lerna, or Turbo). |
| Runtime/API | Single endpoint | `POST /api/tracking/{vanId}` with `x-ingestion-token` auth. Base URL configured at runtime via AsyncStorage Settings screen. Zod-validated server-side. Client has offline buffering + retry. |
| Docs/History | LOW | 3 of 92 commits (3.3%) touch van-tracker. Dedicated spec at `specs/018-expo-tracker-app/` (8 files). 3 execution docs are van-tracker specific. Root README mentions it once. |

---

## Pros of Extraction

| # | Benefit |
|---|---|
| 1 | **Separation of concerns** — Mobile (Expo/RN) and web (Next.js) are different platforms with different lifecycles |
| 2 | **Independent releases** — APK builds don't wait on web deployments |
| 3 | **Simpler onboarding** — Mobile contributors don't need the full backend/infra/DB stack |
| 4 | **Cleaner Git history** — No interleaving of unrelated changes |
| 5 | **Team autonomy** — Mobile app could be handed to a different team/contractor without exposing backend |
| 6 | **Formalizes reality** — The two apps are already fully decoupled; extraction just makes it explicit |

## Cons / Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | API contract drift — Adding required fields on server breaks old clients | Medium | Shared contract doc in both repos + API version header (`X-Client-Version`) |
| 2 | No contract tests — No automated verification that client/server agree on shapes | Medium | Add a minimal integration test validating the Zod schema against the documented contract |
| 3 | Version skew — Old APKs in the field may not work with new server | Medium | Server-side version detection; graceful deprecation responses |
| 4 | Token rotation — No expiry mechanism; manual re-entry required | Low | Already manual today; unchanged by extraction |
| 5 | Spec/doc fragmentation — Feature specs split across repos | Low | Move `specs/018-*` to new repo; leave cross-reference in main repo |
| 6 | Two repos to manage | Low | Already independent pipelines; this just formalizes it |
| 7 | DevOps gaps exposed — Neither app has CI/CD automation today | Low | Extraction is a good forcing function to set up quality gates per-repo |

---

## Extraction Plan (4 Phases)

### Phase 1 — Create New Repo (~15 min)

1. Create `caab-van-tracker` on GitHub
2. Copy `apps/van-tracker/*` as the new repo root
3. Add `.gitignore`, `README.md`, `LICENSE`
4. Move specs and docs:
   - `specs/018-expo-tracker-app/` → new repo
   - `docs/execution/0010, 0025, 0026` → new repo
   - Extract van-tracker section from `0027` → new repo `docs/deployment.md`

### Phase 2 — Clean Up Main Repo (~10 min)

5. Remove `apps/van-tracker/` directory
6. Update root `README.md` — remove van-tracker section, add link to new repo
7. Add `docs/API-CONTRACTS.md` documenting the tracking endpoint for server-side reference

### Phase 3 — Post-Extraction Hardening (~1-2 hours, recommended)

8. Add `X-Client-Version` header to van-tracker requests
9. Consider API versioning (`/api/v1/tracking/{vanId}`)
10. Add contract test in main repo validating Zod schema vs documented contract
11. Set up basic CI (lint + typecheck) for both repos independently

### Phase 4 — EAS Verification (~10 min)

12. Update EAS project settings if Git source repo reference changes
13. Verify `eas build` works from the new repo root

---

## Bottom Line

| Question | Answer |
|---|---|
| Can we extract today? | Yes — zero code changes needed |
| Effort? | 30 min minimum viable, ~2 hours with hardening |
| What breaks? | Nothing |
| What to watch? | API contract drift is the only real ongoing risk |
| Recommendation | **Extract it.** It formalizes what's already true architecturally. |

---

Want me to start executing the extraction?
