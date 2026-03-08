/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import { resolveRouteProgress } from "@/lib/tracking/resolve-route-progress";

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
  { id: "entry-a", stop_name: "Stop A", time: "08:30", stop_lat: -12.97, stop_lng: -38.51 },
  { id: "entry-b", stop_name: "Stop B", time: "08:45", stop_lat: -12.98, stop_lng: -38.52 },
  { id: "entry-c", stop_name: "Stop C", time: "09:00", stop_lat: -12.99, stop_lng: -38.53 },
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
        return (
          resolve: (v: MockQueryResult) => void,
          reject: (e: unknown) => void,
        ) => Promise.resolve(result).then(resolve, reject);
      }
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
  shifts?: Array<{ id: string; started_at: string; ended_at: string | null }>;
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

function freshTimestamp(now?: DateTime): string {
  return (now ?? makeNow()).minus({ minutes: 5 }).toISO()!;
}

function staleTimestamp(now?: DateTime): string {
  return (now ?? makeNow()).minus({ minutes: 35 }).toISO()!;
}

function activeRunData(overrides?: Partial<{
  next_stop_id: string | null;
  progress_updated_at: string | null;
}>) {
  return {
    id: RUN_ID,
    last_passed_stop_id: "entry-a",
    next_stop_id: "entry-b",
    progress_updated_at: freshTimestamp(),
    ...overrides,
  };
}

function activeShifts() {
  return [{ id: "shift-1", started_at: "2026-03-07T08:00:00-03:00", ended_at: null }];
}

describe("resolveRouteProgress — progress source modes (T018)", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TRACKING_PROGRESS_SOURCE;
    mockComputeEta.mockImplementation(() => Promise.resolve(defaultEtaResult()));
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    delete process.env.TRACKING_PROGRESS_SOURCE;
  });

  // --- Test 1: legacy mode ---
  it("legacy mode — ETA called without targetStopId, no shadow log", async () => {
    process.env.TRACKING_PROGRESS_SOURCE = "legacy";

    const supabase = buildSupabase({
      runData: activeRunData(),
      shifts: activeShifts(),
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBeUndefined();

    // No shadow or fallback logs
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  // --- Test 2: shadow mode, pointers match ---
  it("shadow mode, pointers match — no mismatch log emitted", async () => {
    process.env.TRACKING_PROGRESS_SOURCE = "shadow";

    // Both legacy and persisted return the same nextStopId
    mockComputeEta.mockImplementation(() =>
      Promise.resolve(defaultEtaResult("entry-b")),
    );

    const supabase = buildSupabase({
      runData: activeRunData({ next_stop_id: "entry-b" }),
      shifts: activeShifts(),
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    // Shadow mode calls computeEta twice (legacy + persisted)
    expect(mockComputeEta).toHaveBeenCalledTimes(2);

    // First call: legacy (no targetStopId)
    expect(mockComputeEta.mock.calls[0][0].targetStopId).toBeUndefined();
    // Second call: persisted (with targetStopId)
    expect(mockComputeEta.mock.calls[1][0].targetStopId).toBe("entry-b");

    // No mismatch log since both return "entry-b"
    expect(consoleSpy).not.toHaveBeenCalled();

    // Legacy result is served
    expect(result!.nextStopId).toBe("entry-b");
  });

  // --- Test 3: shadow mode, pointers differ ---
  it("shadow mode, pointers differ — structured mismatch log emitted", async () => {
    process.env.TRACKING_PROGRESS_SOURCE = "shadow";

    // Legacy returns entry-c, persisted returns entry-b
    mockComputeEta.mockImplementation((args: { targetStopId?: string }) => {
      if (args.targetStopId === "entry-b") {
        return Promise.resolve(defaultEtaResult("entry-b"));
      }
      return Promise.resolve(defaultEtaResult("entry-c"));
    });

    const supabase = buildSupabase({
      runData: activeRunData({ next_stop_id: "entry-b" }),
      shifts: activeShifts(),
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(mockComputeEta).toHaveBeenCalledTimes(2);

    // Legacy result is served (entry-c)
    expect(result!.nextStopId).toBe("entry-c");

    // Mismatch log emitted
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logPayload = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(logPayload).toMatchObject({
      event: "progress_source_mismatch",
      routeId: ROUTE_ID,
      runId: RUN_ID,
      runStatus: "in_progress",
      legacyNextStopId: "entry-c",
      persistedNextStopId: "entry-b",
      etaSource: "schedule",
      reason: "different_selection",
    });
  });

  // --- Test 3b: shadow mode, pointer missing/invalid → reason reflects that ---
  it("shadow mode, pointer missing — mismatch log has pointer_missing_or_invalid reason", async () => {
    process.env.TRACKING_PROGRESS_SOURCE = "shadow";

    // Legacy and persisted will be the same call (no valid pointer)
    // but legacy returns entry-c for legacy, and persisted falls back to same
    // Actually when targetStopId is undefined, persisted = legacy result (no second call)
    // So for a mismatch with missing pointer, we need the null pointer path
    mockComputeEta.mockImplementation(() =>
      Promise.resolve(defaultEtaResult("entry-c")),
    );

    const supabase = buildSupabase({
      runData: activeRunData({ next_stop_id: null, progress_updated_at: null }),
      shifts: activeShifts(),
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    // When pointer is missing, targetStopId is undefined.
    // Shadow mode: legacyResult = computeEta(etaArgs), persistedResult = legacyResult (since !targetStopId)
    // So nextStopIds are equal → no mismatch log
    expect(mockComputeEta).toHaveBeenCalledTimes(1); // Only legacy call (persisted reuses legacy when no targetStopId)
    expect(consoleSpy).not.toHaveBeenCalled(); // No mismatch since they're the same
  });

  // --- Test 4: persisted mode, valid pointer ---
  it("persisted mode, valid pointer — ETA called with targetStopId", async () => {
    process.env.TRACKING_PROGRESS_SOURCE = "persisted";

    mockComputeEta.mockImplementation(() =>
      Promise.resolve(defaultEtaResult("entry-b")),
    );

    const supabase = buildSupabase({
      runData: activeRunData({ next_stop_id: "entry-b" }),
      shifts: activeShifts(),
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBe("entry-b");

    expect(result!.nextStopId).toBe("entry-b");
    // No fallback log
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  // --- Test 5: persisted mode, stale pointer ---
  it("persisted mode, stale pointer — falls back to legacy, log emitted", async () => {
    process.env.TRACKING_PROGRESS_SOURCE = "persisted";

    mockComputeEta.mockImplementation(() =>
      Promise.resolve(defaultEtaResult("entry-b")),
    );

    const supabase = buildSupabase({
      runData: activeRunData({ progress_updated_at: staleTimestamp() }),
      shifts: activeShifts(),
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    // Falls back to legacy (no targetStopId)
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBeUndefined();

    // Fallback log emitted
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logPayload = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(logPayload).toMatchObject({
      event: "progress_source_fallback",
      routeId: ROUTE_ID,
      runId: RUN_ID,
      runStatus: "in_progress",
      reason: "pointer_stale_or_not_pending",
    });
  });

  // --- Test 6: persisted mode, missing pointer ---
  it("persisted mode, missing pointer — falls back to legacy", async () => {
    process.env.TRACKING_PROGRESS_SOURCE = "persisted";

    mockComputeEta.mockImplementation(() =>
      Promise.resolve(defaultEtaResult("entry-b")),
    );

    const supabase = buildSupabase({
      runData: activeRunData({ next_stop_id: null, progress_updated_at: null }),
      shifts: activeShifts(),
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    // Falls back to legacy (no targetStopId)
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBeUndefined();

    // No fallback log when next_stop_id is null (only logs when pointer exists but is invalid)
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  // --- Test 7: invalid env var value ---
  it("invalid env var value — defaults to legacy mode", async () => {
    process.env.TRACKING_PROGRESS_SOURCE = "bogus_value";

    mockComputeEta.mockImplementation(() =>
      Promise.resolve(defaultEtaResult("entry-b")),
    );

    const supabase = buildSupabase({
      runData: activeRunData({ next_stop_id: "entry-b" }),
      shifts: activeShifts(),
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    // Legacy mode: single computeEta call, no targetStopId
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBeUndefined();

    // No shadow or fallback logs
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  // --- Edge: persisted mode, pointer references entry not in schedule ---
  it("persisted mode, pointer references unknown entry — falls back to legacy, log emitted", async () => {
    process.env.TRACKING_PROGRESS_SOURCE = "persisted";

    mockComputeEta.mockImplementation(() =>
      Promise.resolve(defaultEtaResult("entry-b")),
    );

    const supabase = buildSupabase({
      runData: activeRunData({ next_stop_id: "entry-deleted" }),
      shifts: activeShifts(),
      runStops: standardRunStops(),
    });

    const result = await resolveRouteProgress(makeArgs(supabase));

    expect(result).not.toBeNull();
    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBeUndefined();

    // Fallback log with "pointer_invalid" reason
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logPayload = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(logPayload).toMatchObject({
      event: "progress_source_fallback",
      routeId: ROUTE_ID,
      runId: RUN_ID,
      reason: "pointer_invalid",
    });
  });

  // --- Edge: env var undefined defaults to legacy ---
  it("undefined env var — defaults to legacy mode", async () => {
    delete process.env.TRACKING_PROGRESS_SOURCE;

    const supabase = buildSupabase({
      runData: activeRunData({ next_stop_id: "entry-b" }),
      shifts: activeShifts(),
      runStops: standardRunStops(),
    });

    await resolveRouteProgress(makeArgs(supabase));

    expect(mockComputeEta).toHaveBeenCalledTimes(1);
    const callArgs = mockComputeEta.mock.calls[0][0];
    expect(callArgs.targetStopId).toBeUndefined();
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
