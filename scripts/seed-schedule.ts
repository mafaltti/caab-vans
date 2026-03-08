import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Stop coordinates (Salvador, BA & Lauro de Freitas, BA)
// Sources: OpenStreetMap / Nominatim geocoding
// ---------------------------------------------------------------------------
const STOP_COORDS: Record<string, { lat: number; lng: number }> = {
  CAAB: { lat: -12.9728, lng: -38.5025 },
  Comércio: { lat: -12.9698, lng: -38.5113 },
  "Comércio (Comércio/Metrô Detran)": { lat: -12.9698, lng: -38.5113 },
  "Comércio/Metrô Detran": { lat: -12.9698, lng: -38.5113 },
  "Estação Mussurunga": { lat: -12.9208, lng: -38.3599 },
  "Fórum Des. João Mendes da Silva": { lat: -12.8985, lng: -38.3223 },
  "Fórum Regional Ímbuí": { lat: -12.9653, lng: -38.4353 },
  "Fórum Ímbuí": { lat: -12.9653, lng: -38.4353 },
  "Fórum Ruy Barbosa": { lat: -12.9782, lng: -38.5081 },
  "Fórum Ruy Barbosa (CCJM/ESA)": { lat: -12.9782, lng: -38.5081 },
  "Juizado Especial Federal (CAB)": { lat: -12.9451, lng: -38.4245 },
  "Juizado Federal": { lat: -12.9390, lng: -38.4351 },
  "Juizado Federal (CAB)": { lat: -12.9390, lng: -38.4351 },
  "Mundo Plaza": { lat: -12.9793, lng: -38.4609 },
  Sumaré: { lat: -12.9825, lng: -38.4551 },
  "TRT-5": { lat: -12.9657, lng: -38.4386 },
  "TRT-5 (Paralela)": { lat: -12.9657, lng: -38.4386 },
  "TRT-5(Paralela)": { lat: -12.9657, lng: -38.4386 },
  "TRT-5 (Paralela": { lat: -12.9657, lng: -38.4386 },
  "Tribunal de Justiça (CAB)": { lat: -12.9460, lng: -38.4335 },
  "Wall Street": { lat: -12.9401, lng: -38.4127 },
};

// ---------------------------------------------------------------------------
// Schedule data
// Vans 1–3 use generated full-day schedules (00:00–23:55) for testing.
// Van 4 keeps the original real-world schedule.
// ---------------------------------------------------------------------------
type ScheduleRow = { time: string; stopName: string };

// Route patterns each van cycles through all day
const VAN_ROUTE_LOOPS: Record<string, { stops: string[]; intervalMin: number }> = {
  van1: {
    stops: ["CAAB", "Comércio", "Fórum Ruy Barbosa (CCJM/ESA)", "Mundo Plaza", "TRT-5 (Paralela)"],
    intervalMin: 20,
  },
  van2: {
    stops: ["CAAB", "Mundo Plaza", "Comércio", "Fórum Ruy Barbosa (CCJM/ESA)", "TRT-5 (Paralela)"],
    intervalMin: 20,
  },
  van3: {
    stops: [
      "CAAB", "Mundo Plaza", "Fórum Regional Ímbuí", "Wall Street",
      "Juizado Federal (CAB)", "TRT-5 (Paralela)",
    ],
    intervalMin: 18,
  },
};

function generateFullDaySchedule(
  stops: string[],
  intervalMin: number,
): ScheduleRow[] {
  const entries: ScheduleRow[] = [];
  const endMinutes = 23 * 60 + 55;
  let totalMinutes = 0;
  let idx = 0;

  while (totalMinutes <= endMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    entries.push({
      time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      stopName: stops[idx % stops.length],
    });
    idx++;
    totalMinutes += intervalMin;
  }

  return entries;
}

const VAN_SCHEDULES: Record<string, ScheduleRow[]> = {
  // Generated full-day schedules for vans 1–3
  ...Object.fromEntries(
    Object.entries(VAN_ROUTE_LOOPS).map(([key, { stops, intervalMin }]) => [
      key,
      generateFullDaySchedule(stops, intervalMin),
    ]),
  ),
  // Van 4 keeps the original real-world schedule
  van4: [
    { time: "06:40", stopName: "CAAB" },
    { time: "07:00", stopName: "Mundo Plaza" },
    { time: "07:05", stopName: "Sumaré" },
    { time: "07:40", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { time: "07:50", stopName: "Comércio" },
    { time: "08:20", stopName: "Mundo Plaza" },
    { time: "08:40", stopName: "TRT-5 (Paralela)" },
    { time: "09:10", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { time: "09:20", stopName: "Comércio" },
    { time: "09:40", stopName: "Mundo Plaza" },
    { time: "10:05", stopName: "TRT-5 (Paralela)" },
    { time: "10:35", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { time: "10:45", stopName: "CAAB" },
    { time: "10:55", stopName: "Comércio" },
    { time: "11:20", stopName: "Mundo Plaza" },
    { time: "11:35", stopName: "TRT-5 (Paralela)" },
    { time: "12:00", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { time: "12:15", stopName: "CAAB" },
    { time: "12:25", stopName: "Comércio" },
    { time: "12:45", stopName: "Mundo Plaza" },
    { time: "13:00", stopName: "CAAB" },
    { time: "13:15", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { time: "13:35", stopName: "Mundo Plaza" },
    { time: "13:50", stopName: "TRT-5 (Paralela)" },
    { time: "14:25", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { time: "14:35", stopName: "Comércio" },
    { time: "14:55", stopName: "Mundo Plaza" },
    { time: "15:15", stopName: "TRT-5 (Paralela)" },
    { time: "15:45", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { time: "15:55", stopName: "CAAB" },
    { time: "16:05", stopName: "Comércio" },
    { time: "16:25", stopName: "Mundo Plaza" },
    { time: "16:40", stopName: "TRT-5 (Paralela)" },
    { time: "17:25", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { time: "17:35", stopName: "CAAB" },
    { time: "17:45", stopName: "Comércio" },
    { time: "17:55", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { time: "18:20", stopName: "Mundo Plaza" },
    { time: "18:50", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { time: "19:00", stopName: "Comércio" },
  ],
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seedSchedule() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Fetch all routes with their van names
  const { data: routes, error: routesErr } = await supabase
    .from("routes")
    .select("id, name, van_id, vans(id, name)")
    .order("name");

  if (routesErr || !routes?.length) {
    console.error("Failed to fetch routes:", routesErr?.message ?? "no routes found");
    console.error("Make sure vans and routes exist before running this script.");
    process.exit(1);
  }

  console.log(`Found ${routes.length} route(s):`);
  for (const r of routes) {
    const van = r.vans as unknown as { id: string; name: string } | null;
    console.log(`  - ${r.name} (van: ${van?.name ?? "?"})`);
  }

  // 2. Map routes to van schedule keys by extracting the van number
  //    Matches patterns like "Van 1", "van1", "Van 01", etc.
  const routeToVanKey = new Map<string, string>();

  for (const r of routes) {
    const van = r.vans as unknown as { id: string; name: string } | null;
    if (!van) continue;

    const match = van.name.match(/(\d+)/);
    if (match) {
      const vanKey = `van${match[1]}`;
      if (VAN_SCHEDULES[vanKey]) {
        routeToVanKey.set(r.id, vanKey);
      }
    }
  }

  if (routeToVanKey.size === 0) {
    console.error("\nCould not match any routes to van schedule data.");
    console.error("Van names in DB do not match expected pattern (van1, van2, ...).");
    console.error("\nAvailable van schedule keys:", Object.keys(VAN_SCHEDULES).join(", "));
    process.exit(1);
  }

  console.log(`\nMatched ${routeToVanKey.size} route(s) to schedule data.`);

  let needsCoordsUpdate = false;

  // 3. Delete existing schedule entries for matched routes
  for (const [routeId, vanKey] of routeToVanKey) {
    console.log(`\nProcessing ${vanKey} (route ${routeId})...`);

    const { error: delErr } = await supabase
      .from("schedule_entries")
      .delete()
      .eq("route_id", routeId);

    if (delErr) {
      console.error(`  Failed to delete old entries: ${delErr.message}`);
      continue;
    }

    // 4. Insert new schedule entries
    const schedule = VAN_SCHEDULES[vanKey];

    // Try with coordinates first, fall back to without
    const rowsWithCoords = schedule.map((s) => {
      const coords = STOP_COORDS[s.stopName];
      if (!coords) {
        console.warn(`  Warning: no coordinates for "${s.stopName}"`);
      }
      return {
        route_id: routeId,
        stop_name: s.stopName,
        time: s.time,
        stop_lat: coords?.lat ?? null,
        stop_lng: coords?.lng ?? null,
      };
    });

    const { error: insErr } = await supabase
      .from("schedule_entries")
      .insert(rowsWithCoords);

    if (insErr && insErr.message.includes("stop_lat")) {
      // stop_lat/stop_lng columns don't exist yet — insert without them
      console.log("  (stop_lat column not found — inserting without coordinates)");
      const rowsBasic = schedule.map((s) => ({
        route_id: routeId,
        stop_name: s.stopName,
        time: s.time,
      }));

      const { error: insErr2 } = await supabase
        .from("schedule_entries")
        .insert(rowsBasic);

      if (insErr2) {
        console.error(`  Failed to insert entries: ${insErr2.message}`);
      } else {
        console.log(`  Inserted ${rowsBasic.length} schedule entries (without coords).`);
        needsCoordsUpdate = true;
      }
    } else if (insErr) {
      console.error(`  Failed to insert entries: ${insErr.message}`);
    } else {
      console.log(`  Inserted ${rowsWithCoords.length} schedule entries (with coords).`);
    }
  }

  if (needsCoordsUpdate) {
    console.log("\nNote: Coordinates were NOT inserted because the stop_lat/stop_lng");
    console.log("columns do not exist yet. Run migration 00002_live_tracking.sql first,");
    console.log("then re-run this script to add coordinates.");
  }

  console.log("\nDone!");
}

seedSchedule();
