# Next Stop Detection Logic

## QUESTION: And next stop is being showed after van passed current stop (moved away from current) or simply time based?

● *Read 1 file (ctrl+o to expand)*

● It's **GPS/geofence-based**, not time-based. Here's how it works:

### Stop Passing Detection (`infer-stop-progress.ts:96-114`)

- On every GPS ping, it computes the haversine distance from the van's current position to each pending stop
- If `distance <= geofence_radius_m`, the stop is marked as "passed" with a timestamp
- This is real proximity detection — the van must physically enter the stop's geofence radius

### Next Stop Selection (`infer-stop-progress.ts:130-141`)

- Iterates stops in schedule order
- Finds the first "pending" stop whose scheduled time is `>= now`
- So it's: geofence-passed stops are skipped, then the next upcoming pending stop is selected

### In Summary

Stops advance when the van **physically arrives** (enters the geofence), not just when the clock passes the scheduled time. The "next stop" shown in the UI is the first pending (not yet geofence-triggered) stop that's still upcoming on the schedule.
