## Delivery Workflow (Git, PRs, Deployments)

### Branch Roles
- `main` is the **Production** branch.
- `dev` is the **Development/Integration** branch (DEV environment).
- All work happens on short-lived feature branches

### Merge Policy
- No direct pushes to `dev` or `main`. All changes land via PR.
- **Feature PRs MUST target `dev`.**
- **Only promotion PRs from `dev` to `main` may target `main`.**
- **Production merges are human-only:** only a human maintainer may merge a `dev → main` promotion PR.

### Deployment Mapping
- Merges into `dev` deploy to **DEV**.
- Merges into `main` deploy to **PROD**.

### Quality Gates (Required Before Merge)
- Lint + typecheck must pass.
- Tests must pass (when applicable).
- Build must pass.
- PR description must include how to test (or why not needed).