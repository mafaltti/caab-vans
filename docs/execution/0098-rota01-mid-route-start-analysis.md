# CAAB Vans — Rota 01 Mid-Route Start: Why Next Stop Shows CAAB (06:10)

## Current State (08:20 local)

| Fact | Value |
|---|---|
| Van 01 position | -12.9712, -38.5127 (near Comércio) |
| Van 01 speed | 6.1 m/s (moving) |
| GPS age | 24 seconds (fresh) |
| `next_stop_id` | CAAB (06:10) — first stop |
| `last_passed_stop_id` | NULL |
| All 39 stops | pending |
| Route run created | 06:12 local |

---

## Root Cause: Two Compounding Issues

### Issue 1 — No Geofence Match Yet

Van 01 is 51.2m from Comércio but the geofence is 50m — just barely outside. Since no stop has been geofenced, the backfill logic (`infer-stop-progress.ts:334-393`) never triggers: it requires at least one geofence match first. All stops remain `pending`.

### Issue 2 — No Time-Awareness When All Stops Are Pending

The `nextStopId` selection (`infer-stop-progress.ts:427-431`) simply picks the first pending stop chronologically:

```ts
if (nextStopId === null) {
  nextStopId = stop.schedule_entry_id;  // → CAAB 06:10, even at 08:20
}
```

The comment on lines `427-429` acknowledges this is deliberate ("including overdue stops"), but it creates a broken UX when the driver starts 2+ hours into the schedule.

---

## Why Backfill Didn't Help

The backfill logic only activates after a geofence match with confidence `> 0.7`. Since the van is 51m from Comércio (1.2m outside the geofence), no match → no backfill → all stops stuck as `pending`.

Once the van moves a couple meters closer to Comércio on the next ping, the geofence will fire, backfill CAAB + Fórum, and `nextStopId` will jump to Fórum Ruy Barbosa (08:35). But until then, it shows CAAB.

---

## The Adjacency Validation Gap

There is also a secondary bug in the adjacency check (`infer-stop-progress.ts:437-472`): when it detects non-contiguous passed stops, it fixes `lastPassedStopId` but does not update `nextStopId` to match. This would cause issues if backfill marks a non-contiguous stop as passed.

---

## Summary

The system has no "cold-start skip" mechanism. When a driver starts mid-route:

1. All stops are seeded as `pending`
2. Backfill requires a geofence match first — no match means no skipping
3. `nextStopId` defaults to the very first stop regardless of current time
4. The van is 1.2m outside the first geofence it would hit, causing a visible delay in the system catching up

The van will likely enter Comércio's geofence on the next few pings and the system will self-correct, but there is a visible window where the UI shows the wrong next stop.
