/**
 * One-time script: pre-compute OSRM road distances between consecutive stops.
 *
 * Queries all schedule_entries ordered by route and time, fetches OSRM road
 * distance for each consecutive stop pair, and updates osrm_distance_m.
 *
 * Usage:
 *   npx tsx scripts/precompute-stop-distances.ts
 */

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL env var is required");
  process.exit(1);
}

const OSRM_BASE_URL = process.env.OSRM_BASE_URL;
if (!OSRM_BASE_URL) {
  console.error("ERROR: OSRM_BASE_URL env var is required");
  process.exit(1);
}

const OSRM_TIMEOUT_MS = 500;

async function osrmDistance(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<number | null> {
  const url = `${OSRM_BASE_URL}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false&annotations=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    return data.routes[0].distance as number;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Query ALL schedule entries (including null coords) to pair by immediate successor
    const result = await pool.query<{
      id: string;
      route_id: string;
      arrival_time: string;
      stop_lat: number | null;
      stop_lng: number | null;
    }>(
      `SELECT se.id, r.id as route_id, se.arrival_time, se.stop_lat, se.stop_lng
       FROM schedule_entries se
       JOIN routes r ON r.id = se.route_id
       ORDER BY r.id, se.stop_sequence`,
    );

    const rows = result.rows;
    console.log(`Found ${rows.length} schedule entries.`);

    // Group by route
    const byRoute = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byRoute.get(row.route_id) ?? [];
      list.push(row);
      byRoute.set(row.route_id, list);
    }

    let updated = 0;
    let cleared = 0;
    let failed = 0;

    for (const [routeId, stops] of byRoute) {
      // Clear all osrm_distance_m for this route before recomputing
      await pool.query(
        `UPDATE schedule_entries SET osrm_distance_m = NULL WHERE route_id = $1`,
        [routeId],
      );

      console.log(`Route ${routeId}: ${stops.length} stops`);

      for (let i = 0; i < stops.length - 1; i++) {
        const from = stops[i];
        const to = stops[i + 1]; // immediate next stop

        // Skip if either stop lacks coordinates
        if (
          from.stop_lat == null || from.stop_lng == null ||
          to.stop_lat == null || to.stop_lng == null
        ) {
          cleared++;
          continue;
        }

        const dist = await osrmDistance(
          from.stop_lat,
          from.stop_lng,
          to.stop_lat,
          to.stop_lng,
        );

        if (dist != null) {
          await pool.query(
            `UPDATE schedule_entries SET osrm_distance_m = $1 WHERE id = $2`,
            [dist, from.id],
          );
          console.log(`  ${from.arrival_time} → ${to.arrival_time}: ${dist.toFixed(0)}m`);
          updated++;
        } else {
          console.warn(`  ${from.arrival_time} → ${to.arrival_time}: OSRM failed, skipping`);
          failed++;
        }
      }
    }

    console.log(`\nDone! Updated: ${updated}, Cleared/skipped: ${cleared}, Failed: ${failed}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
