/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import { resolveRouteProgress } from "@/lib/tracking/resolve-route-progress";
import { resolveNextStop } from "@/lib/tracking/eta";
import { formatTimeString } from "@/lib/time";

// --- Mock computeEta so we control ETA output without real OSRM/haversine ---
const mockComputeEta = vi.fn();
vi.mock("@/lib/tracking/eta", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tracking/eta")>();
  return {
    ...actual,
    computeEta: (...args: unknown[]) => mockComputeEta(...args),
  };
});

// --- Mock buildRecentRuns (not relevant to these tests) ---
vi.mock("@/lib/tracking/time-factors", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/tracking/time-factors")>();
  return {
    ...actual,
    buildRecentRuns: () => [],
  };
});

const TZ = "America/Bahia";
const SERVICE_DATE = "2026-03-07";
const ROUTE_ID = "route-1";
const VAN_ID = "van-1";
const RUN_ID = "run-1";

function makeNow(hour = 10, minute = 0): DateTime {
  return DateTime.fromObject({ hour, minute }, { zone: TZ });
}

const ENTRIES = [
  {
    id: "entry-a",
    stop_name: "Stop A",
    time: "08:30",
    stop_lat: -12.97,
    stop_lng: -38.51,
  },
  {
    id: "entry-b",
    stop_name: "Stop B",
    time: "08:45",
    stop_lat: -12.98,
    stop_lng: -38.52,
  },
  {
    id: "entry-c",
    stop_name: "Stop C",
    time: "09:00",
    stop_lat: -12.99,
    stop_lng: -38.53,
  },
];

const TIMES = ["08:30", "08:45", "09:00"];

// --- Chainable Supabase mock builder ---

interface MockQueryResult {
  data: unknown;
  error: null;
}

function chainable(result: MockQueryResult) {
  const handler: Record<string, unknown> = {};
  const self = new Proxy(handler, {
    get(_target, prop) {
      if (prop === "single") return () => Promise.resolve(result);
      if (prop === "then") {
        // Make it thenable so `await supabase.from(...).select(...).eq(...)` works
        return (
          resolve: (v: MockQueryResult) => void,
          reject: (e: unknown) => void,
        ) => Promise.resolve(result).then(resolve, reject);
      }
      // For any chained method (.select, .eq, .not, .order, .limit), return self
      return () => self;
    },
  });
  return self;
}

function buildSupabase(config: {
  runData?: {
    id: string;
    last_passed_stop_id: string | null;
    next_stop_id: string | null;
    progress_updated_at: string | null;
  } | null;
  shifts?: Array<{
    id: string;
    started_at: string;
    ended_at: string | null;
  }>;
  runStops?: Array<{
    schedule_entry_id: string;
    status: "pending" | "passed";
    passed_at: string | null;
    schedule_entries: { time: string };
  }>;
  recentPings?: Array<{ speed_mps: number; device_ts: string }>;
}) {
  const { runData = null, shifts = [], runStops = [], recentPings = [] } = config;

  const from = vi.fn((table: string) => {
    switch (table) {
      case "route_runs":
        return chainable({ data: runData, error: null });
      case "route_shifts":
        return chainable({ data: shifts, error: null });
      case "route_run_stops":
        return chainable({ data: runStops, error: null });
      case "van_location_pings":
        return chainable({ data: recentPings, error: null });
      default:
        return chainable({ data: null, error: null });
    }
  });

  return { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

// Default ETA result returned by mockComputeEta
function defaultEtaResult(nextStopId: string | null = "entry-b") {
  return {
    nextStopId,
    passedStopIds: nextStopId ? ["entry-a"] : ["entry-a", "entry-b", "entry-c"],
    etaNextStopISO: nextStopId ? "2026-03-07T08:50:00-03:00" : null,
    etaNextStopMinutes: nextStopId ? 5 : null,
    delayMinutes: nextStopId ? 2 : null,
    etaSource: nextStopId ? ("schedule" as const) : null,
  };
}

// Shared args builder
function makeArgs(supabase: import("@supabase/supabase-js").SupabaseClient, now?: DateTime) {
  return {
    supabase,
    routeId: ROUTE_ID,
    serviceDate: SERVICE_DATE,
    sortedEntries: ENTRIES,
    vanId: VAN_ID,
    vanPosition: null,
    now: now ?? makeNow(),
    times: TIMES,
  };
}

// Standard run stops (entry-a passed, entry-b and entry-c pending)
function standardRunStops() {
  return [
    {
      schedule_entry_id: "entry-a",
      status: "passed" as const,
      passed_at: "2026-03-07T08:32:00-03:00",
      schedule_entries: { time: "08:30" },
    },
    {
      schedule_entry_id: "entry-b",
      status: "pending" as const,
      passed_at: null,
      schedule_entries: { time: "08:45" },
    },
    {
      schedule_entry_id: "entry-c",
      status: "pending" as const,
      passed_at: null,
      schedule_entries: { time: "09:00" },
    },
  ];
}

describe("resolveRouteProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TRACKING_PROGRESS_SOURCE;
    mockComputeEta.mockImplementation(() => Promise.resolve(defaultEtaResult()));
  });

  it("returns null when no route_run exists for service date", async () => {
    const supabase = buildSupabase({ runData: null });
    const result = await resolveRouteProgress(makeArgs(supabase));
    expect(result).toBeNull();
  });

  it("returns progress with pointer nextStopId when pointer is valid", async () => {
    const freshTimestamp = makeNow()
      .minus({ minutes: 5 })
      .toISO()!;

    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-b",
        progress_updated_at: freshTimestamp,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");
    expect(result!.nextStopId).toBe("entry-b");
    expect(result!.etaSource).toBe("schedule");

    // In legacy mode (default), computeEta is called without targetStopId
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBeUndefined();
  });

  it("falls back to legacy ETA when pointer is null", async () => {
    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: null,
        progress_updated_at: null,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");
    // Legacy computeEta decides the next stop
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBeUndefined();
  });

  it("falls back to legacy when pointer is stale (> 30 min ago)", async () => {
    const staleTimestamp = makeNow()
      .minus({ minutes: 45 })
      .toISO()!;

    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-b",
        progress_updated_at: staleTimestamp,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");
    // In legacy mode the staleness just means targetStopId is not set,
    // but legacy doesn't use targetStopId anyway — verify no targetStopId passed
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBeUndefined();
  });

  it("falls back to legacy when pointer references an ID not in schedule entries", async () => {
    const freshTimestamp = makeNow()
      .minus({ minutes: 2 })
      .toISO()!;

    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-deleted",
        progress_updated_at: freshTimestamp,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBeUndefined();
  });

  it("returns null nextStopId and null ETA for completed run", async () => {
    // All shifts ended + past schedule window → completed
    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-c",
        next_stop_id: "entry-c",
        progress_updated_at: makeNow().minus({ minutes: 5 }).toISO()!,
      },
      shifts: [
        {
          id: "shift-1",
          started_at: "2026-03-07T08:00:00-03:00",
          ended_at: "2026-03-07T09:30:00-03:00",
        },
      ],
    });

    // now is 10:00, last time is 09:00 → past schedule window, all shifts ended → completed
    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("completed");
    expect(result!.nextStopId).toBeNull();
    expect(result!.etaNextStopISO).toBeNull();
    expect(result!.etaNextStopMinutes).toBeNull();
    expect(result!.delayMinutes).toBeNull();
    expect(result!.etaSource).toBeNull();
    // computeEta should NOT be called for completed runs
    expect(mockComputeEta).not.toHaveBeenCalled();
  });

  it("returns null nextStopId and null ETA for idle run", async () => {
    // All shifts ended but NOT past schedule window → idle
    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-b",
        progress_updated_at: makeNow().minus({ minutes: 5 }).toISO()!,
      },
      shifts: [
        {
          id: "shift-1",
          started_at: "2026-03-07T08:00:00-03:00",
          ended_at: "2026-03-07T08:20:00-03:00",
        },
      ],
    });

    // now is 08:40 — before last scheduled time (09:00), all shifts ended → idle
    const now = makeNow(8, 40);
    const result = await resolveRouteProgress(makeArgs(supabase, now));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("idle");
    expect(result!.nextStopId).toBeNull();
    expect(result!.etaNextStopISO).toBeNull();
    expect(result!.etaNextStopMinutes).toBeNull();
    expect(result!.etaSource).toBeNull();
    expect(mockComputeEta).not.toHaveBeenCalled();
  });

  it("returns waiting status with null nextStopId when no shifts exist", async () => {
    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: null,
        next_stop_id: null,
        progress_updated_at: null,
      },
      shifts: [],
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("waiting");
    // waiting goes through the full ETA path (not early-returned)
    // but since it's not "completed" or "idle", computeEta runs
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
  });

  it("pointer references deleted entry (not in entries array) falls back to legacy", async () => {
    const freshTimestamp = makeNow()
      .minus({ minutes: 1 })
      .toISO()!;

    // Pointer references "entry-x" which doesn't exist in ENTRIES
    // but entry-x IS present in runStops (for the pointer pending check)
    const runStopsWithDeletedRef = [
      ...standardRunStops(),
      {
        schedule_entry_id: "entry-x",
        status: "pending" as const,
        passed_at: null,
        schedule_entries: { time: "09:15" },
      },
    ];

    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-x",
        progress_updated_at: freshTimestamp,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: runStopsWithDeletedRef,
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");
    // entry-x is NOT in sortedEntries (entryIds set), so pointer is invalid → legacy fallback
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBeUndefined();
  });

  it("pointer that is valid but stop already passed is treated as invalid", async () => {
    const freshTimestamp = makeNow()
      .minus({ minutes: 2 })
      .toISO()!;

    // Pointer points to entry-a, which has status "passed" in runStops
    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: null,
        next_stop_id: "entry-a",
        progress_updated_at: freshTimestamp,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: standardRunStops(), // entry-a is "passed"
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    // entry-a exists in entries but is NOT pending → pointer invalid → no targetStopId
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBeUndefined();
  });

  it("resolver nextStopId matches resolveNextStop output (consistency invariant)", async () => {
    const freshTimestamp = makeNow().minus({ minutes: 5 }).toISO()!;
    mockComputeEta.mockResolvedValue(defaultEtaResult("entry-b"));

    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-b",
        progress_updated_at: freshTimestamp,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));
    expect(result).not.toBeNull();
    expect(result!.nextStopId).toBe("entry-b");

    // Verify resolveNextStop produces the same stop when given the resolver's nextStopId
    const resolved = resolveNextStop(ENTRIES, result!.nextStopId!, formatTimeString);
    expect(resolved).not.toBeNull();
    expect(resolved!.nextStopEntry.id).toBe(result!.nextStopId);
  });
});
