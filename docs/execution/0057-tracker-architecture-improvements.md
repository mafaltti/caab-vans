# Tracker Architecture — Improvement Opportunities

Based on the current architecture, here are the concrete improvement opportunities ranked by impact for the scenario (low-end phone, 3G, spotty coverage, shared hotspot):

## High Impact

### 1. Batch Flush Endpoint

**Current problem:** When the buffer has 50 points and connectivity returns, it sends 50 sequential HTTP requests. On 3G with shared hotspot, each round trip is ~200–500ms. That's 10–25 seconds of sustained network activity competing with commuters' browsing.

**Fix:** Add `POST /api/tracking/{vanId}/batch` that accepts an array of points. Flush the entire buffer in one request instead of 50.

- Payload: 50 points × ~200 bytes = ~10KB (one request)
- vs. current: 50 × (~200 bytes payload + ~500 bytes HTTP overhead) = ~35KB across 50 round trips
- Eliminates 49 TCP handshakes and HTTP round trips

### 2. Send Current Position First, Backfill Later

**Current problem:** `flushBuffer()` runs before sending the current point (`task.ts:168`). If the van was offline for 30 minutes, it spends time uploading old positions before the user sees where the van is right now.

**Fix:** Invert the order — send the live point first, then flush the buffer in the background. The public UI cares about current position, not history.

### 3. Increase Buffer Capacity

**Current:** 50 points max. At 1 ping/min (stationary), that's 50 minutes of offline coverage. At 12 pings/min (moving), that's ~4 minutes. A van driving through a rural no-coverage zone for 10+ minutes loses data.

**Fix:** Increase to 200–500 points. A `LocationPoint` is ~80 bytes in JSON. 500 points = ~40KB in `AsyncStorage` — negligible. This gives ~40 minutes of moving coverage or ~8 hours stationary.

---

## Medium Impact

### 4. Exponential Backoff on Repeated Failures

**Current:** No retry logic. If a send fails, it just waits for the next GPS callback (5s). On flaky 3G, this means hammering a failing connection every 5 seconds.

**Fix:** Track consecutive failures. After N failures, back off: `5s → 10s → 30s → 60s`. Reset on success. Saves battery and bandwidth when the connection is truly down.

### 5. Reduce Timeout from 15s to 8s

On 3G, if a request hasn't completed in 8 seconds, it's likely stalled. A 15-second timeout blocks the task callback and delays buffering. A shorter timeout lets the app fail fast, buffer the point, and move on.

### 6. Request Compression

**Current:** Plain JSON, no `Content-Encoding` header. On 3G, every byte counts — especially with a shared hotspot.

**Fix:** Add `Content-Encoding: gzip` on the client side for batch requests. A batch of 50 points (~10KB JSON) compresses to ~2–3KB. Minimal CPU cost, significant bandwidth savings on 3G.

---

## Lower Impact (Nice-to-Have)

### 7. Network-Quality-Aware Throttling

Use `NetInfo` connection type to adapt behavior:

- **WiFi/4G:** Normal send rate (every 5s)
- **3G:** Reduce to every 10–15s, batch more aggressively
- **2G/slow:** Buffer everything, flush in batches when signal improves

### 8. Buffer TTL Cleanup

Points older than 24 hours in the buffer will be rejected by the server's staleness guard anyway. Adding a client-side TTL check before flush avoids wasting bandwidth sending points the server will reject.

### 9. Lightweight Keep-Alive

Instead of full location pings, send a periodic heartbeat (just `vanId` + `ts`, ~50 bytes) so the UI knows the van is alive even when GPS is stale. This keeps `location_updated_at` fresh without the full payload.

---

## Priority Recommendation

Top 3 changes for this scenario:

1. **Batch endpoint** — eliminates the 50-request flush storm on reconnect
2. **Send current point first** — users see real-time position immediately
3. **Increase buffer to 200+** — survives longer coverage gaps
