# Tracker App — Duplicate Pings Bug Analysis & Fixes

Android's `FusedLocationProvider` returns cached GPS fixes when it has no new data — same coordinates, same timestamp.
The `expo-location` background task fires every 3 seconds regardless, and the tracker app has no guard against sending
identical fixes repeatedly.

---

## Bugs Found (by priority)

### Critical — Causing the flood

| # | Location | Bug | Why it matters |
|---|----------|-----|----------------|
| 1 | `task.ts` | No duplicate `device_ts` check — the tracker never compares the GPS fix timestamp against the last sent one | Stale fixes with identical `ts` pass all filters |
| 2 | `task.ts` | Throttle uses `Date.now()` for elapsed, not GPS timestamp — wall-clock interval (~3s) matches the callback interval, so stale fixes slip through ~50% of the time | `elapsed >= MIN_INTERVAL` passes even when GPS data hasn't changed |
| 3 | `task.ts` | No stationary suppression — when `distance === 0` but `elapsed >= 3s`, the throttle passes | A parked van sends identical pings forever |
| 4 | Server `route.ts` | No unique constraint on `(van_id, device_ts)` — every POST inserts a new row, even if identical | Database fills with hundreds of duplicate rows |

### High — Amplifying the problem

| # | Location | Bug |
|---|----------|-----|
| 5 | Server `route.ts` | `isNewest` uses `>=` and queries AFTER insert — the just-inserted row is always "newest", so every duplicate triggers OSRM + van update + stop inference |
| 6 | `buffer.ts` | No dedup in buffer — when offline, 50 identical points fill the buffer; all 50 are sent on reconnect |
| 7 | `task.ts` | Module-level throttle state lost on cold restart — `lastSentLat`/`lastSentLng`/`lastSentTime` reset to `null`/`0`, so the first callback always passes |

### Medium — Robustness gaps

| # | Location | Bug |
|---|----------|-----|
| 8 | Server `route.ts` | No staleness guard — pings with `device_ts` from hours/days ago are accepted |
| 9 | Server `route.ts` | Missing index on `(van_id, device_ts)` — the `isNewest` query does a sequential scan |
| 10 | `tracking.ts` | `distanceInterval` is advisory on Android — `timeInterval: 3000` dominates, OS fires callbacks regardless of movement |

---

## Recommended Fixes

### Client-side (tracker app)

#### `task.ts` — add three guards

```ts
// Module level — add:
let lastSentTs = 0;
const STATIONARY_MAX_INTERVAL = 60_000; // 1 min when not moving

// After accuracy filter, before existing throttle:

// 1. Reject stale GPS fix (same timestamp = cached fix from OS)
if (point.ts > 0 && point.ts === lastSentTs) {
  return;
}

// 2. Reject old fixes (phone woke from Doze with ancient cached location)
if (Date.now() - point.ts > 60_000) {
  return;
}

// Inside existing throttle block, add:
// 3. Stationary suppression — if coords identical, send at most once/min
if (distance === 0 && elapsed < STATIONARY_MAX_INTERVAL) {
  return;
}

// On success, track GPS timestamp:
lastSentTs = point.ts;
```

#### `task.ts` — hydrate throttle state on cold start

```ts
if (lastSentLat === null) {
  const [storedLat, storedLng, storedTime] = await Promise.all([
    AsyncStorage.getItem("@lastLat"),
    AsyncStorage.getItem("@lastLng"),
    AsyncStorage.getItem("@lastSentAt"),
  ]);
  if (storedLat && storedLng) {
    lastSentLat = Number(storedLat);
    lastSentLng = Number(storedLng);
    lastSentTime = storedTime ? Number(storedTime) : 0;
  }
}
```

#### `buffer.ts` — deduplicate before adding

```ts
export async function addToBuffer(point: LocationPoint): Promise<void> {
  const buffer = await getBuffer();
  if (buffer.length > 0) {
    const last = buffer[buffer.length - 1];
    if (last.lat === point.lat && last.lng === point.lng && last.ts === point.ts) {
      return; // exact duplicate
    }
  }
  // ... rest unchanged
}
```

---

### Server-side (safety net)

#### New migration `00006_dedup_pings.sql`

```sql
-- Deduplicate existing rows
DELETE FROM van_location_pings a
  USING van_location_pings b
  WHERE a.van_id = b.van_id
    AND a.device_ts = b.device_ts
    AND a.id > b.id;

-- Prevent future duplicates (also serves as index for isNewest query)
CREATE UNIQUE INDEX idx_van_location_pings_van_device_ts
  ON van_location_pings (van_id, device_ts);
```

#### `route.ts` — upsert + staleness guard

```ts
// Staleness guard (after deviceTs computation)
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
if (clampedTs < now - MAX_AGE_MS) {
  return apiError("VALIDATION_ERROR", "Ping too old", 400);
}

// Replace insert with upsert
const { data: inserted, error: insertError } = await supabase
  .from("van_location_pings")
  .upsert({ ... }, { onConflict: "van_id,device_ts", ignoreDuplicates: true })
  .select("id")
  .single();

if (insertError?.code === "PGRST116") {
  return NextResponse.json({ received: true, duplicate: true, ts: Date.now() });
}
```

---

## Priority Order

1. `task.ts` duplicate `device_ts` check — one line, stops 99% of the flood
2. Server unique constraint — safety net, prevents DB bloat regardless of client bugs
3. `task.ts` stationary suppression — reduces noise from parked vans
4. `task.ts` cold-start hydration — prevents burst after Android kills the process
5. `buffer.ts` dedup — prevents burst of identical points on reconnect
6. Server staleness guard — rejects ancient timestamps
7. `tracking.ts` tuning — increase `timeInterval` to `5000ms`, `distanceInterval` to `10m`
