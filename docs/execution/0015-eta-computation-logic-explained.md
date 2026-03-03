# ETA Computation Logic Investigation

## QUESTION: Is ETA really working based on van location or simply calculating time?

⎿ *[Image #3]*

● Let me investigate how ETA is computed in the codebase.

● **Explore** (Investigate ETA computation logic)
  ⎿ *Done (17 tool uses · 47.7k tokens · 42s)*
  *(ctrl+o to expand)*

● Great question. The ETA is not purely schedule-based, but it's not GPS-distance-based either. Here's how it actually works:

### How ETA Is Calculated (`src/lib/tracking/eta.ts`)

It uses a **schedule + delay** approach:

1. **GPS is used indirectly** — when the van physically enters a stop's geofence radius (Haversine distance check in `src/lib/tracking/infer-stop-progress.ts`), that stop is marked as "passed" with a `passed_at` timestamp.
2. **Delay is computed** from the most recently passed stop:
   ```
   delay = actual_passed_time - scheduled_time
   ```
3. **ETA for the next stop** = next stop's scheduled time + delay:
   ```
   ETA = scheduled_next_stop_time + delay
   ```
4. If **no stops have been passed** yet, ETA = the raw scheduled time (no delay adjustment).

### What This Means for Your Screenshot

The "ETA: ~8 min" and "ETA: ~2 min" values are:

- Based on the schedule of the next stop
- Adjusted by the delay observed at the last geofence-confirmed stop
- **Not** based on real-time distance between the van's current GPS coordinates and the next stop

So if a van is stuck in traffic between stops, the ETA won't update until it passes through the next geofence. The number is essentially `scheduled time + accumulated delay - current time`.

### In Short

It's a **schedule-adjusted ETA**, not a live GPS-to-destination calculation. It reflects whether the van is running late/early based on its last confirmed stop passage, but doesn't account for real-time conditions between stops.

*✻ Brewed for 1m 3s*

---

## QUESTION: I don't understand please explain.

● Let me simplify.

### What You Might Expect

You might think the app works like Google Maps — the van's GPS position is compared to the next stop's location, and the ETA is calculated based on actual distance and traffic. **It does NOT work like that.**

### What Actually Happens

The app has a fixed timetable — every stop has a scheduled time (e.g., "Mundo Plaza at 01:00, next stop at 01:08").

When the van physically arrives at a stop (confirmed by GPS + geofence), the app checks:

- "Was the van on time, late, or early?"

For example:

- Stop was scheduled at 01:00
- Van actually arrived at 01:05
- That's a **5-minute delay**

Then for the next stop, it simply adds that delay:

- Next stop scheduled at 01:08
- ETA = 01:08 + 5 min delay = **01:13**
- If it's currently 01:05, it shows **"ETA: ~8 min"**

### The Limitation

Between stops, the ETA doesn't change — even if the van is stuck in traffic or moving fast. It only updates when the van reaches the next geofenced stop.

**Think of it as a "smart bus schedule" rather than a live GPS tracker.**
