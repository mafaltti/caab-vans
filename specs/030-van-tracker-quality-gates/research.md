# Research: Van Tracker Quality Gates

## R1: Script Naming Convention

**Decision**: Use `lint`, `typecheck`, and `check` as script names.
**Rationale**: Root project `package.json` already uses `lint` and `typecheck`. Using the same names ensures monorepo consistency (SC-004). `check` is the combined command (FR-003).
**Alternatives considered**:
- `lint:check` / `type:check` — rejected, inconsistent with root project naming.
- `validate` for combined — rejected, `check` is shorter and more conventional.

## R2: ESLint Invocation

**Decision**: Run `eslint` (no arguments) — same as root project.
**Rationale**: ESLint v9 defaults to linting the current directory. The `.eslintrc.js` already has `ignorePatterns: ["node_modules/", "dist/", ".expo/"]` which excludes non-source directories. Tested: exits 0 on clean codebase. Matches root project's `"lint": "eslint"` pattern exactly.
**Alternatives considered**:
- `eslint .` — equivalent but adds unnecessary argument vs root convention.
- `eslint app/ src/` — rejected, would miss new top-level source dirs (edge case in spec).

## R3: TypeScript Check Invocation

**Decision**: Run `tsc --noEmit` (standard type check without output).
**Rationale**: The `tsconfig.json` already has `strict: true` and extends `expo/tsconfig.base`. No flags beyond `--noEmit` are needed (FR-002).
**Alternatives considered**:
- `tsc -b --noEmit` (project references) — rejected, no project references configured.
- `expo typescript:check` — no such command exists in Expo CLI.

## R4: Combined Script Strategy

**Decision**: Use `npm run lint && npm run typecheck` for the `check` script.
**Rationale**: The `&&` operator provides fast-fail behavior (FR-003 AC-3): if lint fails, typecheck is skipped. Lint runs first because it's faster and catches more common issues.
**Alternatives considered**:
- `concurrently` (parallel) — rejected, adds a dependency; sequential is simpler (KISS) and provides clearer output.
- Run typecheck first — rejected, lint is faster and more likely to catch issues.

## R5: Dependency Requirements

**Decision**: No new dependencies needed.
**Rationale**: ESLint (^9.39.3), eslint-config-expo (^55.0.0), and TypeScript (~5.9.2) are already in devDependencies. All tooling is pre-installed.
