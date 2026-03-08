# Tracker Architecture — Consolidated Analysis

Cross-referencing doc 0057 improvement proposals against the actual codebase, plus newly identified gaps.

---

## Part 1: Assessment of Existing Proposals (doc 0057)

### Verified Current State

| # | Proposal | Doc Claim | Verified | Code Reference |
|---|----------|-----------|----------|----------------|
| 1 | Batch flush endpoint | Sequential sends | Confirmed | `task.ts:46-59` loops one-by-one |
| 2 | Send current first | Buffer flushes first | Confirmed | `task.ts:168` before `:171` |
| 3 | Increase buffer to 200+ | 50 max | Confirmed | `buffer.ts:5` `MAX_BUFFER_SIZE = 50` |
| 4 | Exponential backoff | No retry logic | Partially correct | Breaks on 5xx (`task.ts:54-59`) but no delay |
| 5 | Reduce timeout 15s to 8s | 15s timeout | Confirmed | `client.ts:22` `REQUEST_TIMEOUT = 15000` |
| 6 | Request compression | No gzip | Confirmed | `client.ts:55-63` plain JSON |
| 7 | Network-quality throttling | No adaptation | Confirmed | `task.ts:160` binary online/offline only |
| 8 | Buffer TTL cleanup | Not implemented | Confirmed | Server has 24h guard (`route.ts:73`), client doesn't |
| 9 | Lightweight keep-alive | Not implemented | Confirmed | No heartbeat mechanism |

### Detailed Assessment

**1. Batch Flush Endpoint — AGREE: HIGH IMPACT**
The sequential loop in `flushBuffer()` sends 50 individual HTTP requests. On 3G (~300ms RTT), that's 15+ seconds of sustained activity. A single batch POST reduces this to one round trip.

Server caveat: the ingestion endpoint does OSRM snap-to-road for the "newest" point (`route.ts:129-152`). A batch endpoint must only snap the final chronological point, not all 50.

Also note: server rate limit is 25 req/min per van (`route.ts:11`). A 50-point sequential flush would be throttled at point 26. Batch endpoint fixes this too.

**2. Send Current First — AGREE: HIGH IMPACT, quick win**
`task.ts:168` flushes buffer before `task.ts:171` sends the current point. Swapping the order means the UI sees the van's real-time position immediately on reconnect.

One agent flagged that buffer-first is "safer for reliability," but this doesn't hold — both operations are independent HTTP calls with their own error handling. The current point is the most valuable; flush is background work.

**3. Increase Buffer — AGREE: HIGH IMPACT, quick win**
`buffer.ts:5` is a single constant. At 12 pings/min (moving), 50 points = 4 min. Recommend 100 points (~8 min moving, ~1.5h stationary). AsyncStorage handles 100 * ~100 bytes = ~10KB easily.

**4. Exponential Backoff — AGREE: MEDIUM IMPACT**
The code already differentiates 4xx vs 5xx vs network errors well. But between task invocations (~5s), there's no increasing delay. Module-level state (`let consecutiveFailures = 0; let backoffDeadline = 0`) would work — same pattern as the existing `lastSentLat/Lng` hydration.

**5. Timeout 15s to 8s — AGREE: MEDIUM IMPACT, quick win**
`client.ts:22` is a one-line change. On 3G, a stalled request blocks the entire task callback. 8-10s is more appropriate.

**6. Request Compression — DISAGREE: LOW PRIORITY**
React Native's `fetch` doesn't natively support request-side gzip. Requires a dependency like `pako` (~50KB). The real win comes from batching first (1 request instead of 50), which eliminates 49x HTTP overhead. Compression on top of batching saves ~7KB — marginal on 3G. Implement only after batch endpoint proves insufficient.

**7. Network-quality Throttling — AGREE: LOW-MEDIUM**
`NetInfo.fetch()` already runs (`task.ts:160`). Adding `netState.type` and `details.cellularGeneration` checks is straightforward. But GPS update interval is OS-level (`tracking.ts:37`, `timeInterval: 5000`), so client-side throttling means "buffer more aggressively" rather than "get fewer GPS fixes."

**8. Buffer TTL — AGREE: MEDIUM**
Server rejects pings > 24h old (`route.ts:73-75`). Client-side pre-filter during flush avoids wasting bandwidth sending points the server will reject. Simple filter at the top of `flushBuffer()`.

**9. Keep-alive Heartbeat — DISAGREE for MVP**
Better addressed by the "task health detection" gap identified below (#13). A heartbeat is reactive (server notices); task health detection is proactive (app warns driver immediately).

---

## Part 2: Missing Improvements (Not in doc 0057)

### Critical — Ship Before Production

#### 10. 5xx Errors Don't Buffer Current Point — SEVERITY: HIGH, EFFORT: Tiny

When the current point (not buffer flush) gets a 5xx server error, it is **silently lost**. Only `NetworkError` triggers buffering (`task.ts:200-201`). A 503 or 500 response means the point disappears.

```
task.ts:195 → await persistError(`Error: ${result.message}`);
// Point is NOT buffered here — data loss
```

**Fix**: Add `await addToBuffer(point)` in the 5xx else branch at `task.ts:194-196`.

#### 11. Android Task Kill Detection — SEVERITY: HIGH, EFFORT: Medium

If Android kills the background task (battery optimization, OEM restrictions on Samsung/Xiaomi), the driver sees "Tracking: ON" but no data is being sent. No detection mechanism exists.

**Fix**: Store `@lastTaskInvocationAt` timestamp on each task callback. Home screen checks if `Date.now() - lastInvocation > 5 min` and shows a warning. Covers the most common failure mode.

#### 12. No Operator Observability — SEVERITY: HIGH, EFFORT: Medium

Operations has no way to know if a tracker is silently failing. The only signal is `location_updated_at` going stale in the DB. No client-side metrics are reported: buffer size, consecutive failures, battery level, network quality.

**Fix**: Periodic lightweight health POST: `{ bufferSize, consecutiveFailures, battery, networkType, ts }`. New endpoint or piggyback on existing tracking endpoint.

### Important — Next Sprint

#### 13. Battery-Adaptive GPS Accuracy — SEVERITY: MEDIUM, EFFORT: Small

`tracking.ts:36` always uses `Location.Accuracy.High`. A stationary van with low battery still polls GPS every 5s at high accuracy.

**Fix**: Use `expo-battery` to detect level. Below 20%, downgrade to `Accuracy.Balanced` and increase `timeInterval` to 10s.

#### 14. Auth Token Handling on 401 — SEVERITY: MEDIUM, EFFORT: Tiny

If the ingestion token is revoked server-side, the app gets 401s but doesn't buffer (`task.ts:191-193`). Points are lost and the only feedback is a status text. No escalation or pause.

**Fix**: After 3+ consecutive 401s, pause sending and show a persistent "Reconfigure token" alert. Buffer points in the meantime (token might be re-enabled).

#### 15. Buffer Race Condition — SEVERITY: MEDIUM, EFFORT: Small

`addToBuffer()` and `removeFromBuffer()` both do read-modify-write on AsyncStorage (`buffer.ts:19-41`). If two task callbacks overlap (theoretically possible with rapid GPS fixes), they could read stale state and lose points.

**Fix**: Simple in-memory mutex or operation queue for buffer access.

#### 16. Sequence Numbering — SEVERITY: MEDIUM, EFFORT: Small-Medium

Points have no sequence number. Server can't detect if 3 points were lost to timeout or buffer overflow. No gap detection.

**Fix**: Add monotonic `seq` to `LocationPoint`. Server tracks `last_seq` per van and logs gaps.

### Lower Priority — Refinement

#### 17. Error Reporting Service — SEVERITY: MEDIUM, EFFORT: Low

No Sentry/Bugsnag integration. `console.error()` in production goes nowhere. Crashes are invisible.

#### 18. Token in Plaintext — SEVERITY: LOW, EFFORT: Low

Ingestion token stored unencrypted in AsyncStorage (`settings.ts:24`). Should use `expo-secure-store`.

#### 19. AsyncStorage Performance at Scale — SEVERITY: LOW, EFFORT: Medium

If buffer grows large, every `addToBuffer()` deserializes and re-serializes the full JSON array. O(n) per GPS callback. Fine at 100, not a concern at this scale.

---

## Part 3: Revised Priority Matrix

### Immediate (one-line fixes)

| # | Fix | Effort | File:Line |
|---|-----|--------|-----------|
| 10 | Buffer current point on 5xx | 1 line | `task.ts:194` |
| 2 | Send current point first | Swap 2 lines | `task.ts:168-171` |
| 3 | Increase buffer to 100 | Change constant | `buffer.ts:5` |
| 5 | Reduce timeout to 8-10s | Change constant | `client.ts:22` |

### Short-term (1-2 days each)

| # | Fix | Effort |
|---|-----|--------|
| 1 | Batch flush endpoint | New server endpoint + client changes |
| 4 | Exponential backoff | Module-level state + delay logic |
| 8 | Buffer TTL client-side | Filter before flush |
| 11 | Task kill detection | AsyncStorage timestamp + Home screen check |
| 14 | 401 escalation | Consecutive failure counter + UI alert |

### Medium-term (sprint)

| # | Fix | Effort |
|---|-----|--------|
| 12 | Health/observability endpoint | New endpoint + client reporting |
| 13 | Battery-adaptive GPS | expo-battery + conditional config |
| 16 | Sequence numbering | Client counter + server tracking |
| 15 | Buffer mutex | In-memory lock for async operations |

### Later

| # | Fix | Notes |
|---|-----|-------|
| 17 | Error reporting (Sentry) | Standard integration |
| 18 | SecureStore for token | Migration from AsyncStorage |
| 6 | Request compression | Only after batch proves insufficient |
| 7 | Network-quality throttling | Nice-to-have tuning |
| 19 | Storage optimization | Only if buffer grows past 500+ |
