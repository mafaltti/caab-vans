# Quickstart: Progress Pointer Correctness Fixes

## Prerequisites

- Node.js 20+
- Running Supabase instance (local or dev)
- OSRM instance (optional; segment distances already precomputed)

## Setup

```bash
npm install
cp .env.local.example .env.local
# Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.
```

## Development

```bash
npm run dev          # Next.js dev server
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest
```

## Key Files to Modify

| File | What changes |
|------|-------------|
| `src/lib/tracking/eta.ts` | Multi-segment accumulation (FR-001); route-order fallback (FR-005/010) |
| `src/lib/tracking/resolve-route-progress.ts` | Default mode flip (FR-002); 2-tier staleness (FR-004); includeLastKnown (FR-009) |
| `src/lib/tracking/infer-stop-progress.ts` | Per-stop snap (FR-006); confidence alignment (FR-007); backfill gate (FR-008) |
| `src/lib/time.ts` | New `POINTER_ABSOLUTE_CEILING_MINUTES` constant |
| `src/app/api/routes/route.ts` | Pass `includeLastKnown` query param |
| `src/app/api/routes/[routeId]/route.ts` | Pass `includeLastKnown` query param |

## Key Test Files

| File | What to test |
|------|-------------|
| `src/__tests__/tracking/eta.test.ts` | Multi-segment ETA; partial segment fallback; route-order fallback |
| `src/__tests__/tracking/resolve-route-progress-modes.test.ts` | Default=persisted; 2-tier staleness; includeLastKnown |
| `src/__tests__/tracking/resolve-route-progress.test.ts` | Pointer ceiling; non-active state with opt-in |
| `src/__tests__/tracking/infer-stop-progress.test.ts` | Per-stop snap; confidence sources; backfill gate=1 rejection |

## Testing a Specific Change

```bash
# Run only ETA tests
npx vitest run src/__tests__/tracking/eta.test.ts

# Run only progress mode tests
npx vitest run src/__tests__/tracking/resolve-route-progress-modes.test.ts

# Run only inference tests
npx vitest run src/__tests__/tracking/infer-stop-progress.test.ts

# Run all tracking tests
npx vitest run src/__tests__/tracking/
```

## Environment Variables

| Variable | Default (after this change) | Options |
|----------|---------------------------|---------|
| `TRACKING_PROGRESS_SOURCE` | `persisted` | `legacy`, `shadow`, `persisted` |

## Verification Checklist

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all existing + new tests)
- [ ] `npm run build` succeeds
