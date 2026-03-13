# Implementation Plan: Tracking Issues 2, 3 & 4B

## Context

Real-time tracking analysis revealed 5 issues (doc `0115-tracking-issues-rca.md`). This plan covers fixes for issues 2, 3, and 4 (option B). Issue 1 (late shift creation) is intentionally not addressed. Issue 5 (stale events) resolves itself once Issue 3 is fixed.

---

## Issue 3 — Deferred Retry Loop (P0)

**Problem:** Non-head-of-line geofence events stay in `received` status forever, causing the client to resend them every 5 seconds (~16K warnings/4h).

**File:** `src/lib/tracking/process-device-geofence-events.ts` line 286

**Change:** Add one line before the `return` in the contiguous-prefix guard:

```typescript
if (matchedIndex > 0) {
  // ... existing warn ...
  await updateEventStatus(supabase, vanId, eventId, "no_match");  // NEW
  return;
}
```

Client sees the event acknowledged (removed from buffer). If conditions change later (earlier stop passes), the duplicate reprocessing logic (line 78) already resets `no_match` → `received` on the next ping.

---

## Issue 4B — Batch `.in()` Query (P0)

**Problem:** `appendGeofenceResponse` passes unbounded `submittedEventIds` into a Supabase `.in()` filter. With hundreds of events, the resulting PostgREST query can exceed Kong's default header/buffer limits (4KB/8KB), causing 502 errors.

**File:** `src/app/api/tracking/[vanId]/route.ts` — `appendGeofenceResponse` (lines 230–236)

### Changes

1. **Cap geofence events array in schema** — `src/lib/validators/tracking.ts` line 23:

```typescript
geofenceEvents: z.array(geofenceEventSchema).max(100).optional(),
```

This prevents unbounded payloads at the validation boundary.

2. **Batch the `.in()` query** — in `appendGeofenceResponse`, split `submittedEventIds` into chunks of 50 and merge results:

```typescript
const BATCH_SIZE = 50;
const allConfirmed = [];
for (let i = 0; i < submittedEventIds.length; i += BATCH_SIZE) {
  const batch = submittedEventIds.slice(i, i + BATCH_SIZE);
  const { data } = await supabase
    .from("tracking_geofence_events")
    .select("event_id, matched_schedule_entry_id, matched_run_id")
    .eq("van_id", vanId)
    .in("event_id", batch)
    .eq("status", "matched");
  if (data) allConfirmed.push(...data);
}
```

Then use `allConfirmed` instead of `confirmedEvents` for the rest of the function.

---

## Issue 2 — Reprocess `no_match` Events on Shift Creation (P1)

**Problem:** When a shift is created late, previously rejected (`no_match`) geofence events are never re-evaluated. There's no trigger to reprocess them.

**File:** `src/app/api/routes/[routeId]/start/route.ts` — after shift insert (~line 128)

**Change:** After the shift is successfully created, query `no_match` events for this van's service date and call `processDeviceGeofenceEvents` to reprocess them:

```typescript
// Reprocess no_match events that arrived before shift was created
const serviceDateStart = DateTime.fromISO(serviceDate, { zone: TZ }).startOf("day").toISO();
const serviceDateEnd = DateTime.fromISO(serviceDate, { zone: TZ }).endOf("day").toISO();

const { data: staleEvents } = await supabase
  .from("tracking_geofence_events")
  .select("event_id, place_id, entered_at")
  .eq("van_id", van.id)
  .eq("status", "no_match")
  .gte("entered_at", serviceDateStart)
  .lte("entered_at", serviceDateEnd);

if (staleEvents && staleEvents.length > 0) {
  await processDeviceGeofenceEvents({
    supabase,
    vanId: van.id,
    geofenceEvents: staleEvents.map((e) => ({
      placeId: e.place_id,
      enteredAt: new Date(e.entered_at).getTime(),
      eventId: e.event_id,
    })),
  });
}
```

This works because `processDeviceGeofenceEvents` handles duplicates: the upsert is a no-op (event already exists), the duplicate path finds `status = 'no_match'`, resets to `received`, and reprocesses through the shift gate — which now passes because the shift exists.

**Imports to add:** `processDeviceGeofenceEvents` from `@/lib/tracking/process-device-geofence-events`, `DateTime` from `luxon`, `TZ` constant.

---

## Files Modified

| File | Issue | Change |
|------|-------|--------|
| `src/lib/tracking/process-device-geofence-events.ts` | 3 | Add `updateEventStatus` call before `return` in deferred guard |
| `src/lib/validators/tracking.ts` | 4B | Add `.max(100)` to `geofenceEvents` array |
| `src/app/api/tracking/[vanId]/route.ts` | 4B | Batch `.in()` query in `appendGeofenceResponse` |
| `src/app/api/routes/[routeId]/start/route.ts` | 2 | Add reprocessing of `no_match` events after shift creation |

---

## Verification

1. **Issue 3:** Deploy and monitor logs — `"deferred non-adjacent"` warnings should drop from thousands to near-zero per shift
2. **Issue 4B:** Verify no 502 errors from Kong even with high event counts; test with 100+ geofence events in a single ping
3. **Issue 2:** Start a shift late (after geofence events have accumulated as `no_match`), verify they get reprocessed and stops advance
4. **All:** Run `tsc --noEmit`, `eslint`, and `vitest` before PR
