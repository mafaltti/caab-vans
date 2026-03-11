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
// Source: docs/execution/0097-live-route-schedules-coordinates.md
// ---------------------------------------------------------------------------
const STOP_COORDS: Record<string, { lat: number; lng: number }> = {
  CAAB: { lat: -12.9733612, lng: -38.5029152 },
  "Comércio (Antigo TRT-5)": { lat: -12.9711232, lng: -38.5122156 },
  "Estação Mussurunga": { lat: -12.9210593, lng: -38.3595045 },
  "Fórum Des. João Mendes da Silva": { lat: -12.8983901, lng: -38.3224019 },
  "Fórum Regional Ímbuí": { lat: -12.9656993, lng: -38.4360400 },
  "Fórum Ruy Barbosa": { lat: -12.9779472, lng: -38.5078382 },
  "Fórum Ruy Barbosa (CCJM/ESA)": { lat: -12.9779472, lng: -38.5078382 },
  "Juizado Especial Federal (CAB)": { lat: -12.9447971, lng: -38.4246134 },
  "Justiça Federal (Sussuarana)": { lat: -12.9392303, lng: -38.4353662 },
  "Mundo Plaza": { lat: -12.9786676, lng: -38.4610349 },
  Sumaré: { lat: -12.9824650, lng: -38.4547836 },
  "TRT-5 (Paralela)": { lat: -12.9660985, lng: -38.4394367 },
  "Wall Street (Paralela)": { lat: -12.9396489, lng: -38.4127061 },
};

// ---------------------------------------------------------------------------
// Production schedule data — all 4 routes use real schedules
// Source: docs/execution/0097-live-route-schedules-coordinates.md
// ---------------------------------------------------------------------------
type ScheduleRow = { arrivalTime: string; stopName: string };

const VAN_SCHEDULES: Record<string, ScheduleRow[]> = {
  van1: [
    { arrivalTime: "06:10", stopName: "CAAB" },
    { arrivalTime: "07:00", stopName: "Fórum Des. João Mendes da Silva" },
    { arrivalTime: "08:20", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "08:35", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "09:00", stopName: "Mundo Plaza" },
    { arrivalTime: "09:20", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "10:00", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "10:10", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "10:35", stopName: "Mundo Plaza" },
    { arrivalTime: "10:55", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "11:15", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "11:25", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "11:50", stopName: "Mundo Plaza" },
    { arrivalTime: "12:10", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "12:40", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "12:50", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "13:00", stopName: "CAAB" },
    { arrivalTime: "13:20", stopName: "Mundo Plaza" },
    { arrivalTime: "13:40", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "14:10", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "14:20", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "14:40", stopName: "Mundo Plaza" },
    { arrivalTime: "14:55", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "15:25", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "15:35", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "16:00", stopName: "Mundo Plaza" },
    { arrivalTime: "16:15", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "16:40", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "16:50", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "17:25", stopName: "Mundo Plaza" },
    { arrivalTime: "18:00", stopName: "Comércio (Antigo TRT-5)" },
  ],
  van2: [
    { arrivalTime: "06:25", stopName: "CAAB" },
    { arrivalTime: "06:45", stopName: "Mundo Plaza" },
    { arrivalTime: "07:15", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "07:25", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "07:45", stopName: "Mundo Plaza" },
    { arrivalTime: "08:00", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "08:30", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "08:40", stopName: "CAAB" },
    { arrivalTime: "09:00", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "09:25", stopName: "Mundo Plaza" },
    { arrivalTime: "09:45", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "10:10", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "10:20", stopName: "CAAB" },
    { arrivalTime: "10:40", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "11:00", stopName: "Mundo Plaza" },
    { arrivalTime: "11:20", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "11:50", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "12:00", stopName: "CAAB" },
    { arrivalTime: "12:15", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "12:35", stopName: "Mundo Plaza" },
    { arrivalTime: "13:00", stopName: "CAAB" },
    { arrivalTime: "13:10", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "13:25", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "13:50", stopName: "Mundo Plaza" },
    { arrivalTime: "14:10", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "14:30", stopName: "Mundo Plaza" },
    { arrivalTime: "14:55", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "15:05", stopName: "CAAB" },
    { arrivalTime: "15:30", stopName: "Fórum Ruy Barbosa" },
    { arrivalTime: "15:50", stopName: "Mundo Plaza" },
    { arrivalTime: "16:10", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "16:40", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "16:50", stopName: "CAAB" },
    { arrivalTime: "17:10", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "17:40", stopName: "Mundo Plaza" },
    { arrivalTime: "18:00", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "18:30", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "18:40", stopName: "CAAB" },
    { arrivalTime: "19:05", stopName: "Mundo Plaza" },
  ],
  van3: [
    { arrivalTime: "06:30", stopName: "CAAB" },
    { arrivalTime: "07:00", stopName: "Estação Mussurunga" },
    { arrivalTime: "07:20", stopName: "Justiça Federal (Sussuarana)" },
    { arrivalTime: "07:30", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "07:45", stopName: "Mundo Plaza" },
    { arrivalTime: "08:15", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "08:55", stopName: "Mundo Plaza" },
    { arrivalTime: "09:15", stopName: "Fórum Regional Ímbuí" },
    { arrivalTime: "09:35", stopName: "Justiça Federal (Sussuarana)" },
    { arrivalTime: "09:45", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "10:10", stopName: "Mundo Plaza" },
    { arrivalTime: "10:25", stopName: "Fórum Regional Ímbuí" },
    { arrivalTime: "10:35", stopName: "Wall Street (Paralela)" },
    { arrivalTime: "10:50", stopName: "Justiça Federal (Sussuarana)" },
    { arrivalTime: "11:00", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "11:20", stopName: "Mundo Plaza" },
    { arrivalTime: "11:35", stopName: "Fórum Regional Ímbuí" },
    { arrivalTime: "11:45", stopName: "Wall Street (Paralela)" },
    { arrivalTime: "12:00", stopName: "Justiça Federal (Sussuarana)" },
    { arrivalTime: "12:10", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "12:45", stopName: "CAAB" },
    { arrivalTime: "13:05", stopName: "Mundo Plaza" },
    { arrivalTime: "13:20", stopName: "Fórum Regional Ímbuí" },
    { arrivalTime: "13:30", stopName: "Wall Street (Paralela)" },
    { arrivalTime: "13:45", stopName: "Juizado Especial Federal (CAB)" },
    { arrivalTime: "13:50", stopName: "Justiça Federal (Sussuarana)" },
    { arrivalTime: "14:00", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "14:25", stopName: "Mundo Plaza" },
    { arrivalTime: "14:40", stopName: "Fórum Regional Ímbuí" },
    { arrivalTime: "14:50", stopName: "Wall Street (Paralela)" },
    { arrivalTime: "15:00", stopName: "Juizado Especial Federal (CAB)" },
    { arrivalTime: "15:05", stopName: "Justiça Federal (Sussuarana)" },
    { arrivalTime: "15:15", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "15:55", stopName: "Mundo Plaza" },
    { arrivalTime: "16:15", stopName: "Fórum Regional Ímbuí" },
    { arrivalTime: "16:30", stopName: "Wall Street (Paralela)" },
    { arrivalTime: "16:40", stopName: "Juizado Especial Federal (CAB)" },
    { arrivalTime: "16:45", stopName: "Justiça Federal (Sussuarana)" },
    { arrivalTime: "16:55", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "17:15", stopName: "Mundo Plaza" },
    { arrivalTime: "17:30", stopName: "Fórum Regional Ímbuí" },
    { arrivalTime: "17:45", stopName: "Justiça Federal (Sussuarana)" },
    { arrivalTime: "18:00", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "18:30", stopName: "Mundo Plaza" },
  ],
  van4: [
    { arrivalTime: "06:40", stopName: "CAAB" },
    { arrivalTime: "07:00", stopName: "Mundo Plaza" },
    { arrivalTime: "07:05", stopName: "Sumaré" },
    { arrivalTime: "07:40", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "07:50", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "08:20", stopName: "Mundo Plaza" },
    { arrivalTime: "08:40", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "09:10", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "09:20", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "09:40", stopName: "Mundo Plaza" },
    { arrivalTime: "10:05", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "10:35", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "10:45", stopName: "CAAB" },
    { arrivalTime: "10:55", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "11:20", stopName: "Mundo Plaza" },
    { arrivalTime: "11:35", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "12:00", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "12:15", stopName: "CAAB" },
    { arrivalTime: "12:25", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "12:45", stopName: "Mundo Plaza" },
    { arrivalTime: "13:00", stopName: "CAAB" },
    { arrivalTime: "13:15", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "13:35", stopName: "Mundo Plaza" },
    { arrivalTime: "13:50", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "14:25", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "14:35", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "14:55", stopName: "Mundo Plaza" },
    { arrivalTime: "15:15", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "15:45", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "15:55", stopName: "CAAB" },
    { arrivalTime: "16:05", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "16:25", stopName: "Mundo Plaza" },
    { arrivalTime: "16:40", stopName: "TRT-5 (Paralela)" },
    { arrivalTime: "17:25", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "17:35", stopName: "CAAB" },
    { arrivalTime: "17:45", stopName: "Comércio (Antigo TRT-5)" },
    { arrivalTime: "17:55", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "18:20", stopName: "Mundo Plaza" },
    { arrivalTime: "18:50", stopName: "Fórum Ruy Barbosa (CCJM/ESA)" },
    { arrivalTime: "19:00", stopName: "Comércio (Antigo TRT-5)" },
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
    const rowsWithCoords = schedule.map((s, i) => {
      const coords = STOP_COORDS[s.stopName];
      if (!coords) {
        console.warn(`  Warning: no coordinates for "${s.stopName}"`);
      }
      return {
        route_id: routeId,
        stop_name: s.stopName,
        arrival_time: s.arrivalTime,
        departure_time: s.arrivalTime,
        stop_sequence: i + 1,
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
      const rowsBasic = schedule.map((s, i) => ({
        route_id: routeId,
        stop_name: s.stopName,
        arrival_time: s.arrivalTime,
        departure_time: s.arrivalTime,
        stop_sequence: i + 1,
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
