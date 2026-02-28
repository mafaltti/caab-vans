# CAAB Vans

Mobile web app to see running CAAB van routes, next scheduled stop/time, announcements, and a live location link.

## Project Documentation

@docs/PRINCIPLES.md
@docs/GIT-WORKFLOW.md
@docs/DELIVERY-WORKFLOW.md
@docs/TECH.md

## Key Workflow Rules

### Branching & PRs

- Feature PRs always target `dev` — never `main`.
- Only `dev → main` promotion PRs target `main`.
- A human merges promotion PRs to `main` (production).
- Use conventional branch names: `feat/`, `fix/`, `chore/`, `docs/`.

### Quality Gates

Before merging, all of the following must pass (when applicable):

- Lint (`eslint`)
- Type-check (`tsc --noEmit`)
- Build (`next build`)
- Tests (`vitest`)

### Code Style

- Write code, comments, and commit messages in **English**.
- Follow existing project conventions — read before writing.
- Keep changes minimal and focused; avoid over-engineering.
- Do not add docstrings, comments, or type annotations to unchanged code.

### Commits

- Use **Conventional Commits** format: `type(scope): description`.
- Keep commits atomic — one logical change per commit.

## Spec Kit workflow

This repo uses GitHub Spec Kit (slash commands `/speckit.*`) for spec-driven development.
