# Newcomer Docs + Repo Hygiene Plan

## Summary
- Create one canonical onboarding path for engineers deploying this system for a client.
- Standardize the supported production topology as: `infra/supabase` via Docker Compose, Next.js via `systemd` + Caddy on the VPS, optional `infra/osrm`, and the tracker app via EAS.
- Keep historical execution notes, but remove them from the newcomer path and label them as archive/reference.
- Include only small repo hygiene fixes needed to make the docs truthful and the stated quality gates reliable.

## Key Changes
- Add `docs/START-HERE.md` as the single onboarding index. It should route readers to local setup, production deployment, tracker provisioning, operations reference, and archived notes.
- Add `docs/DEPLOYMENT.md` by promoting the usable content from `docs/execution/0027-vps-deployment-guide.md` into a stable runbook. Required sections: prerequisites, supported topology, DNS/domains, secrets/env mapping, Supabase bring-up, app deploy via `systemd`, optional OSRM, tracker APK provisioning, smoke checks, and rollback.
- Add `docs/execution/README.md` stating that `docs/execution/` is archive/reference and not source of truth.
- Rewrite `README.md` to stay shallow: repo purpose, workspace layout, local dev summary, and links to `docs/START-HERE.md`, `docs/DEPLOYMENT.md`, and `docs/OPERATIONS.md`. Remove claims that `infra/caab-vans` is the production app stack.
- Update `docs/OPERATIONS.md` to be factual reference only. Fix drift for `.env.local.example`, Studio port `54324`, real query-hook paths, `/api/track` purpose, current migration/script behavior, and the actual validation commands.
- Update `docs/TECH.md` to match the supported deployment model and remove aspirational `infra/app` / app-compose wording.
- Update `apps/van-tracker/README.md` with a production provisioning section: required settings, battery-optimization steps, diagnostics export, and a note that client-specific branding/observability changes are out of scope for this pass.
- Add a short status note near the top of `docs/PRD-MVP.md` stating that it describes the original MVP and legacy link-ingest assumptions, not the deployer source of truth.
- Introduce a production-safe admin bootstrap path with a new `npm run auth:bootstrap` command backed by a script that requires explicit `BOOTSTRAP_SUPERUSER_EMAIL` and `BOOTSTRAP_SUPERUSER_PASSWORD`.
- Reclassify `npm run db:seed` as development-only demo/bootstrap data and remove it from production deployment steps.
- Replace real CAAB-specific domains in canonical docs with placeholders first, then one example block.
- Fix root ESLint ignores so nested workspace artifacts are excluded: `apps/**/.next`, `apps/**/dist`, `apps/**/.expo`, and `supabase/.temp` at minimum.
- Fix tracker workspace ignores so `npm run lint` and `npm run check` do not traverse generated `.next` output.
- Update `.gitignore` entries where needed so generated tracker/web artifacts do not look like source files to newcomers.
- Remove the empty `infra/caab-vans` placeholder from the canonical path. Prefer deleting it; if it must stay, add an explicit `README` saying it is unused.

## Interfaces / Contract Changes
- No HTTP API, database schema, or tracker protocol changes.
- Add one new operator-facing command: `npm run auth:bootstrap`.
- Add two new required env vars for that command: `BOOTSTRAP_SUPERUSER_EMAIL` and `BOOTSTRAP_SUPERUSER_PASSWORD`.
- Change the documented contract of `npm run db:seed` to development-only.
- Change the documented quality-gate expectation so `npm run lint` and `apps/van-tracker npm run check` pass even when generated local artifacts exist.

## Test Plan
- `npm run lint`, `npm run typecheck`, `npm run test -- --run`, and `npm run build` pass from the repo root.
- `apps/van-tracker npm run check` passes after `.next` and `dist` have been generated locally.
- `npm run auth:bootstrap` fails with a clear error when required env vars are missing.
- `npm run auth:bootstrap` succeeds with explicit credentials and does not seed demo schedules/stops.
- A reviewer can start at `README.md` and reach a complete production deployment runbook without opening `docs/execution/`.
- All documented paths, ports, commands, env vars, and file references match the repo.
- A reviewer can follow the tracker provisioning steps and know exactly which base URL, van ID, and token to enter.

## Assumptions and Defaults
- First pass keeps docs in English.
- The supported production model for now is Supabase Docker Compose + Next.js `systemd` service + Caddy + optional OSRM, not an app Docker Compose stack.
- Historical docs are preserved but demoted to archive/reference instead of deleted wholesale.
- Client-specific tracker branding and Sentry reconfiguration are documented as follow-up work, not implemented in this pass.
- No CI/CD, monitoring, backup automation, rate-limiter redesign, or tracking-algorithm changes are included in this pass.
