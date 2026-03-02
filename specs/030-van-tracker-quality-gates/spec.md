# Feature Specification: Van Tracker Quality Gates

**Feature Branch**: `030-van-tracker-quality-gates`
**Created**: 2026-03-02
**Status**: Draft
**Input**: User description: "Run quality gates like eslint for the van-tracker app"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run Lint Check Before Committing (Priority: P1)

A developer working on the van-tracker app wants to run a lint check to catch code style violations and potential errors before committing code.

**Why this priority**: Linting is the most fundamental quality gate — it catches bugs, enforces consistency, and is the fastest check to run. Without it, code quality degrades silently.

**Independent Test**: Can be fully tested by running a single command from the van-tracker directory and verifying it reports lint issues (or passes cleanly).

**Acceptance Scenarios**:

1. **Given** a developer is in the `apps/van-tracker` directory, **When** they run the lint script, **Then** ESLint analyzes all project source files and reports any violations.
2. **Given** the codebase has no lint violations, **When** the developer runs the lint script, **Then** the command exits with code 0 (success).
3. **Given** the codebase has lint violations, **When** the developer runs the lint script, **Then** the command exits with a non-zero code and lists the violations with file paths and line numbers.

---

### User Story 2 - Run Type Check Before Committing (Priority: P1)

A developer wants to run the TypeScript compiler to verify type safety across the van-tracker codebase without producing build output.

**Why this priority**: Type checking catches a different class of bugs than linting (wrong types, missing properties, null safety). Equally critical for a strict-mode TypeScript project.

**Independent Test**: Can be fully tested by running a single command and verifying it catches intentionally introduced type errors.

**Acceptance Scenarios**:

1. **Given** a developer is in the `apps/van-tracker` directory, **When** they run the type-check script, **Then** the TypeScript compiler validates all source files without emitting output.
2. **Given** the codebase has no type errors, **When** the developer runs the type-check script, **Then** the command exits with code 0.
3. **Given** a file contains a type error, **When** the developer runs the type-check script, **Then** the command exits with a non-zero code and reports the error location and description.

---

### User Story 3 - Run All Quality Gates at Once (Priority: P2)

A developer wants a single command to run all quality checks (lint + type check) in sequence, so they can validate their changes quickly before pushing.

**Why this priority**: Running individual checks is useful for debugging, but developers need a convenient "run everything" command for pre-push validation. Lower priority because it composes the P1 stories.

**Independent Test**: Can be tested by running the combined command on a clean codebase (should pass) and on a codebase with intentional errors (should fail and report which gate failed).

**Acceptance Scenarios**:

1. **Given** a developer is in the `apps/van-tracker` directory, **When** they run the combined quality gates command, **Then** lint and type check run in sequence.
2. **Given** all checks pass, **When** the developer runs the combined command, **Then** it exits with code 0.
3. **Given** lint fails but types are correct, **When** the developer runs the combined command, **Then** it exits with a non-zero code after the lint step (fast-fail behavior).

---

### Edge Cases

- What happens when a required dev dependency (e.g., ESLint) is not installed? The script should fail with a clear error from the missing binary, prompting the developer to run `npm install`.
- What happens if new source files are added outside `app/` and `src/`? The lint configuration should cover all relevant directories without needing script updates.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The van-tracker project MUST provide a lint script that runs ESLint on all project source files.
- **FR-002**: The van-tracker project MUST provide a type-check script that runs the TypeScript compiler in check-only mode (no emit).
- **FR-003**: The van-tracker project MUST provide a combined script that runs lint and type check in sequence, failing fast on the first error.
- **FR-004**: All quality gate scripts MUST exit with code 0 on success and non-zero on failure, following standard CLI conventions.
- **FR-005**: The lint script MUST cover files in both `app/` and `src/` directories.
- **FR-006**: Quality gate scripts MUST be runnable from the `apps/van-tracker` directory using the project's package manager.
- **FR-007**: Script naming MUST follow the same conventions as the root project (`lint`, `typecheck`) for monorepo consistency.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can validate code quality with a single command that completes in under 30 seconds on a clean codebase.
- **SC-002**: All quality gate scripts correctly detect and report violations (zero false negatives for standard lint rules and type errors).
- **SC-003**: The existing van-tracker source code passes all quality gates without requiring code changes.
- **SC-004**: Script names are consistent with the root project, so developers do not need to remember different commands per workspace.

## Assumptions

- The existing ESLint configuration (`.eslintrc.js` extending `expo`) is sufficient and does not need modification.
- The existing TypeScript configuration (`tsconfig.json` with strict mode) is sufficient and does not need modification.
- Prettier formatting is a developer-editor concern and does not need a dedicated quality gate script at this time.
- No CI/CD pipeline exists yet; these scripts are for local developer use.

## Scope Boundaries

**In scope**:
- Adding npm scripts to `apps/van-tracker/package.json`
- Verifying existing code passes all gates

**Out of scope**:
- Modifying ESLint or TypeScript configuration
- Adding test framework or test scripts (no test files exist yet)
- CI/CD pipeline integration
- Pre-commit hooks
- Prettier format-check script
