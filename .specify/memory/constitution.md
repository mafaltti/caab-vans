<!--
  Sync Impact Report
  ==================
  Version change: (new) → 1.0.0
  Modified principles: N/A (initial fill from template)
  Added sections:
    - I. Simplicity (KISS / DRY / YAGNI)
    - II. Explicit Trade-offs in PRs
    - III. Branch & Merge Discipline
    - IV. Quality Gates (Non-Negotiable)
    - V. Stack Constraints (Non-Negotiable)
    - Security Constraints
    - Timezone & Data Consistency
    - Governance
  Removed sections: N/A
  Templates requiring updates:
    - .specify/templates/plan-template.md — ✅ no update needed
      (Constitution Check section is dynamically filled by /speckit.plan)
    - .specify/templates/spec-template.md — ✅ no update needed
      (spec template is requirement-focused, no principle references)
    - .specify/templates/tasks-template.md — ✅ no update needed
      (task phases are generic; constitution gates enforced at plan time)
    - .specify/templates/commands/*.md — no files found, nothing to update
  Follow-up TODOs: none
-->

# CAAB Vans Constitution

## Core Principles

### I. Simplicity (KISS / DRY / YAGNI)

Every change MUST follow these three rules:

- **KISS**: Prefer straightforward solutions. Do not introduce speculative
  complexity.
- **DRY**: Extract duplication only after **three or more** real repetitions
  with identical logic. Prefer the right abstraction over a premature one.
- **YAGNI**: Build only what is necessary now. Do not add options, indirection,
  or configurability "just in case."

**When to abstract:**

- A pattern repeats >= 3 times with identical logic.
- The abstraction has a clear single responsibility.
- The short-term roadmap will reuse it.
- Benefits outweigh the added indirection.

**When NOT to abstract:**

- Only 1-2 occurrences exist.
- Logic differs slightly between occurrences.
- The only justification is "we might need it later."
- It hurts code clarity.

### II. Explicit Trade-offs in PRs

Every PR description MUST include:

- Which principle(s) from this constitution the change applies.
- Before/after snippets for any refactor.
- An explicit statement of trade-offs (e.g., duplication kept vs. abstraction
  introduced, and why).
- Justification for any new abstraction with concrete duplication or near-term
  reuse evidence.

PRs MUST be minimal diffs. Small, focused PRs are safer and easier to review.

### III. Branch & Merge Discipline

- All work MUST happen on short-lived feature branches. Direct pushes to `dev`
  or `main` are forbidden.
- **Feature PRs MUST target `dev`** — never `main`.
- **Only promotion PRs from `dev` to `main` may target `main`.**
- **Production merges are human-only**: only a human maintainer may merge a
  `dev -> main` promotion PR.
- AI agents MUST NOT merge any PR into `main`, approve or force production
  deployments, or bypass CI/branch protections.
- Use conventional branch names: `feat/`, `fix/`, `chore/`, `docs/`.
- Use Conventional Commits format: `type(scope): description`.

### IV. Quality Gates (Non-Negotiable)

Before any PR may be merged, **all** of the following MUST pass:

1. **Lint** — `eslint` reports zero errors.
2. **Type-check** — `tsc --noEmit` reports zero errors.
3. **Build** — `next build` completes successfully.
4. **Tests** — `vitest` passes (when test suites exist for affected code).

The PR description MUST include how to test the change, or an explicit
justification for why testing instructions are not applicable.

### V. Stack Constraints (Non-Negotiable)

The following technology decisions are locked for this project:

- **Web frontend + BFF**: Next.js (App Router) with TypeScript. The BFF layer
  uses Next.js Route Handlers (`/app/api/*`).
- **UI**: Tailwind CSS + shadcn/ui (Radix + Nova style, Zinc base, Blue theme,
  Lucide icons, Inter font).
- **Data fetching**: TanStack Query (polling, caching, request dedupe).
- **Validation**: Zod for API inputs and internal operations.
- **Date/time**: Luxon, forced to `America/Bahia`.
- **Backend**: Supabase official Docker self-host setup (Postgres, Auth,
  Realtime, Storage, Studio).
- **Supabase Edge Functions MUST NOT be used.** Skip or disable if present.
- **Reverse proxy**: Caddy as the single public entrypoint (TLS + routing).
- **Tooling**: ESLint + Prettier.

Computed fields (next stop, isOutdated, status labels) MUST be calculated in
the BFF for consistency across clients. The UI may run local countdown timers
for smooth visual updates.

## Security Constraints

- The Supabase **anon key** is treated as public. All public access MUST be
  controlled by RLS policies and Auth roles/claims.
- The Supabase **service role key** is server-only. It MUST only be used in
  Next.js server runtime (Route Handlers) and secure ops scripts. It MUST
  NEVER be shipped to browsers or mobile clients.
- Supabase **Studio** MUST be restricted via Basic auth at the Caddy reverse
  proxy layer.
- The Postgres port MUST NOT be exposed publicly.

## Timezone & Data Consistency

- Canonical timezone: **America/Bahia**.
- All displayed times MUST use `HH:mm` format in the `America/Bahia` timezone.
- All date/time operations MUST use Luxon configured with this timezone.

## Governance

- This constitution is the highest-authority document for the project. It
  supersedes all other practices and conventions when conflicts arise.
- All PRs and code reviews MUST verify compliance with these principles.
- Amendments to this constitution require:
  1. A PR with the proposed change and explicit rationale.
  2. Review and approval by a human maintainer.
  3. Version bump following semantic versioning:
     - **MAJOR**: Principle removed or redefined incompatibly.
     - **MINOR**: New principle/section added or materially expanded.
     - **PATCH**: Clarifications, wording, or typo fixes.
- Refer to `docs/PRINCIPLES.md`, `docs/GIT-WORKFLOW.md`,
  `docs/DELIVERY-WORKFLOW.md`, and `docs/TECH.md` as authoritative source
  documents that inform this constitution.

**Version**: 1.0.0 | **Ratified**: 2026-02-26 | **Last Amended**: 2026-02-26
