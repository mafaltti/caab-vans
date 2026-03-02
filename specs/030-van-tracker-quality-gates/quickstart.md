# Quickstart: Van Tracker Quality Gates

## Prerequisites

- Node.js installed
- Dependencies installed (`npm install` in `apps/van-tracker/`)

## Usage

From the `apps/van-tracker/` directory:

```bash
# Run ESLint on all source files
npm run lint

# Run TypeScript type check (no output emitted)
npm run typecheck

# Run all quality gates (lint + typecheck, fails fast)
npm run check
```

## Expected Behavior

- **Pass**: command exits with code 0, no output (or clean summary).
- **Fail**: command exits with non-zero code, violations listed with file paths and line numbers.

## Scripts Added to package.json

```json
{
  "scripts": {
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "check": "npm run lint && npm run typecheck"
  }
}
```
