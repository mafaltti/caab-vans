# Deployment Docs Assessment

Newcomer deployment docs are the weakest part of this repo. The codebase itself is reasonably maintainable, but the documentation is not yet trustworthy enough for a developer to deploy it for a client without extra repo archaeology.

---

## Findings

### No Single Authoritative Deployment Model

[`README.md`](C:/Projetos/caab-vans/README.md#L132) says production is two Docker Compose stacks in `infra/caab-vans`, [`docs/OPERATIONS.md`](C:/Projetos/caab-vans/docs/OPERATIONS.md#L113) says that app stack is "not yet configured", [`docs/TECH.md`](C:/Projetos/caab-vans/docs/TECH.md#L81) refers to `infra/app`, and the only real step-by-step VPS guide is buried in [`docs/execution/0027-vps-deployment-guide.md`](C:/Projetos/caab-vans/docs/execution/0027-vps-deployment-guide.md#L151), which uses `systemd` + Caddy instead of an app compose stack.

### Official Onboarding Docs Already Drift on Basics

- [`README.md`](C:/Projetos/caab-vans/README.md#L88) tells new developers to copy `.env.example`, but the repo ships [`.env.local.example`](C:/Projetos/caab-vans/.env.local.example).
- [`docs/OPERATIONS.md`](C:/Projetos/caab-vans/docs/OPERATIONS.md#L61) says Studio defaults to `54323`, but [`infra/supabase/docker-compose.yml`](C:/Projetos/caab-vans/infra/supabase/docker-compose.yml#L84) defaults to `54324`.
- [`docs/OPERATIONS.md`](C:/Projetos/caab-vans/docs/OPERATIONS.md#L335) points to `src/hooks/*` even though the real query hooks live under [`src/lib/queries/use-routes.ts`](C:/Projetos/caab-vans/src/lib/queries/use-routes.ts).
- [`docs/OPERATIONS.md`](C:/Projetos/caab-vans/docs/OPERATIONS.md#L468) says `/api/track` is unclear, while the implementation is plainly a small event logger in [`src/app/api/track/route.ts`](C:/Projetos/caab-vans/src/app/api/track/route.ts#L3).

### Product and Ops Docs Mix Two Different Systems

[`docs/PRD-MVP.md`](C:/Projetos/caab-vans/docs/PRD-MVP.md#L28) still describes Telegram/Pabbly live-link ingestion as the core workflow, while the implemented tracker posts GPS to [`apps/van-tracker/src/api/client.ts`](C:/Projetos/caab-vans/apps/van-tracker/src/api/client.ts#L39) and [`src/app/api/tracking/[vanId]/route.ts`](C:/Projetos/caab-vans/src/app/api/tracking/%5BvanId%5D/route.ts#L17). A deployer would not know which behavior is canonical.

### Repo Does Not Currently Meet Its Own Documented Lint Gate

Root `eslint` is defined in [`package.json`](C:/Projetos/caab-vans/package.json#L9), but [`eslint.config.mjs`](C:/Projetos/caab-vans/eslint.config.mjs#L9) only ignores top-level build output. The tracker app also omits `.next/` from [`apps/van-tracker/.gitignore`](C:/Projetos/caab-vans/apps/van-tracker/.gitignore#L6) and [`apps/van-tracker/.eslintrc.js`](C:/Projetos/caab-vans/apps/van-tracker/.eslintrc.js#L4). In practice, both root and tracker lint fail because generated files are being linted.

### Long-Term Ops Hardening Is Still Mostly Aspirational

The project explicitly documents:
- no CI/CD — [`docs/OPERATIONS.md`](C:/Projetos/caab-vans/docs/OPERATIONS.md#L441)
- no retention policy — [`docs/OPERATIONS.md`](C:/Projetos/caab-vans/docs/OPERATIONS.md#L453)
- unit-only test coverage — [`docs/TECH.md`](C:/Projetos/caab-vans/docs/TECH.md#L67)
- an in-memory rate limiter in [`src/lib/api/rate-limit.ts`](C:/Projetos/caab-vans/src/lib/api/rate-limit.ts#L11)

That is manageable for one careful maintainer, but weak for client-facing operations.

### Client-Specific Configuration Is Hardcoded

[`scripts/seed.ts`](C:/Projetos/caab-vans/scripts/seed.ts#L13) hardcodes bootstrap admin credentials, [`docs/execution/0027-vps-deployment-guide.md`](C:/Projetos/caab-vans/docs/execution/0027-vps-deployment-guide.md#L145) repeats them in the deploy path, and the tracker app hardcodes Sentry and Expo identity in [`apps/van-tracker/app/_layout.tsx`](C:/Projetos/caab-vans/apps/van-tracker/app/_layout.tsx#L14) and [`apps/van-tracker/app.json`](C:/Projetos/caab-vans/apps/van-tracker/app.json#L47). That makes client handoff and environment isolation brittle.

---

## Verification

`npm run typecheck`, `npm run test -- --run`, `npm run build`, and `apps/van-tracker npm run typecheck` passed locally. `npm run lint` and `apps/van-tracker npm run lint` failed because ESLint is traversing generated tracker artifacts.

---

## What I'd Change First

- Publish a single `docs/START-HERE.md` that defines the one supported deployment model and marks `docs/execution/` as archive/reference.
- Replace or archive [`docs/PRD-MVP.md`](C:/Projetos/caab-vans/docs/PRD-MVP.md) for deployers, then add a client deployment runbook covering DNS, secrets, backup/restore, tracker provisioning, smoke checks, and rollback.
- Fix lint scope/ignores for nested generated artifacts before treating the documented quality gates as reliable.

---

*If you want, I can turn this into a concrete doc/cleanup plan or implement the first round of fixes.*
