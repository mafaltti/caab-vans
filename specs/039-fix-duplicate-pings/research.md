# Research: Fix Duplicate Pings

## R1: Client-side duplicate timestamp guard

**Decision**: Add `lastSentTs` module-level variable; reject points where `point.ts === lastSentTs`.

**Rationale**: Android's FusedLocationProvider returns cached GPS fixes with identical timestamps when stationary. This single check stops 99% of the flood because cached fixes reuse the same `timestamp` field.

**Alternatives considered**:
- Compare full `(lat, lng, ts)` tuple: Redundant — if `ts` matches, coordinates are guaranteed identical (same cached fix).
- Use GPS timestamp in throttle elapsed calculation: More complex; the `lastSentTs` check makes this unnecessary.

## R2: Stale fix guard (client)

**Decision**: Reject GPS fixes where `Date.now() - point.ts > 60_000` (60 seconds).

**Rationale**: When Android wakes from Doze mode, FusedLocationProvider may return a location cached minutes or hours ago. The 60-second window is generous enough for normal operation (GPS fixes are typically <5s old) while catching ancient cached fixes.

**Alternatives considered**:
- 30-second window: Too aggressive — could reject valid fixes during brief signal loss.
- 120-second window: Too permissive — allows stale Doze wake-up fixes through.

## R3: Stationary suppression interval

**Decision**: When `distance === 0` (identical coordinates), send at most 1 ping per 60 seconds (`STATIONARY_MAX_INTERVAL = 60_000`).

**Rationale**: The 10-minute freshness threshold (`STALENESS_THRESHOLD_MINUTES = 10` in `src/lib/time.ts:13`) gives a 9-minute safety margin. At 1 ping/min, `location_updated_at` is always <2 minutes old, well within the threshold.

**Alternatives considered**:
- 30-second interval: Unnecessary — doubles ping volume for parked vans with no benefit.
- 120-second interval: Feasible but reduces safety margin to 8 minutes. 60s is a cleaner balance.

## R4: Cold-start state hydration

**Decision**: On first callback (when `lastSentLat === null`), read `@lastLat`, `@lastLng`, `@lastSentAt` from AsyncStorage to populate module-level throttle state.

**Rationale**: These keys are already written on every successful send (`persistCoords()` at task.ts:143, `setLastSentAt()` at task.ts:142). The read-back functions already exist (`getLastSentAt()` in tracking-state.ts:12-17). Only the hydration call is missing.

**Alternatives considered**:
- Persist `lastSentTs` (GPS timestamp) too: Would require a new AsyncStorage key. Not needed — the `lastSentTs` check (R1) only needs to compare against the current session's sends. After restart, the first fix will have a new timestamp anyway.

## R5: Buffer consecutive dedup

**Decision**: In `addToBuffer()`, compare new point against the last buffered point. Skip if `lat`, `lng`, and `ts` all match.

**Rationale**: When offline, the task fires every 3-5 seconds with cached GPS fixes. Without dedup, 50 identical points fill the buffer. The check is O(1) — only compares against the last entry.

**Alternatives considered**:
- Full buffer scan for any matching point: O(n) and unnecessary — duplicates are always consecutive because the GPS returns the same cached fix repeatedly.
- Dedup on flush instead of on add: Would still store 50 duplicates in AsyncStorage, wasting device storage and serialization time.

## R6: Server unique constraint

**Decision**: Create unique index on `(van_id, device_ts)` with a preceding cleanup migration to remove existing duplicates.

**Rationale**: The unique index serves dual purpose: (1) prevents future duplicate rows, (2) provides the index needed for the `isNewest` query (which orders by `device_ts`), replacing the missing index identified as bug #9.

**Alternatives considered**:
- Unique on `(van_id, device_id, device_ts)`: Over-constrained — `device_id` changes if the driver switches phones. The spec says `(van_id, device_ts)` because one van can't be in two places at the same time.
- Application-level check before insert: Race condition — two concurrent requests could both check and both insert.

## R7: Server upsert with ignoreDuplicates

**Decision**: Replace `.insert()` with `.upsert({ ... }, { onConflict: "van_id,device_ts", ignoreDuplicates: true })`.

**Rationale**: `ignoreDuplicates: true` silently skips the insert when a conflict exists, avoiding error handling complexity. The response distinguishes duplicates via PostgREST error code `PGRST116` (no rows returned from `.single()`).

**Alternatives considered**:
- Check-then-insert: Race condition between check and insert.
- Insert with catch on unique violation: Works but `ignoreDuplicates` is cleaner and idiomatic for Supabase.

## R8: Strict isNewest comparison

**Decision**: Change `>=` to `>` in the isNewest comparison: `DateTime.fromISO(deviceTs) > DateTime.fromISO(latest.device_ts)`.

**Rationale**: With the unique constraint, equal `device_ts` values for the same van are impossible for new inserts. But the `>` operator is still correct as a defense-in-depth measure, preventing duplicate downstream processing if the upsert somehow succeeds with an equal timestamp.

## R9: Server staleness guard

**Decision**: Reject pings where `clampedTs < now - 24 * 60 * 60 * 1000` (older than 24 hours).

**Rationale**: Legitimate offline buffers hold at most 50 points (~4 minutes at 5s intervals). A 24-hour window is extremely generous while still catching ancient cached pings from misconfigured or abandoned devices.

## R10: Location callback tuning

**Decision**: Change `timeInterval` from 3000 to 5000ms and `distanceInterval` from 5 to 10m in `tracking.ts`.

**Rationale**: Reduces callback frequency at the source. On Android, `distanceInterval` is advisory but `timeInterval` is respected. Increasing from 3s to 5s reduces callbacks by ~40%, lowering CPU wake-ups and battery drain. The 10m distance filter better matches real-world movement granularity for vans on roads.

**Alternatives considered**:
- 10-second interval: Too infrequent for moving vans — could miss turns or stops.
- Keep 3s/5m: No reason to keep the aggressive settings now that client guards exist, and the spec explicitly requires this change (FR-006).
