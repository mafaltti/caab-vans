# Quickstart: Tracking Progress Hardening

## What This Feature Does

Fixes four correctness bugs in the van tracking progress system:
1. Non-adjacent stop pointers can persist and produce wrong ETAs
2. Confidence scoring depends on nondeterministic ping query ordering
3. Overdue ETA silently hidden instead of showing a "Delayed" indicator
4. `includeLastKnown=true` responses can have inconsistent top-level vs nested fields

## Files to Modify

### Backend (tracking library)
- `src/lib/tracking/infer-stop-progress.ts` — ping query determinism + adjacency at write-time
- `src/lib/tracking/resolve-route-progress.ts` — adjacency check at read-time + `includeLastKnown` consistency

### UI
- `src/components/public/route-card.tsx` — render overdue indicator

### Tests
- `src/__tests__/tracking/infer-stop-progress.test.ts` — adjacency + deterministic query tests
- `src/__tests__/tracking/resolve-route-progress.test.ts` — adjacency rejection tests
- `src/__tests__/tracking/eta.test.ts` — overdue state test
- `src/__tests__/tracking/routes-api.test.ts` — `includeLastKnown` consistency tests

## How to Test

```bash
# Run all tracking tests
npx vitest run src/__tests__/tracking/

# Run specific test suites
npx vitest run src/__tests__/tracking/infer-stop-progress.test.ts
npx vitest run src/__tests__/tracking/resolve-route-progress.test.ts
npx vitest run src/__tests__/tracking/eta.test.ts
npx vitest run src/__tests__/tracking/routes-api.test.ts

# Type-check
npx tsc --noEmit

# Lint
npx eslint .

# Build
npx next build
```

## Key Design Decisions

- **Defense in depth**: Adjacency enforced at both write (infer) and read (resolver) paths
- **No new DB constraints**: Adjacency is an application-level invariant, not a DB constraint
- **No new ETA algorithms**: Only edge-case handling changed; core ETA logic untouched
- **Minimal UI change**: Single component (`route-card.tsx`) gains overdue rendering
