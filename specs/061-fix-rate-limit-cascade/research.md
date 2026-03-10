# Research: Fix Rate-Limit 429 Cascade

## R1: Optimal Rate Limit Value

**Decision**: Raise from 25 to 40 requests per 60-second sliding window per van.

**Rationale**: Van 02's observed peak is ~25 pings/min (2s intervals while moving). 40/min provides 60% headroom. At 4 vans × 40/min = 160 req/min peak, the server can handle it: 16/100 DB connections used, PostgREST pool of 10 handles ~100-200 req/s (160/min = 2.7/s), OSRM sub-200ms, 3% CPU baseline.

**Alternatives considered**:
- 30/min: Only 20% headroom — too tight if a 5th van is added or device behavior changes.
- 50/min: Unnecessary headroom; increases theoretical peak to 200 req/min (still safe, but no observed need).
- Adaptive/dynamic limit: Over-engineering for 4 vans. YAGNI.

## R2: 429 Handling in Single-Ping Path

**Decision**: Buffer the rejected point via `addToBuffer(point)` instead of dropping it.

**Rationale**: Current code at `task.ts:355-358` silently discards the GPS point on 429. This permanently loses location data. The buffer infrastructure already exists (max 100 points, 24h TTL, FIFO eviction, mutex-protected) and is used for network errors and 5xx responses. Using it for 429 is consistent and requires adding one function call.

**Alternatives considered**:
- Keep dropping: Unacceptable — permanent data loss.
- Immediate retry with delay: Would block the background task callback and could cascade.
- Client-side adaptive throttle: Good long-term (analysis Approach D) but ~20 lines vs 1 line. Can be added later if needed.

## R3: Backoff Behavior on 429

**Decision**: Do not call `onSendFailure()` on 429 responses in either the single-ping or batch-flush paths.

**Rationale**: 429 is flow-control, not a server error. `onSendFailure()` increments `consecutiveFailures` and sets `backoffUntil` with exponential delays (5s → 5min). This causes multi-minute blackouts where the van disappears from the map. The fix:

- **Single-ping path** (`task.ts:354-358`): Already does not call `onSendFailure()`, but also doesn't buffer. Fix: add `addToBuffer(point)`, keep no-backoff behavior.
- **Batch-flush path** (`task.ts:130-132`): Currently calls `onSendFailure()`. Fix: remove this call. Buffer is already kept intact (no `removeFromBuffer` called on 429).

**Alternatives considered**:
- Reduced backoff for 429 (e.g., fixed 3s instead of exponential): Still introduces unnecessary delay. 429 just means "try again next cycle."
- Reset backoff on 429: Could mask real server errors if a 429 arrives between 5xx failures.

## R4: Documentation Scope

**Decision**: Update only operational and contract documentation that users/operators reference. Leave historical execution docs and old spec artifacts unchanged.

**Rationale**: Files like `docs/execution/0102-rate-limiting-analysis-van-tracker.md` and `specs/016-live-tracking-ingestion/research.md` are historical records. Changing them would misrepresent what was decided at that time. Active references that need updating:

| File | Why |
|------|-----|
| `docs/OPERATIONS.md` | Operator reference — must reflect current limits |
| `docs/android-app+tracking/live-tracking-spec.md` | Active tracking system spec |
| `docs/android-app+tracking/expo-background-geolocation-app.md` | Active tracker app spec |
| `specs/018-expo-tracker-app/contracts/tracking-api.md` | Active API contract |
| `specs/040-tracker-resilience/contracts/batch-tracking-api.md` | Active batch API contract |

**Alternatives considered**:
- Update all 16 files: Noisy, large diff, rewrites history.
- Update none: Operators would see wrong limits in active docs.

## R5: Test Strategy

**Decision**: Server-side rate limit change needs no new tests (existing tests mock the rate limiter). Tracker-side 429 handling has no test suite — manual testing via simulated 429 responses.

**Rationale**: The existing tests at `src/__tests__/tracking/tracking-dedup.test.ts` and `tracking-batch.test.ts` mock the rate limiter with `() => ({ allowed: true })`. The rate limit value itself (25 vs 40) is a configuration choice, not logic to test. The van-tracker app has zero test infrastructure — adding a test suite is out of scope for this fix (YAGNI for a 3-line change).

**Alternatives considered**:
- Add rate limiter unit tests: The rate limiter is 45 lines of straightforward sliding-window logic. Testing the config value is a tautology.
- Add van-tracker test suite: Major effort (jest/vitest setup for React Native, mocking expo-task-manager, AsyncStorage). Disproportionate to a 3-line fix.
