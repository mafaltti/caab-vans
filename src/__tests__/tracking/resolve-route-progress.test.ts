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
    arrival_time: "08:30",
    departure_time: "08:30",
    stop_lat: -12.97,
    stop_lng: -38.51,
    stop_sequence: 1,
  },
  {
    id: "entry-b",
    stop_name: "Stop B",
    time: "08:45",
    arrival_time: "08:45",
    departure_time: "08:45",
    stop_lat: -12.98,
    stop_lng: -38.52,
    stop_sequence: 2,
  },
  {
    id: "entry-c",
    stop_name: "Stop C",
    time: "09:00",
    arrival_time: "09:00",
    departure_time: "09:00",
    stop_lat: -12.99,
    stop_lng: -38.53,
    stop_sequence: 3,
  },
];

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

    // In persisted mode (default), computeEta is called with targetStopId
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBe("entry-b");
  });

  it("self-heals when pointer is null — derives next stop from contiguous prefix", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    // Null pointer triggers self-heal → derives entry-b from contiguous prefix
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBe("entry-b");

    // Self-heal log emitted
    const healLog = consoleSpy.mock.calls.find((c) => {
      try { return JSON.parse(c[0] as string).event === "progress_pointer_healed"; } catch { return false; }
    });
    expect(healLog).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("pointer at 45 min is stale but valid under 120 min ceiling", async () => {
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
    // Default is persisted mode; 45 min is within 120 min ceiling → pointer valid
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBe("entry-b");
  });

  it("self-heals when pointer is expired (> 120 min ago)", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const expiredTimestamp = makeNow()
      .minus({ minutes: 125 })
      .toISO()!;

    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-b",
        progress_updated_at: expiredTimestamp,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");
    // Pointer expired (> 120 min) → self-heal derives entry-b from contiguous prefix
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBe("entry-b");

    consoleSpy.mockRestore();
  });

  it("self-heals when pointer references an ID not in schedule entries", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
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
    // Invalid pointer → self-heal derives entry-b from contiguous prefix
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBe("entry-b");
    consoleSpy.mockRestore();
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
    // waiting is early-returned like completed/idle — no ETA, no nextStopId
    expect(result!.nextStopId).toBeNull();
    expect(result!.etaNextStopMinutes).toBeNull();
    expect(result!.etaSource).toBeNull();
    expect(mockComputeEta).not.toHaveBeenCalled();
  });

  it("pointer references deleted entry (not in entries array) triggers self-heal", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
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
    // entry-x is NOT in sortedEntries → pointer invalid → self-heal derives entry-b
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBe("entry-b");
    consoleSpy.mockRestore();
  });

  it("pointer that is valid but stop already passed triggers self-heal", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
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
    // entry-a exists in entries but is NOT pending → pointer invalid → self-heal derives entry-b
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBe("entry-b");
    consoleSpy.mockRestore();
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

  it("completed run with includeLastKnown=true returns progress", async () => {
    mockComputeEta.mockImplementation(() => Promise.resolve(defaultEtaResult()));

    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-c",
        next_stop_id: null,
        progress_updated_at: makeNow().minus({ minutes: 5 }).toISO()!,
      },
      shifts: [
        {
          id: "shift-1",
          started_at: "2026-03-07T08:00:00-03:00",
          ended_at: "2026-03-07T09:30:00-03:00",
        },
      ],
      runStops: standardRunStops(),
    });

    const args = { ...makeArgs(supabase), includeLastKnown: true };
    const result = await resolveRouteProgress(args);

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("completed");
    // With includeLastKnown, computeEta IS called (not early-returned)
    expect(mockComputeEta).toHaveBeenCalled();
  });

  it("completed run without includeLastKnown returns null values (existing behavior)", async () => {
    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-c",
        next_stop_id: null,
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

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("completed");
    expect(result!.nextStopId).toBeNull();
    expect(result!.etaSource).toBeNull();
    expect(mockComputeEta).not.toHaveBeenCalled();
  });

  it("active run ignores includeLastKnown flag (always returns progress)", async () => {
    mockComputeEta.mockImplementation(() => Promise.resolve(defaultEtaResult()));

    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-b",
        progress_updated_at: makeNow().minus({ minutes: 5 }).toISO()!,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: standardRunStops(),
    });

    const args = { ...makeArgs(supabase), includeLastKnown: true };
    const result = await resolveRouteProgress(args);

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");
    expect(mockComputeEta).toHaveBeenCalled();
  });

  it("rejects non-adjacent pointer and self-heals to correct next stop", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const freshTimestamp = makeNow()
      .minus({ minutes: 2 })
      .toISO()!;

    // last_passed_stop_id = entry-a, next_stop_id = entry-c
    // But entry-b is pending between them → non-adjacent → reject pointer → self-heal
    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-c",
        progress_updated_at: freshTimestamp,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: [
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
      ],
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");
    // Pointer entry-c is non-adjacent → rejected → self-heal derives entry-b
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBe("entry-b");
    consoleSpy.mockRestore();
  });

  it("accepts adjacent pointer (next_stop_id is immediate successor of last_passed_stop_id)", async () => {
    const freshTimestamp = makeNow()
      .minus({ minutes: 2 })
      .toISO()!;

    // last_passed_stop_id = entry-a, next_stop_id = entry-b
    // entry-b is the immediate successor of entry-a → adjacent → accept
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
    // Pointer entry-b is adjacent to entry-a → accepted
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBe("entry-b");
  });

  it("non-contiguous passed stops are demoted before ETA computation", async () => {
    const freshTimestamp = makeNow()
      .minus({ minutes: 2 })
      .toISO()!;

    // entry-a is passed, entry-b is pending, entry-c is passed (gap from low-confidence match)
    // The contiguous prefix is only entry-a, so entry-c should be demoted to pending
    // before reaching computeEta.
    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-b",
        progress_updated_at: freshTimestamp,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: [
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
          status: "passed" as const,
          passed_at: "2026-03-07T08:55:00-03:00",
          schedule_entries: { time: "09:00" },
        },
      ],
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    // computeEta should receive entry-c as "pending", not "passed"
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const stopsArg = mockComputeEta.mock.calls[0][0].stops;
    const entryC = stopsArg.find((s: { scheduleEntryId: string }) => s.scheduleEntryId === "entry-c");
    expect(entryC.status).toBe("pending");
    expect(entryC.passedAt).toBeNull();
    // entry-a should still be passed
    const entryA = stopsArg.find((s: { scheduleEntryId: string }) => s.scheduleEntryId === "entry-a");
    expect(entryA.status).toBe("passed");
  });

  it("waiting route with includeLastKnown=true returns null nextStopId (no stale pointer)", async () => {
    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-b",
        progress_updated_at: makeNow().minus({ minutes: 5 }).toISO()!,
      },
      shifts: [],
      runStops: standardRunStops(),
    });

    const args = { ...makeArgs(supabase), includeLastKnown: true };
    const result = await resolveRouteProgress(args);

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("waiting");
    expect(result!.nextStopId).toBeNull();
    expect(result!.etaNextStopMinutes).toBeNull();
    expect(result!.etaNextStopISO).toBeNull();
    // Should not even call computeEta for waiting routes
    expect(mockComputeEta).not.toHaveBeenCalled();
  });

  // --- T015: stale pointer targeting already-passed stop triggers self-heal ---
  it("stale pointer targeting already-passed stop self-heals to next pending by route order", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Pointer points to entry-a which is already passed
    // Even though pointer is fresh, the stop is not pending → invalid → self-heal
    mockComputeEta.mockImplementation(() =>
      Promise.resolve(defaultEtaResult("entry-b")),
    );

    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-a", // points to already-passed stop
        progress_updated_at: makeNow().minus({ minutes: 5 }).toISO()!,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: standardRunStops(), // entry-a is passed, entry-b and entry-c pending
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");
    // Pointer to passed stop is invalid → self-heal derives entry-b
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBe("entry-b");
    expect(result!.nextStopId).toBe("entry-b");

    // Self-heal log emitted
    const healLog = consoleSpy.mock.calls.find((c) => {
      try { return JSON.parse(c[0] as string).event === "progress_pointer_healed"; } catch { return false; }
    });
    expect(healLog).toBeDefined();
    const logPayload = JSON.parse(healLog![0] as string);
    expect(logPayload).toMatchObject({
      event: "progress_pointer_healed",
      routeId: ROUTE_ID,
      runId: RUN_ID,
      healedNextStopId: "entry-b",
      healedLastPassedStopId: "entry-a",
    });
    consoleSpy.mockRestore();
  });

  // --- T015: self-heal persists repaired pointer and logs progress_pointer_healed ---
  it("self-heal: invalid next_stop_id is repaired from contiguous stops, persisted, and logged", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // entry-a passed, entry-b pending, entry-c pending
    // Pointer points to "entry-deleted" (not in schedule) → invalid
    // Self-heal should derive entry-b as healedNextStopId, entry-a as healedLastPassedStopId,
    // persist the repair via supabase.from("route_runs").update(), and log progress_pointer_healed.
    mockComputeEta.mockImplementation((args: { targetStopId?: string }) =>
      Promise.resolve(defaultEtaResult(args.targetStopId ?? null)),
    );

    const freshTimestamp = makeNow().minus({ minutes: 2 }).toISO()!;

    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-deleted", // invalid — not in schedule entries
        progress_updated_at: freshTimestamp,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");

    // computeEta called with healed targetStopId
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBe("entry-b");

    // Self-heal persisted: supabase.from("route_runs") called for the update
    const routeRunsCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: string[]) => c[0] === "route_runs");
    // At least 2 calls: one for the initial select, one for the update
    expect(routeRunsCalls.length).toBeGreaterThanOrEqual(2);

    // Self-heal log emitted with correct payload
    const healLog = consoleSpy.mock.calls.find((c) => {
      try { return JSON.parse(c[0] as string).event === "progress_pointer_healed"; } catch { return false; }
    });
    expect(healLog).toBeDefined();
    const logPayload = JSON.parse(healLog![0] as string);
    expect(logPayload).toMatchObject({
      event: "progress_pointer_healed",
      routeId: ROUTE_ID,
      runId: RUN_ID,
      healedNextStopId: "entry-b",
      healedLastPassedStopId: "entry-a",
    });

    consoleSpy.mockRestore();
  });

  // --- T049: runHealth = "orphaned" when shift meets both orphan criteria ---
  it("runHealth is orphaned when shift is 90+ min past schedule end and GPS is 30+ min stale", async () => {
    mockComputeEta.mockImplementation(() => Promise.resolve(defaultEtaResult()));

    // now = 10:31 → 91 min past last scheduled time (09:00)
    const now = makeNow(10, 31);

    // Last GPS fix 35 min ago → inactive
    const lastGpsFixAt = now.minus({ minutes: 35 });

    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-b",
        progress_updated_at: lastGpsFixAt.toISO()!, // same staleness as GPS
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T07:00:00-03:00", ended_at: null }],
      runStops: standardRunStops(),
    });

    const vanPosition = {
      lat: -12.97,
      lng: -38.51,
      speedMps: 0,
      lastGpsFixAt,
    };

    const result = await resolveRouteProgress({
      ...makeArgs(supabase, now),
      vanPosition,
    });

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");
    expect(result!.runHealth).toBe("orphaned");
  });

  // --- T050: runHealth = "normal" when shift is within schedule window ---
  it("runHealth is normal when shift is within or shortly after schedule window", async () => {
    mockComputeEta.mockImplementation(() => Promise.resolve(defaultEtaResult()));

    // now = 09:10 → only 10 min past last scheduled time (09:00), well under 90 min threshold
    const now = makeNow(9, 10);

    const supabase = buildSupabase({
      runData: {
        id: RUN_ID,
        last_passed_stop_id: "entry-a",
        next_stop_id: "entry-b",
        progress_updated_at: now.minus({ minutes: 2 }).toISO()!,
      },
      shifts: [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }],
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase, now));

    expect(result).not.toBeNull();
    expect(result!.runStatus).toBe("in_progress");
    expect(result!.runHealth).toBe("normal");
  });
});
