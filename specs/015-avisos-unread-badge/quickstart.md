# Quickstart: Functional Unread Badge for Avisos Tab

**Branch**: `015-avisos-unread-badge` | **Date**: 2026-03-01

## Prerequisites

- Node.js and npm installed
- Project dependencies installed (`npm install`)
- Dev server runnable (`npm run dev`)

## Local Development

```bash
# 1. Checkout the feature branch
git checkout 015-avisos-unread-badge

# 2. Start the dev server
npm run dev

# 3. Open the app in a mobile viewport
# Navigate to http://localhost:3000
```

## Testing the Feature

### Manual Test Flow

1. **Clear localStorage**: Open browser DevTools > Application > Local Storage > clear `avisos_last_seen_at`
2. **Verify badge appears**: Navigate to the home page (`/`). If announcements exist, the red dot should show on the Avisos tab icon.
3. **Verify badge clears**: Tap the Avisos tab. The red dot should disappear.
4. **Verify persistence**: Close and reopen the browser. The badge should remain hidden (no new announcements).
5. **Verify re-trigger**: Create a new announcement via admin, wait up to 60 seconds. The badge should reappear.

### Automated Tests

```bash
# Run unit tests for the read state hook
npx vitest run src/lib/hooks/use-avisos-read-state.test.ts
```

## Quality Gates

```bash
# Lint
npx eslint .

# Type-check
npx tsc --noEmit

# Build
npx next build

# Tests
npx vitest run
```
