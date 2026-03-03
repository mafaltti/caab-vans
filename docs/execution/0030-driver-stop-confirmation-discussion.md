# Driver Stop Confirmation on Route Start

## QUESTION: Still in the subject of this implementation I'm thinking if it's valid to ask the driver to confirm his current chronological stop when he is starting route, so this way we could use this information to backfill. What do you think?

Interesting idea, but I'd lean against it for now. Here's my reasoning:

### The Gap It Fills Is Narrow

The GPS backfill we just built covers the main scenario — driver starts tracking mid-route, first geofence match triggers backfill of all earlier stops. The manual confirmation would only help when the driver starts tracking between stops (no geofence match yet). In practice, drivers typically start at a stop.

### Friction Cost Is Real

Adding a stop picker to the route start flow means an extra decision for every route start, even when the driver is at stop 1 (the common case where it adds zero value). Drivers are on the move — every extra tap matters.

### Two Backfill Sources = Complexity

You'd need to reconcile manual confirmation with GPS-based backfill: what if the driver picks stop 5 but GPS says they're at stop 7? Which wins? That's new edge cases and conflict resolution logic.

### Better Alternative If the Gap Proves Real

Instead of asking the driver, you could use the GPS coordinates from the start route request itself to infer the closest stop and backfill silently — same benefit, zero friction. You already have the lat/lng from the driver's device at that moment.

I'd wait to see if real-world usage reveals cases where the GPS backfill isn't enough before adding this. **YAGNI for now.**
