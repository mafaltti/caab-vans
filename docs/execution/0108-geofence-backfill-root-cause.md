# Root Cause Found

The van drove from TRT-5 (seq 16) toward Fórum Ruy Barbosa (seq 17), but the road passes through CAAB's geofence area first — CAAB is geographically before Fórum Ruy Barbosa on the inbound road, even though it's after in the schedule (seq 18).

## What Happened

1. **14:35 UTC** — Van at TRT-5 (seq 16), correctly marked passed via device geofence
2. **14:48:12 UTC** — Van driving south toward Fórum Ruy Barbosa, passes through CAAB's geofence zone (~600m before reaching Fórum). Device geofence fires for CAAB (seq 18)
3. **Backfill kicks in** — `process-device-geofence-events.ts` has a "gap-1 backfill" that says: "if seq 18 is reached, seq 17 (Fórum Ruy Barbosa) must have been passed too". So it marks Fórum Ruy Barbosa as passed with `pass_source: backfill`
4. **`next_stop_id` advances** to Comércio (seq 19)
5. **14:52 UTC** — Van actually arrives at Fórum Ruy Barbosa. Real geofence event fires but gets discarded as `no_match` because seq 17 was already marked passed

**The bug:** The gap-1 backfill assumes sequential stops are visited in schedule order. But CAAB and Fórum Ruy Barbosa are only ~1.4km apart and the road geometry means the van enters CAAB's geofence before reaching Fórum Ruy Barbosa.

---

## Evidence

| Time (UTC) | Position | Event |
|---|---|---|
| 14:48:11 | -12.9739, -38.5033 | Near CAAB (-12.9733, -38.5029) |
| 14:48:12 | — | Geofence: CAAB matched, Fórum backfilled |
| 14:51:58 | -12.9768, -38.5078 | Geofence: Fórum Ruy Barbosa → `no_match` (already passed) |

---

## Fix Options

The gap-1 backfill in the device geofence processor is too aggressive for closely-spaced stops. Options:

1. **Remove gap-1 backfill entirely from device geofence handler** — let `inferStopProgress` (GPS-based) handle backfills with its own confidence gating
2. **Add GPS corroboration** — before backfilling, check that recent pings were actually within the preceding stop's geofence radius
3. **Add proximity guard** — skip backfill when the preceding stop is < 2km away (they may share road segments)

Option 1 is the simplest and safest. The GPS-based inference already has its own backfill logic with adjacency validation.
