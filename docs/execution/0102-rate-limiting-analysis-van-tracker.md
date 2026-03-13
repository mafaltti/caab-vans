# Rate Limiting Analysis: Van Tracker vs Server

## The Problem

Van 02 sends pings every 2 seconds while moving. The server rate limit is 25 requests per 60-second sliding window. This means:

- **Allowed throughput:** 1 request every 2.4 seconds
- **Actual device rate:** 1 request every 2.0 seconds
- **Overshoot:** ~17% of pings arrive faster than the limit allows

When the limit is hit, 429s cascade into exponential backoff (5s → 10s → 30s → 1min → 2min → 5min), causing multi-minute blackouts. Worse, rate-limited pings are dropped, not buffered — the data is permanently lost.

---

## Evidence from Van 02 Today

```
18:34:12 - 18:35:06  │  25 pings at ~2s intervals → hits ceiling
18:35:06 - 18:36:08  │  25 more pings, still at ceiling (some rejected)
18:36:08 - 18:40:16  │  4-minute blackout (backoff spiral)
18:40:16             │  1 lonely ping, then silence again
18:43:20             │  1 ping (3 min gap)
18:46:15             │  1 ping (3 min gap) → backoff still active
18:49:24             │  1 ping (3 min gap)
```

The backoff never fully recovers because the device keeps hitting the limit whenever it resumes bursting.

---

## Why Van 01 Is Fine

Van 01's peak rate is only 14 pings per 60s (median interval 5.0s). It never comes close to the 25/min ceiling. The difference is likely device-specific — different Android OEM behavior for `distanceInterval: 10` callback frequency.

---

## Approach Analysis

### Approach A: Raise Server Rate Limit (25 → 40/min)

| Aspect | Assessment |
|---|---|
| Fixes the problem? | Yes, for current devices. Van 02 peaks at 25/min, so 40 gives 60% headroom |
| Effort | 1 line change in each of 2 files |
| Risk | More DB load — each ping triggers ~6–8 PostgREST queries (upsert + OSRM lookup + position update + snap write + stop inference chain). At 40/min × 4 vans = 160 req/min worst case → ~1,000 DB queries/min |
| DB capacity | Current: 16/100 connections used, PostgREST pool = 10. At peak, 4 vans × 40 pings/min = 160 concurrent request chains. Each chain takes ~50–100ms in serial. Tight but manageable |
| Sustainability | Fragile. If a 5th van is added or a device sends even faster, we hit the same problem again |
| Server-side cost | Each ping: 1 van auth + 1 upsert + 1 select recent 5 + 1 OSRM HTTP + 1 RPC + 1 update snap + ~5 inference queries = ~10 DB roundtrips. At 40/min/van = ~400 DB ops/min/van |

### Approach B: Increase Tracker `timeInterval` (5s → 6–8s)

| Aspect | Assessment |
|---|---|
| Fixes the problem? | Partially. `timeInterval` is a minimum — Android can fire faster due to `distanceInterval: 10`. Van 02 proves this: it sends every 2s despite `timeInterval: 5000` |
| Effort | 1 line change in tracker, requires app update on all devices |
| Risk | Reduces location resolution for all vans, including Van 01 which is fine at 5s |
| Sustainability | Doesn't solve the root cause — `distanceInterval` can still trigger faster |
| Real effect | Minimal. The `distanceInterval` callback overrides `timeInterval` when the van is moving |

### Approach C: Buffer 429'd Pings Instead of Dropping

| Aspect | Assessment |
|---|---|
| Fixes the problem? | Partially. Data is preserved, but the map still appears stuck until the buffer flushes. The batch endpoint also has a 25/min limit, so the flush request itself can be rejected too |
| Effort | Small change in `task.ts` — change 429 handler from `skip` to `addToBuffer(point)` |
| Risk | Buffer can fill up (max 100 points). If rate limiting persists, buffer overflows and oldest points are dropped anyway. Also, batch flush after a burst sends all points at once, increasing server load in spikes |
| Sustainability | Treats symptoms, not cause. The van still goes dark on the map during the buffer phase |
| Real-time impact | None — the van position (`last_lat`/`lng`) only updates when a ping reaches the server. Buffered pings don't update the map |

### Approach D: Client-Side Adaptive Throttle (Best)

Instead of a fixed server rate limit, have the tracker self-regulate based on 429 responses:

| Aspect | Assessment |
|---|---|
| Fixes the problem? | Yes. When a 429 is received, the tracker increases its `MIN_INTERVAL` dynamically (e.g., 3s → 4s → 5s) until 429s stop. On success, it slowly decreases back. This prevents the backoff spiral entirely |
| Effort | Medium — ~20 lines in `task.ts` |
| Risk | Low. The tracker already has throttle state in module-level variables |
| Sustainability | Self-adjusting. Works regardless of how many vans, how fast Android fires callbacks, or what the server limit is |
| Real-time impact | Pings keep flowing (at slightly reduced rate) instead of going dark for minutes |

However, this still requires an app update. And it doesn't fix the fact that the current 429 handling triggers exponential backoff.

### Approach E: Raise Rate Limit + Buffer 429s + Remove Backoff on 429 (Recommended Combo)

| Component | Change |
|---|---|
| Server: raise limit to 40/min | Handles current peak (25/min) with 60% headroom. 1 line × 2 files |
| Tracker: buffer 429s instead of dropping | No data loss when limit is hit. 3 lines in `task.ts` |
| Tracker: don't increment `consecutiveFailures` on 429 | Prevents backoff spiral. 429 is not a server error — it's flow control. The current code treats 429 like a 500, escalating to 5-minute backoff. Fix: just skip, don't call `onSendFailure()` |

This is the most robust solution because:

1. Immediate server fix (raise limit) stops the bleeding for existing app versions
2. Client fixes (buffer + no backoff) prevent the cascade when hit
3. No data loss — rejected pings are preserved and flushed later
4. No backoff spiral — 429 doesn't escalate to minutes of silence

---

## Cost/Capacity Validation

At 40 req/min/van × 4 vans = 160 req/min peak:

- **DB connections:** 16 used of 100 — plenty of room
- **PostgREST pool:** 10 — each request takes ~50–100ms, so 10 connections can handle ~100–200 req/s. 160/min = 2.7/s — well under capacity
- **OSRM:** local container, sub-200ms per request — fine
- **CPU/RAM:** currently 3% CPU, 121 MiB for Postgres — negligible increase

---

## Summary

| Approach | Fixes stuck? | Data loss? | Backoff spiral? | Effort | Requires app update? |
|---|---|---|---|---|---|
| A: Raise limit only | Yes (for now) | Still possible | Still possible | 1 line × 2 | No |
| B: Increase `timeInterval` | Partial | No | No | 1 line | Yes |
| C: Buffer 429s only | Partial (map still stuck) | No | Still possible | 3 lines | Yes |
| D: Adaptive throttle | Yes | No | No | ~20 lines | Yes |
| E: Raise + Buffer + No backoff | Yes | No | No | ~10 lines total | Server: No, Client: Yes |

**Recommendation: Approach E.** The server-side rate limit increase (40/min) can be deployed immediately without an app update, fixing Van 02 right now. The client-side changes (buffer 429s + don't backoff on 429) go into the next tracker build as a safety net.
