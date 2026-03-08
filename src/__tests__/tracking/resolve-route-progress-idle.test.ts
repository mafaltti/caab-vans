/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import { resolveRouteProgress } from "@/lib/tracking/resolve-route-progress";

const TZ = "America/Bahia";

/**
 * Build a mock Supabase client that returns canned data for each table.
 */
function mockSupabase(overrides: {
  routeRun?: Record<string, unknown> | null;
  shifts?: Array<Record<string, unknown>>;
  runStops?: Array<Record<string, unknown>>;
  pings?: Array<Record<string, unknown>>;
}) {
  const routeRun = overrides.routeRun ?? null;
  const shifts = overrides.shifts ?? [];
  const runStops = overrides.runStops ?? [];
  const pings = overrides.pings ?? [];

  // Each .from() call returns a chainable builder that resolves to { data }
  function chainable(data: unknown) {
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    builder.select = vi.fn().mockReturnValue(builder);
    builder.eq = vi.fn().mockReturnValue(builder);
    builder.not = vi.fn().mockReturnValue(builder);
    builder.order = vi.fn().mockReturnValue(builder);
    builder.limit = vi.fn().mockReturnValue(builder);
    builder.single = vi.fn().mockResolvedValue({ data, error: null });
    // For non-single queries, the terminal await resolves via .then
    builder.then = (resolve: (v: unknown) => void) =>
      resolve({ data: Array.isArray(data) ? data : data ? [data] : [], error: null });
    return builder;
  }

  const tableMap: Record<string, unknown> = {
    route_runs: chainable(routeRun),
    route_shifts: chainable(shifts),
    route_run_stops: chainable(runStops),
    van_location_pings: chainable(pings),
  };

  return { from: vi.fn((table: string) => tableMap[table]) } as never;
}

const SERVICE_DATE = "2026-03-08";
const NOW = DateTime.fromObject({ hour: 10, minute: 0 }, { zone: TZ });

const SORTED_ENTRIES = [
  { id: "entry-1", stop_name: "Stop A", time: "08:00", stop_lat: -12.97, stop_lng: -38.51 },
  { id: "entry-2", stop_name: "Stop B", time: "08:30", stop_lat: -12.98, stop_lng: -38.52 },
  { id: "entry-3", stop_name: "Stop C", time: "09:00", stop_lat: -12.99, stop_lng: -38.53 },
];

const TIMES = SORTED_ENTRIES.map((e) => e.time);

describe("resolveRouteProgress – idle suppression (FR-011)", () => {
  const originalEnv = process.env.TRACKING_PROGRESS_SOURCE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TRACKING_PROGRESS_SOURCE;
    } else {
      process.env.TRACKING_PROGRESS_SOURCE = originalEnv;
    }
  });

  it("idle run with persisted pointer returns null nextStopId and null ETA", async () => {
    // The pointer exists in route_runs (next_stop_id = "entry-2") but should NOT be surfaced
    const supabase = mockSupabase({
      routeRun: {
        id: "run-1",
        next_stop_id: "entry-2",
        last_passed_stop_id: "entry-1",
        progress_updated_at: NOW.minus({ minutes: 5 }).toISO(),
      },
      // All shifts ended → idle (not past schedule window since NOW is 10:00 and last stop is 09:00,
      // but we set isPastScheduleWindow via times — 10:00 > 09:00 → completed.
      // To get idle, we need isPastScheduleWindow=false, so use later schedule times.)
      shifts: [
        { id: "shift-1", started_at: NOW.minus({ hours: 2 }).toISO(), ended_at: NOW.minus({ hours: 1 }).toISO() },
      ],
      runStops: [
        { schedule_entry_id: "entry-1", status: "passed", passed_at: NOW.minus({ hours: 2 }).toISO(), schedule_entries: { time: "08:00" } },
        { schedule_entry_id: "entry-2", status: "pending", passed_at: null, schedule_entries: { time: "08:30" } },
        { schedule_entry_id: "entry-3", status: "pending", passed_at: null, schedule_entries: { time: "09:00" } },
      ],
      pings: [],
    });

    // Use later times so isPastScheduleWindow is false → idle (not completed)
    const laterTimes = ["08:00", "08:30", "11:00"];
    const laterEntries = [
      ...SORTED_ENTRIES.slice(0, 2),
      { id: "entry-3", stop_name: "Stop C", time: "11:00", stop_lat: -12.99, stop_lng: -38.53 },
    ];

    const result = await resolveRouteProgress({
      supabase,
      routeId: "route-1",
      serviceDate: SERVICE_DATE,
      sortedEntries: laterEntries,
      vanId: "van-1",
      vanPosition: null,
      now: NOW,
      times: laterTimes,
    });

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("idle");
    expect(result!.nextStopId).toBeNull();
    expect(result!.etaNextStopISO).toBeNull();
    expect(result!.etaNextStopMinutes).toBeNull();
    expect(result!.delayMinutes).toBeNull();
    expect(result!.etaSource).toBeNull();
    expect(result!.shiftStartedAt).toBeNull();
  });

  it("idle run transitions to in_progress when new shift starts — pointer re-activates", async () => {
    process.env.TRACKING_PROGRESS_SOURCE = "persisted";

    const shiftStartedAt = NOW.minus({ minutes: 10 }).toISO()!;

    const supabase = mockSupabase({
      routeRun: {
        id: "run-1",
        next_stop_id: "entry-2",
        last_passed_stop_id: "entry-1",
        progress_updated_at: NOW.minus({ minutes: 5 }).toISO(),
      },
      shifts: [
        // Previous shift (ended)
        { id: "shift-1", started_at: NOW.minus({ hours: 2 }).toISO(), ended_at: NOW.minus({ hours: 1 }).toISO() },
        // New shift (active — no ended_at) → in_progress
        { id: "shift-2", started_at: shiftStartedAt, ended_at: null },
      ],
      runStops: [
        { schedule_entry_id: "entry-1", status: "passed", passed_at: NOW.minus({ hours: 2 }).toISO(), schedule_entries: { time: "08:00" } },
        { schedule_entry_id: "entry-2", status: "pending", passed_at: null, schedule_entries: { time: "08:30" } },
        { schedule_entry_id: "entry-3", status: "pending", passed_at: null, schedule_entries: { time: "09:00" } },
      ],
      pings: [],
    });

    const result = await resolveRouteProgress({
      supabase,
      routeId: "route-1",
      serviceDate: SERVICE_DATE,
      sortedEntries: SORTED_ENTRIES,
      vanId: "van-1",
      vanPosition: null,
      now: NOW,
      times: TIMES,
    });

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");
    // Pointer re-activates: nextStopId should be the persisted pointer
    expect(result!.nextStopId).toBe("entry-2");
    expect(result!.shiftStartedAt).toBe(shiftStartedAt);
    // ETA should be computed (schedule-based fallback since no GPS)
    // Stop 08:30 is overdue at NOW (10:00) → etaStatus "overdue", minutes null
    expect(result!.etaNextStopISO).not.toBeNull();
    expect(result!.etaStatus).toBe("overdue");
    expect(result!.etaNextStopMinutes).toBeNull();
    expect(result!.etaSource).toBe("schedule");
  });

  it("includeLastKnown with invalid pointer does not advertise schedule guess as last_known", async () => {
    process.env.TRACKING_PROGRESS_SOURCE = "persisted";

    const supabase = mockSupabase({
      routeRun: {
        id: "run-1",
        next_stop_id: "entry-2",
        last_passed_stop_id: "entry-1",
        // Pointer expired — progress_updated_at is far in the past
        progress_updated_at: NOW.minus({ hours: 24 }).toISO(),
      },
      shifts: [
        // Ended shift → idle
        { id: "shift-1", started_at: NOW.minus({ hours: 4 }).toISO(), ended_at: NOW.minus({ hours: 2 }).toISO() },
      ],
      runStops: [
        { schedule_entry_id: "entry-1", status: "passed", passed_at: NOW.minus({ hours: 4 }).toISO(), schedule_entries: { time: "08:00" } },
        { schedule_entry_id: "entry-2", status: "pending", passed_at: null, schedule_entries: { time: "08:30" } },
        { schedule_entry_id: "entry-3", status: "pending", passed_at: null, schedule_entries: { time: "09:00" } },
      ],
      pings: [],
    });

    // Use later times so isPastScheduleWindow is false → idle
    const laterTimes = ["08:00", "08:30", "11:00"];
    const laterEntries = [
      ...SORTED_ENTRIES.slice(0, 2),
      { id: "entry-3", stop_name: "Stop C", time: "11:00", stop_lat: -12.99, stop_lng: -38.53 },
    ];

    const result = await resolveRouteProgress({
      supabase,
      routeId: "route-1",
      serviceDate: SERVICE_DATE,
      sortedEntries: laterEntries,
      vanId: "van-1",
      vanPosition: null,
      now: NOW,
      times: laterTimes,
      includeLastKnown: true,
    });

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("idle");
    // Persisted pointer is expired → nextStopId and ETA must be null so the
    // route handler does not label a schedule-derived guess as "last_known"
    expect(result!.nextStopId).toBeNull();
    expect(result!.etaNextStopMinutes).toBeNull();
    expect(result!.etaNextStopISO).toBeNull();
  });
});
