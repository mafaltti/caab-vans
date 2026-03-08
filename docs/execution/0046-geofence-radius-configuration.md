# Geofence Radius Configuration

## QUESTION: What is geofence is we are using? How closer the van has to get to the location.

● Based on my memory notes, the geofence radius is 50 meters. Let me verify the exact value in the code.

● *Searched for 1 pattern (ctrl+o to expand)*

The geofence radius is **50 meters** by default, stored per stop in the `geofence_radius_m` column on the `schedule_entries` table.

The van must get within 50m of a stop's coordinates (`stop_lat`, `stop_lng`) for the system to automatically mark that stop as "passed". The distance is calculated using the haversine formula (`src/lib/tracking/haversine.ts`).

The radius is configurable per stop — the test at line 29 shows an example with a 100m radius — but all current data uses 50m.

## QUESTION: What is the radius industry uses?

Industry standards vary by use case:

- **Urban transit (buses/vans):** 25–50m is most common. Dense stop spacing requires tighter geofences to avoid false triggers at nearby stops.
- **School buses:** 50–100m, since stops are more spread out and safety confirmation matters more than precision.
- **Long-haul / freight:** 100–500m, where stops are far apart and exact position matters less.
- **Ride-hailing (Uber, etc.):** 30–50m for pickup/dropoff detection.

Your current 50m radius is right in the sweet spot for an urban van shuttle service. It's tight enough to avoid triggering on adjacent stops but forgiving enough to handle GPS drift (which on mobile devices is typically 5–15m in open areas, up to 30–50m in urban canyons near tall buildings).

If you're seeing missed triggers in practice, bumping specific stops to 75–100m (using the per-stop `geofence_radius_m` column you already have) would be a reasonable adjustment before changing the global default.
