## Git Workflow (How to Work in This Repo)

### Branches
- Always work on a feature branch (never commit directly to `dev` or `main`)

### Where PRs Go (IMPORTANT)
- Feature PRs: **base branch must be `dev`**
- Production promotion: open a PR **from `dev` → `main`**

### Standard Flow (AI-Allowed vs Human-Only)
**AI may do:**
1) Create/update a feature branch from `dev`.
2) Implement changes with small, reviewable commits.
3) Run checks locally when possible (lint/typecheck/tests/build).
4) Open a PR targeting `dev` with summary + test plan + screenshots (if UI).
5) If requested, prepare a promotion PR `dev` → `main` with a clean release note.

**AI must NOT do:**
- Merge any PR into `main`.
- Approve/force production deployment.
- Bypass CI or branch protections.

**Human maintainer does:**
- Validate DEV deployment after merge to `dev`.
- Review and merge the promotion PR `dev` → `main`.
- Smoke test PROD.

### PR Template (Use This)
- **What changed:** …
- **Why:** …
- **How to test (DEV):** …
- **Migration/Env var notes:** …
- **Risks / rollback:** …