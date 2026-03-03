# Van-Tracker Extraction Analysis — Full Report

## 1. Coupling Assessment (Four Dimensions)

### 1.1 Code-Level Coupling: ZERO

| Aspect | van-tracker | Main Next.js App | Shared? |
|---|---|---|---|
| Imports | All `@/` (local) or npm | All `@/` (local) or npm | None |
| Types | `LocationPoint`, `Settings`, `TrackingStatus` | `Van`, `Route`, `RouteWithStatus`, DB entities | None — different domains |
| Dependencies | Expo, React Native, AsyncStorage, Location | Next.js, Supabase, TanStack Query, Luxon | React 19, TypeScript ~5 only |
| tsconfig | Extends `expo/tsconfig.base` | Extends Next.js plugin | Independent |
| ESLint | Extends `expo` | Extends `next/core-web-vitals` | Independent |
| References from root `src/` to van-tracker | — | — | Zero |

The two projects share a Git repo but no code, types, or configuration inheritance.

### 1.2 Build & CI/CD Coupling: ZERO

| Aspect | van-tracker | Main App |
|---|---|---|
| Build tool | EAS Build (cloud) | `next build` (Docker on VPS) |
| Deploy target | Android APK via EAS | VPS Docker + Caddy |
| CI/CD | None configured in repo | None configured in repo |
| Lockfile | Own `package-lock.json` | Own `package-lock.json` |
| node_modules | Own isolated tree | Own isolated tree |
| Quality gates | Own lint/typecheck scripts | `npm run lint`, `tsc`, `vitest` |
| Monorepo tooling | None (no workspaces, Lerna, Turborepo) | None |

The repo is not a real monorepo — it's two independent projects in one Git directory. No shared build orchestration exists.

### 1.3 API Contract Coupling: Single Endpoint, Loose

The only runtime connection:

```
POST /api/tracking/{vanId}
Header: x-ingestion-token: <per-van-token>
Body:   { deviceId, lat, lng, accuracy, speed, heading, ts }
Response: { received: true, ts: number }
Rate limit: 25 req/60s/van
```

- **Configuration:** Fully runtime via AsyncStorage (`apiBaseUrl`, `vanId`, `ingestionToken`) — no hardcoded URLs or env vars
- **Auth:** Opaque token, no expiry mechanism, manually entered by operator
- **Resilience:** Client buffers offline points, retries on network errors, differentiates 4xx vs 5xx
- **Validation:** Server uses Zod schema in `src/lib/validators/tracking.ts`; client has no shared schema
- **Contract documentation:** Exists at `specs/018-expo-tracker-app/contracts/tracking-api.md`

### 1.4 Documentation & History Coupling: LOW

- **Git history:** Only 3 commits touch `apps/van-tracker/` out of 92 total (3.3%)
- **Dedicated specs:** `specs/018-expo-tracker-app/` (8 files) — fully self-contained
- **Execution docs:** 3 of 27 docs are van-tracker specific (0010, 0025, 0026)
- **Root README:** Mentions van-tracker as a component — needs minor update
- **CLAUDE.md / TECH.md:** No van-tracker references

---

## 2. Pros & Cons

### Pros of Extraction

| # | Benefit | Detail |
|---|---|---|
| 1 | Cleaner separation of concerns | Mobile app (Expo/RN) and web app (Next.js) are fundamentally different platforms with different lifecycles |
| 2 | Independent release cycles | APK builds don't need to wait on web deployments and vice versa |
| 3 | Simpler onboarding | A contributor to the mobile app doesn't need to clone the entire web + infra + DB stack |
| 4 | Cleaner Git history | Each repo tracks only relevant changes; no interleaving of unrelated commits |
| 5 | Future flexibility | Could hand off mobile app to a different team/contractor without exposing backend code |
| 6 | Smaller clone size | Van-tracker is ~487 lines; main repo carries supabase, infra, migrations, etc. |
| 7 | No refactoring needed | Zero code changes required — just move files |

### Cons / Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | API contract drift | Medium | Add a shared `tracking-api-contract.md` to both repos, or create contract tests |
| 2 | No contract tests | Medium | Introduce a simple integration test that validates request/response shape against the Zod schema |
| 3 | Token rotation coordination | Low | Already manual; no change from current state |
| 4 | Spec/doc fragmentation | Low | Move `specs/018-*` to new repo; leave a cross-reference in main repo |
| 5 | Two repos to manage | Low | Already independent build/deploy; this just formalizes it |
| 6 | Version skew (old APK vs new server) | Medium | Add API versioning header (`X-Client-Version`) to detect stale clients |
| 7 | Loss of atomic cross-project commits | Negligible | Only 3 commits ever touched van-tracker; no real cross-project atomicity exists |

---

## 3. Extraction Strategy (Step-by-Step)

### Phase 1: Create New Repository

1. Create repo `caab-van-tracker` (or preferred name) on GitHub
2. Copy `apps/van-tracker/*` as the new repo root
3. Initialize with its own `.gitignore`, `README.md`, `LICENSE`
4. Move relevant specs and docs:
   - `specs/018-expo-tracker-app/` → new repo `specs/` or `docs/`
   - `docs/execution/0010, 0025, 0026` → new repo `docs/`
   - Extract van-tracker section from `docs/execution/0027` → new repo `docs/deployment.md`

### Phase 2: Clean Up Main Repo

5. Remove `apps/van-tracker/` directory
6. Update root `README.md` — remove van-tracker section, add link to new repo
7. Optionally add `docs/INTEGRATION.md` documenting the tracking API contract for future reference

### Phase 3: Post-Extraction Hardening (Recommended)

8. **API contract file:** Add `contracts/tracking-api.md` to both repos with the endpoint spec
9. **Client version header:** Add `X-Client-Version` header in van-tracker requests so the server can detect stale clients
10. **API versioning:** Consider prefixing the endpoint (`/api/v1/tracking/{vanId}`) for future-proofing
11. **Contract test:** Add a minimal test in the main repo that validates the Zod schema matches the documented contract

### Phase 4: EAS Update

12. Update EAS project settings if the Git source repo reference changes
13. Verify `eas build` works from the new repo root

---

## 4. Effort Estimate

| Phase | Effort | Code Changes |
|---|---|---|
| Phase 1 (new repo) | ~15 min | Zero code changes |
| Phase 2 (cleanup) | ~10 min | README update only |
| Phase 3 (hardening) | ~1-2 hours | Optional but recommended |
| Phase 4 (EAS) | ~10 min | Config verification |

**Minimum viable extraction: ~30 minutes, zero code changes.**

---

## 5. Recommendation

**Extract it.** The van-tracker is already a standalone app that happens to live in the same Git directory. The monorepo structure provides no actual benefits (no shared code, no shared builds, no workspace tooling). Extraction formalizes what's already true architecturally.

The only thing worth investing in post-extraction is **API contract management** — either a shared contract doc, a versioned endpoint, or a simple integration test to catch drift early.
