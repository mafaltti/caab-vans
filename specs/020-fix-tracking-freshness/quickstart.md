# Quickstart: Fix Tracking Freshness Check

## What this changes

Replaces the `isSameDay` calendar-day freshness check with a recency-based `isLocationFresh` check using a 10-minute threshold. Vans will correctly show as "Em operacao" when GPS pings are recent, regardless of midnight boundaries.

## Files to modify

1. **`src/lib/time.ts`** — Remove `isSameDay`, add `STALENESS_THRESHOLD_MINUTES` constant and `isLocationFresh(dt: DateTime): boolean` function.
2. **`src/app/api/routes/route.ts`** — Replace `isSameDay` import/usage with `isLocationFresh`.
3. **`src/app/api/routes/[routeId]/route.ts`** — Same replacement as above.
4. **`src/__tests__/time/is-location-fresh.test.ts`** — New test file for the freshness function.

## How to test

```bash
# Run unit tests
npm test

# Manual test: send a tracking ping and check API response
npm run tracking:simulate
curl http://localhost:3000/api/routes | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);r.routes.forEach(x=>console.log(x.name,x.isRunning,x.van.isLocationOutdated))})"
```

## Quality gates

```bash
npm run lint
npm run typecheck
npm run build
npm test
```
