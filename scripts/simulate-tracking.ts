/**
 * Simulate GPS tracking pings for all vans.
 *
 * Sends a single current-position ping for every route, interpolated
 * between the two schedule stops that bracket the current time.
 * Always pings all routes — no filtering, no skipping.
 *
 * Usage:
 *   npm run tracking:simulate
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
  );
  process.exit(1);
}

const DEVICE_ID = randomUUID();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get current datetime in America/Bahia timezone. */
function nowBahia(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Bahia" }),
  );
}

/** Parse "HH:mm" into minutes since midnight. */
function toMinutes(hhMm: string): number {
  const [h, m] = hhMm.split(":").map(Number);
  return h * 60 + m;
}

/** Interpolate between two coordinates. t ∈ [0, 1]. */
function lerp(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  t: number,
): { lat: number; lng: number } {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

async function sendPing(
  vanId: string,
  token: string,
  lat: number,
  lng: number,
): Promise<boolean> {
  const url = `${APP_URL}/api/tracking/${vanId}`;
  const body = {
    deviceId: DEVICE_ID,
    lat,
    lng,
    accuracy: 10,
    speed: 8.5,
    heading: 180,
    ts: Date.now(),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingestion-token": token,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`    HTTP ${res.status}: ${text}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`    Network error: ${err}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type ScheduleEntry = {
  stop_name: string;
  time: string;
  stop_lat: number | null;
  stop_lng: number | null;
};

async function main() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Fetch all vans
  const { data: vans, error: vansErr } = await supabase
    .from("vans")
    .select("id, name, ingestion_token")
    .order("name");

  if (vansErr || !vans?.length) {
    console.error("Failed to fetch vans:", vansErr?.message ?? "none found");
    process.exit(1);
  }

  // 2. Fetch routes with schedule entries
  const { data: routes, error: routesErr } = await supabase
    .from("routes")
    .select(
      `id, name, van_id,
      schedule_entries ( stop_name, time, stop_lat, stop_lng )`,
    )
    .order("name");

  if (routesErr || !routes?.length) {
    console.error(
      "Failed to fetch routes:",
      routesErr?.message ?? "none found",
    );
    process.exit(1);
  }

  const vanMap = new Map(vans.map((v) => [v.id, v]));

  const now = nowBahia();
  const nowMin =
    now.getHours() * 60 + now.getMinutes();
  const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  console.log(`Current time (America/Bahia): ${nowHHMM}`);
  console.log(`App URL: ${APP_URL}\n`);

  for (const route of routes) {
    const van = vanMap.get(route.van_id);
    if (!van) continue;

    console.log(`=== ${van.name} — ${route.name} ===`);

    const entries = (route.schedule_entries as ScheduleEntry[])
      .filter((e) => e.stop_lat != null && e.stop_lng != null)
      .sort((a, b) => a.time.localeCompare(b.time));

    if (entries.length < 2) {
      console.log("  Not enough entries with coordinates. Skipping.\n");
      continue;
    }

    // Find the two stops that bracket current time
    let prev = entries[entries.length - 1]; // wrap-around default
    let next = entries[0];

    for (let i = 0; i < entries.length; i++) {
      if (toMinutes(entries[i].time) > nowMin) {
        next = entries[i];
        prev = entries[i > 0 ? i - 1 : entries.length - 1];
        break;
      }
      // If we reach the end, current time is past all stops
      if (i === entries.length - 1) {
        prev = entries[i];
        next = entries[0]; // wrap to first
      }
    }

    const prevMin = toMinutes(prev.time);
    const nextMin = toMinutes(next.time);
    const span =
      nextMin > prevMin ? nextMin - prevMin : nextMin + 1440 - prevMin;
    const elapsed =
      nowMin >= prevMin ? nowMin - prevMin : nowMin + 1440 - prevMin;
    const t = span > 0 ? Math.min(elapsed / span, 0.95) : 0.5;

    const pos = lerp(
      { lat: prev.stop_lat!, lng: prev.stop_lng! },
      { lat: next.stop_lat!, lng: next.stop_lng! },
      t,
    );

    console.log(`  Payload: { lat: ${pos.lat.toFixed(6)}, lng: ${pos.lng.toFixed(6)}, ts: ${Date.now()}, deviceId: "${DEVICE_ID}" }`);
    process.stdout.write(
      `  ${prev.stop_name} (${prev.time}) → ${next.stop_name} (${next.time}) [${(t * 100).toFixed(0)}%]... `,
    );
    const ok = await sendPing(van.id, van.ingestion_token, pos.lat, pos.lng);
    console.log(ok ? "OK" : "FAILED");
    console.log();
  }

  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
