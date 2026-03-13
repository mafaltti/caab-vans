# CAAB Vans — Tracking Issues: Root Cause Analysis & Fix Plan

---

## Issue 1: Late Shift Creation (ROOT CAUSE)

**Impact:** All geofence events fail to match — tracking is completely broken until shift starts.

### What happens

- Shifts are 100% manual — driver clicks "Iniciar Turno" on the web dashboard (`POST /api/routes/{routeId}/start`)
- The mobile tracker app (`van-tracker`) cannot start shifts — it only controls GPS tracking
- Today, all 4 shifts were started at ~11:12 UTC (08:12 Bahia), but vans run from 06:40 Bahia
- Geofence events between 06:40–08:12 all hit the shift gate and get `no_match`
- Someone then manually confirmed 6 stops via `confirm-start-stop` as a workaround

### Why it matters

The shift gate in `process-device-geofence-events.ts` (lines 138–156) explicitly rejects events when no active shift exists:

```sql
route_shifts.started_at <= event_ts AND (ended_at IS NULL OR ended_at > event_ts)
```

### Fix Options

| Option | Approach | Effort | Recommended |
|--------|----------|--------|-------------|
| A | Add "Iniciar Turno" button to the mobile tracker app | Medium | Yes — drivers are already using the app, this is the natural place |
| B | Auto-create shift on first geofence event received | Low | Yes — add to `process-device-geofence-events.ts` before the shift gate, upsert a shift if none exists |
| C | Auto-create shift on first location ping of the day | Low | Alternative to B — trigger in tracking POST handler |
| D | Move start/end API call into the mobile tracker app at tracking start/stop | Medium | Best UX — tie shift lifecycle to tracking lifecycle |

### Key Files

- `/opt/caab-vans/app-src/src/app/api/routes/[routeId]/start/route.ts`
- `apps/van-tracker/app/index.tsx`
- `src/lib/tracking/process-device-geofence-events.ts` lines 138–157

---

## Issue 2: No Reprocessing When Shift Is Created Late

**Impact:** Even when shift is eventually started, previously `no_match` events are not re-evaluated.

### What happens

- Events marked `no_match` (due to missing shift) CAN be reprocessed — the code resets them to `received` on duplicate detection (lines 76–84)
- BUT this only triggers when the mobile app resends the same event ID via a location ping
- If the driver already stopped tracking before the shift was created → events are stuck forever
- There is no database trigger, no webhook, and no cron job that re-evaluates `no_match` events when a shift is created

### Today's timeline proves this

1. Van 04 last ping: `10:58:59 UTC`
2. Shift created: `11:12:46 UTC`
3. No more pings arrived → `no_match` events were never retried

### Fix Options

| Option | Approach | Effort |
|--------|----------|--------|
| A | On shift creation, query all `no_match` events for the van from that service date and reprocess them | Medium — add to `POST /api/routes/{routeId}/start` handler |
| B | Database trigger on `route_shifts` INSERT that reprocesses `no_match` events | Medium — requires PL/pgSQL or Edge Function |
| C | Cron job every 5 minutes sweeping `no_match` events where a shift now exists | Low — add to `scripts/` and schedule via system cron |

**Recommended:** Option A — most immediate and targeted. In the start route handler, after creating the shift, query `no_match` events and call `processDeviceGeofenceEvents` for each.

### Key Files

- `src/app/api/routes/[routeId]/start/route.ts` — add reprocessing after shift creation
- `src/lib/tracking/process-device-geofence-events.ts` — reprocessing logic already exists (lines 76–84)

---

## Issue 3: Deferred Non-Adjacent Retry Loop (16K warnings/4h)

**Impact:** Excessive logging, wasted bandwidth, wasted mobile battery.

### What happens

1. Device enters a geofence matching stop at sequence N
2. But stop at sequence N-1 is still pending (head-of-line blocking)
3. Contiguous-prefix guard triggers (lines 272–286): logs warning and returns without updating status
4. Event stays in `received` status → never appears in `processedEventIds` response
5. Mobile app never removes event from buffer (only removes events in `processedEventIds`)
6. Every single location ping (~5 sec) resends the same event
7. Server re-evaluates, hits the same guard, logs the same warning → infinite loop

**The math:** 4 vans × ~12 pings/min × 240 min × multiple deferred events ≈ **16K+ warnings**

**The bug:** Line 285 returns without setting status. The event should be marked differently so the client can acknowledge receipt while the server retries internally.

### Fix

In `process-device-geofence-events.ts` lines 272–286, change the behavior:

**Current (broken):**

```typescript
if (matchedIndex > 0) {
  console.warn("deferred non-adjacent...");
  return;  // ← leaves status='received', client keeps resending
}
```

**Option A — mark `no_match`, let duplicate logic retry (recommended):**

```typescript
if (matchedIndex > 0) {
  console.warn("deferred non-adjacent...");
  await updateEventStatus(supabase, vanId, eventId, "no_match");
  return;  // ← client removes from buffer; duplicate resend will reset to received
}
```

**Option B — add `deferred` status, acknowledge to client:**

- Requires DB migration: add `'deferred'` to status `CHECK` constraint
- Client treats `'deferred'` as processed (removes from buffer)
- Background job retries `'deferred'` events periodically

**Recommended:** Option A — minimal change. The existing duplicate reprocessing logic (lines 76–84) already resets `no_match` → `received` on each ping, so events will still be retried, but at most once per ping instead of being stuck in the client buffer.

### Key File

- `src/lib/tracking/process-device-geofence-events.ts` lines 272–286

---

## Issue 4: Kong 502 — "Upstream Sent Too Big Header"

**Impact:** 233 errors in 4 hours; breaks tracking API responses at scale.

### What happens

- `appendGeofenceResponse()` (`route.ts` lines 223–276) queries all `tracking_geofence_events` with `status='matched'` using an `event_id IN (...)` filter
- The URL contains all submitted event IDs as query parameters
- With 300+ events, the URL exceeds Kong's default nginx buffer sizes
- Kong 2.8.1 defaults: `client_header_buffer_size: 4KB`, `large_client_header_buffers: 4×8KB`
- Error: `upstream sent too big header while reading response header from upstream`

### Fix — apply both

**A. Increase Kong buffer sizes (immediate, in `docker-compose.yml`):**

```yaml
supabase-kong:
  environment:
    KONG_NGINX_HTTP_CLIENT_HEADER_BUFFER_SIZE: "16k"
    KONG_NGINX_HTTP_LARGE_CLIENT_HEADER_BUFFERS: "4 32k"
    KONG_NGINX_HTTP_PROXY_BUFFER_SIZE: "16k"
    KONG_NGINX_HTTP_PROXY_BUFFERS: "8 16k"
```

**B. Paginate the event query (long-term, in `appendGeofenceResponse`):**

- Cap `submittedEventIds` to batches of 50–100 when querying Supabase
- Or switch the `event_id IN (...)` filter to a POST-based RPC to avoid URL length limits entirely

### Key Files

- `/opt/caab-vans/docker-compose.yml` — Kong service config (lines 68–95)
- `src/app/api/tracking/[vanId]/route.ts` — `appendGeofenceResponse()` lines 223–276

---

## Issue 5: 28 Stale `received` Events from Yesterday

**Impact:** Low — these are inert database rows, not actively retried by any background job.

### What they are

Events that hit the "deferred non-adjacent" guard and were left in `received` status. They would auto-resolve if:

1. The mobile app sends the same `event_id` again (triggers duplicate reprocessing)
2. AND earlier stops in the sequence are now passed

For yesterday's events: the route runs from March 12 are done. These events will never naturally resolve because the mobile app won't resend them.

### Fix — cleanup query

```sql
UPDATE tracking_geofence_events
SET status = 'no_match'
WHERE status = 'received'
  AND entered_at < CURRENT_DATE AT TIME ZONE 'America/Bahia';
```

**Preventive:** Once Issue 3 is fixed (deferred events get `no_match` status), this won't recur.

---

## Priority & Execution Order

| Priority | Issue | Why | Fix Effort |
|----------|-------|-----|------------|
| P0 | Issue 3 — Deferred retry loop | 16K warnings/4h, wastes battery/bandwidth, triggers Issue 4 | Small — 1 line change |
| P0 | Issue 4 — Kong buffer size | Breaks API completely under load | Small — env vars in compose |
| P1 | Issue 1 — Late shift creation | Root cause of all tracking failures today | Medium — mobile app change or auto-create logic |
| P1 | Issue 2 — No reprocessing on shift create | Even with shift fix, covers edge cases | Medium — add to start handler |
| P2 | Issue 5 — Stale `received` events | Cosmetic, no ongoing impact | Small — one SQL query |

> **Cascade effect:** Fixing Issue 3 (deferred loop) also eliminates the excessive URL sizes that cause Issue 4. Fixing Issue 1 (late shifts) prevents Issues 2, 3, and 5 from occurring in the first place.
