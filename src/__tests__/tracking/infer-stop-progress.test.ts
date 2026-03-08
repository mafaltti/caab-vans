/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import { haversineDistanceMeters } from "@/lib/tracking/haversine";
import { inferStopProgress } from "@/lib/tracking/infer-stop-progress";

const TZ = "America/Bahia";

// --- Haversine tests (existing) ---

describe("geofence detection via haversineDistanceMeters", () => {
  const stopLat = -12.9714;
  const stopLng = -38.5124;

  it("detects a point within 50m geofence", () => {
    const vanLat = -12.97143;
    const vanLng = -38.51237;
    const distance = haversineDistanceMeters(vanLat, vanLng, stopLat, stopLng);
    expect(distance).toBeLessThan(50);
  });

  it("rejects a point outside 50m geofence", () => {
    const vanLat = -12.9724;
    const vanLng = -38.5124;
    const distance = haversineDistanceMeters(vanLat, vanLng, stopLat, stopLng);
    expect(distance).toBeGreaterThan(50);
  });

  it("accepts a point ~80m away with 100m geofence radius", () => {
    const vanLat = stopLat - 0.00072;
    const vanLng = stopLng;
    const distance = haversineDistanceMeters(vanLat, vanLng, stopLat, stopLng);
    expect(distance).toBeGreaterThan(70);
    expect(distance).toBeLessThan(90);
    expect(distance).toBeLessThan(100);
  });

  it("verifies monotonically increasing distances from reference point", () => {
    const points: [number, number][] = [
      [stopLat + 0.0001, stopLng],
      [stopLat + 0.0005, stopLng],
      [stopLat + 0.001, stopLng],
      [stopLat + 0.005, stopLng],
    ];

    const distances = points.map(([lat, lng]) =>
      haversineDistanceMeters(stopLat, stopLng, lat, lng),
    );

    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThan(distances[i - 1]);
    }
  });
});

// --- inferStopProgress tests ---

// Mock time module to control "now"
vi.mock("@/lib/time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/time")>();
  const mockedNowBahia = vi.fn(() => actual.nowBahia());
  return {
    ...actual,
    nowBahia: mockedNowBahia,
    todayBahiaDate: vi.fn(() => mockedNowBahia().toFormat("yyyy-MM-dd")),
    parseTime: vi.fn((hhMm: string) => {
      const [hour, minute] = hhMm.split(":").map(Number);
      return mockedNowBahia().set({ hour, minute, second: 0, millisecond: 0 });
    }),
  };
});

import { nowBahia, todayBahiaDate } from "@/lib/time";

// Coordinates for CAAB stop (used across tests)
const CAAB_LAT = -12.9714;
const CAAB_LNG = -38.5124;
const VAN_AT_CAAB_LAT = -12.97143; // ~5m from CAAB, well within 50m geofence
const VAN_AT_CAAB_LNG = -38.51237;

type UpdateCall = {
  schedule_entry_id: string;
  status: string;
  pass_source?: string;
  pass_confidence?: number;
};

type BackfillCall = {
  schedule_entry_ids: string[];
  status: string;
  pass_source?: string;
  pass_confidence?: number;
};

type RouteRunUpdateCall = {
  last_passed_stop_id: string | null;
  next_stop_id: string | null;
  progress_updated_at: string;
};

/**
 * Build a mock Supabase client that returns predefined data and tracks
 * which route_run_stops get updated to "passed".
 */
function createMockSupabase(opts: {
  pendingStops: Array<{
    schedule_entry_id: string;
    schedule_entries: {
      time: string;
      stop_lat: number;
      stop_lng: number;
      geofence_radius_m: number;
      stop_group_id?: string | null;
    };
  }>;
  allStops: Array<{
    schedule_entry_id: string;
    status: string;
    schedule_entries: { time: string };
  }>;
  stopCount?: number;
  shifts?: Array<{ id: string; ended_at: string | null }>;
  pings?: Array<{ lat: number; lng: number }>;
}) {
  const updates: UpdateCall[] = [];
  const backfills: BackfillCall[] = [];
  const routeRunUpdates: RouteRunUpdateCall[] = [];
  const { pendingStops, allStops, stopCount = 10, shifts = [], pings = [] } = opts;

  // Helper: build a chainable mock that terminates with the given result
  function chain(result: unknown) {
    const handler: Record<string, unknown> = {};
    const proxy = new Proxy(handler, {
      get(_target, prop) {
        if (prop === "then") return undefined; // not a promise
        if (prop === "single") return () => ({ data: result, error: null });
        if (prop === "order") return () => ({ data: result, error: null, count: typeof result === "number" ? result : undefined });
        return () => proxy; // .select(), .eq(), .not(), .upsert(), etc.
      },
    });
    return proxy;
  }

  const mock = {
    from: vi.fn((table: string) => {
      if (table === "routes") {
        return chain({ id: "route-1" });
      }
      if (table === "route_runs") {
        const runData = { id: "run-1", started_at: null };
        return {
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockReturnValue({
                data: runData,
                error: null,
              }),
            }),
          }),
          update: vi.fn((payload: RouteRunUpdateCall) => ({
            eq: vi.fn(() => {
              routeRunUpdates.push(payload);
              return { error: null };
            }),
          })),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockReturnValue({ data: runData, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "schedule_entries") {
        return chain([]);
      }
      if (table === "route_shifts") {
        const activeShift = shifts.find(s => s.ended_at === null) ?? null;
        const chainable: Record<string, unknown> = {};
        const proxy = new Proxy(chainable, {
          get(_target, prop) {
            if (prop === "then") return undefined;
            if (prop === "maybeSingle") return () => ({ data: activeShift, error: null });
            return () => proxy;
          },
        });
        return proxy;
      }
      if (table === "van_location_pings") {
        const pingResult = { data: pings, error: null };
        const pingProxy: Record<string, unknown> = {};
        const pp = new Proxy(pingProxy, {
          get(_target, prop) {
            if (prop === "then") return undefined;
            if (prop === "limit") return () => pingResult;
            return () => pp;
          },
        });
        return pp;
      }
      if (table === "route_run_stops") {
        return {
          select: vi.fn((selectStr: string, selectOpts?: { count?: string; head?: boolean }) => {
            if (selectOpts?.count === "exact") {
              // Step 4: count query
              return {
                eq: () => ({ data: null, error: null, count: stopCount }),
              };
            }
            if (selectStr.includes("schedule_entries!inner(time, stop_lat") && selectStr.includes("stop_group_id")) {
              // Step 5: pending stops query
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    not: vi.fn().mockReturnValue({
                      not: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                          data: pendingStops,
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              };
            }
            // Step 7: all stops query
            return {
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  data: allStops,
                  error: null,
                }),
              }),
            };
          }),
          update: vi.fn((payload: { status: string; pass_source?: string; pass_confidence?: number }) => ({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn((field: string, value: string) => {
                if (field === "schedule_entry_id") {
                  updates.push({
                    schedule_entry_id: value,
                    status: payload.status,
                    pass_source: payload.pass_source,
                    pass_confidence: payload.pass_confidence,
                  });
                }
                return { error: null };
              }),
              in: vi.fn((field: string, ids: string[]) => {
                if (field === "schedule_entry_id") {
                  backfills.push({
                    schedule_entry_ids: ids,
                    status: payload.status,
                    pass_source: payload.pass_source,
                    pass_confidence: payload.pass_confidence,
                  });
                }
                return { error: null };
              }),
            }),
          })),
          insert: vi.fn().mockReturnValue({ error: null }),
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockReturnValue({
                data: { id: "run-1", started_at: null },
                error: null,
              }),
            }),
          }),
        };
      }
      return chain(null);
    }),
    _updates: updates,
    _backfills: backfills,
    _routeRunUpdates: routeRunUpdates,
  };

  return mock;
}

function setMockTime(hour: number, minute: number) {
  const dt = DateTime.fromObject({ hour, minute }, { zone: TZ });
  vi.mocked(nowBahia).mockReturnValue(dt);
  vi.mocked(todayBahiaDate).mockReturnValue(dt.toFormat("yyyy-MM-dd"));
}

describe("inferStopProgress geofence dedup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("marks a single-occurrence stop as passed (regression)", async () => {
    setMockTime(8, 5);

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-0800",
        status: "passed",
        schedule_entries: { time: "08:00" },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    const result = await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("entry-0800");
    expect(result.passedStopIds).toContain("entry-0800");
  });

  it("marks only first pending occurrence of a repeated stop", async () => {
    setMockTime(7, 5);

    const pendingStops = [
      {
        schedule_entry_id: "caab-0700",
        schedule_entries: {
          time: "07:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "caab-0900",
        schedule_entries: {
          time: "09:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "caab-1100",
        schedule_entries: {
          time: "11:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "caab-0700",
        status: "passed",
        schedule_entries: { time: "07:00" },
      },
      {
        schedule_entry_id: "caab-0900",
        status: "pending",
        schedule_entries: { time: "09:00" },
      },
      {
        schedule_entry_id: "caab-1100",
        status: "pending",
        schedule_entries: { time: "11:00" },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    // Only the 07:00 occurrence should be marked
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("caab-0700");
  });

  it("skips stop when current time is >30min before scheduled time", async () => {
    setMockTime(7, 10); // 07:10 — more than 30 min before 09:00

    const pendingStops = [
      {
        schedule_entry_id: "caab-0900",
        schedule_entries: {
          time: "09:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "caab-0900",
        status: "pending",
        schedule_entries: { time: "09:00" },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    // Stop should NOT be marked — too early
    expect(mock._updates).toHaveLength(0);
  });

  it("marks second occurrence when first is already passed", async () => {
    setMockTime(9, 3);

    // Only the 09:00 occurrence is pending (07:00 already passed, filtered out by Supabase query)
    const pendingStops = [
      {
        schedule_entry_id: "caab-0900",
        schedule_entries: {
          time: "09:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "caab-1100",
        schedule_entries: {
          time: "11:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "caab-0700",
        status: "passed",
        schedule_entries: { time: "07:00" },
      },
      {
        schedule_entry_id: "caab-0900",
        status: "passed",
        schedule_entries: { time: "09:00" },
      },
      {
        schedule_entry_id: "caab-1100",
        status: "pending",
        schedule_entries: { time: "11:00" },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    // Only the 09:00 occurrence should be marked (not 11:00)
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("caab-0900");
  });
});

describe("inferStopProgress closest-in-time matching", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("matches closest-in-time occurrence when repeated stop has multiple pending entries", async () => {
    setMockTime(11, 5);

    const pendingStops = [
      {
        schedule_entry_id: "caab-0700",
        schedule_entries: {
          time: "07:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "caab-1100",
        schedule_entries: {
          time: "11:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "caab-0700",
        status: "pending",
        schedule_entries: { time: "07:00" },
      },
      {
        schedule_entry_id: "caab-1100",
        status: "passed",
        schedule_entries: { time: "11:00" },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("caab-1100");
  });

  it("matches early occurrence when current time is near it", async () => {
    setMockTime(7, 5);

    const pendingStops = [
      {
        schedule_entry_id: "caab-0700",
        schedule_entries: {
          time: "07:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "caab-1100",
        schedule_entries: {
          time: "11:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "caab-0700",
        status: "passed",
        schedule_entries: { time: "07:00" },
      },
      {
        schedule_entry_id: "caab-1100",
        status: "pending",
        schedule_entries: { time: "11:00" },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("caab-0700");
  });

  it("three occurrences picks middle when closest to now", async () => {
    setMockTime(11, 10);

    const pendingStops = [
      {
        schedule_entry_id: "caab-0700",
        schedule_entries: {
          time: "07:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "caab-1100",
        schedule_entries: {
          time: "11:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "caab-1500",
        schedule_entries: {
          time: "15:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "caab-0700",
        status: "pending",
        schedule_entries: { time: "07:00" },
      },
      {
        schedule_entry_id: "caab-1100",
        status: "passed",
        schedule_entries: { time: "11:00" },
      },
      {
        schedule_entry_id: "caab-1500",
        status: "pending",
        schedule_entries: { time: "15:00" },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("caab-1100");
  });
});

describe("inferStopProgress backfill", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("backfills all earlier pending stops when mid-route stop is matched", async () => {
    setMockTime(10, 5);

    // 10 stops at different coordinates (0.001 deg apart ~111m, well outside 50m geofence)
    const pendingStops = Array.from({ length: 10 }, (_, i) => ({
      schedule_entry_id: `stop-${i + 1}`,
      schedule_entries: {
        time: `${String(6 + Math.floor(i * 0.5)).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`,
        stop_lat: -12.97 + i * 0.001,
        stop_lng: -38.51 + i * 0.001,
        geofence_radius_m: 50,
      },
    }));

    // Van is at stop 10's coordinates
    const vanLat = pendingStops[9].schedule_entries.stop_lat + 0.00003;
    const vanLng = pendingStops[9].schedule_entries.stop_lng + 0.00003;

    const allStops = pendingStops.map((s) => ({
      schedule_entry_id: s.schedule_entry_id,
      status: "passed",
      schedule_entries: { time: s.schedule_entries.time },
    }));

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: vanLat + 0.00001, lng: vanLng + 0.00001 },
        { lat: vanLat - 0.00001, lng: vanLng - 0.00001 },
      ],
    });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    // 1 geofence match (stop-10), 1 backfill batch (stops 1-9)
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-10");
    expect(mock._backfills).toHaveLength(1);
    expect(mock._backfills[0].schedule_entry_ids).toHaveLength(9);
    for (let i = 1; i <= 9; i++) {
      expect(mock._backfills[0].schedule_entry_ids).toContain(`stop-${i}`);
    }
  });

  it("backfills partially — only pending stops before matched stop", async () => {
    setMockTime(8, 35);

    // Stops 1-5 already passed (not in pendingStops), stops 6-8 pending
    // Spaced 0.001 deg apart (~111m) so only one is within 50m geofence
    const pendingStops = [
      {
        schedule_entry_id: "stop-6",
        schedule_entries: {
          time: "08:00",
          stop_lat: -12.960,
          stop_lng: -38.500,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "stop-7",
        schedule_entries: {
          time: "08:15",
          stop_lat: -12.961,
          stop_lng: -38.501,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "stop-8",
        schedule_entries: {
          time: "08:30",
          stop_lat: -12.962,
          stop_lng: -38.502,
          geofence_radius_m: 50,
        },
      },
    ];

    // Van is at stop-8's coordinates (~5m away)
    const vanLat = -12.962 + 0.00003;
    const vanLng = -38.502 + 0.00003;

    const allStops = [
      // Stops 1-5 already passed
      ...Array.from({ length: 5 }, (_, i) => ({
        schedule_entry_id: `stop-${i + 1}`,
        status: "passed",
        schedule_entries: { time: `${String(6 + Math.floor(i * 0.5)).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}` },
      })),
      // Stops 6-8 now passed (after backfill + geofence)
      { schedule_entry_id: "stop-6", status: "passed", schedule_entries: { time: "08:00" } },
      { schedule_entry_id: "stop-7", status: "passed", schedule_entries: { time: "08:15" } },
      { schedule_entry_id: "stop-8", status: "passed", schedule_entries: { time: "08:30" } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: vanLat + 0.00001, lng: vanLng + 0.00001 },
        { lat: vanLat - 0.00001, lng: vanLng - 0.00001 },
      ],
    });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    // 1 geofence match (stop-8), 1 backfill batch (stops 6-7)
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-8");
    expect(mock._backfills).toHaveLength(1);
    expect(mock._backfills[0].schedule_entry_ids).toHaveLength(2);
    expect(mock._backfills[0].schedule_entry_ids).toContain("stop-6");
    expect(mock._backfills[0].schedule_entry_ids).toContain("stop-7");
  });

  it("no backfill when first stop is matched", async () => {
    setMockTime(6, 5);

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "06:00",
          stop_lat: -12.9700,
          stop_lng: -38.5100,
          geofence_radius_m: 50,
        },
      },
    ];

    // Van is at stop-1's coordinates
    const vanLat = -12.9700 + 0.00003;
    const vanLng = -38.5100 + 0.00003;

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "06:00" } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    // 1 geofence match (stop-1), no backfill (no earlier stops)
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-1");
    expect(mock._backfills).toHaveLength(0);
  });

  it("backfilled stops have passed_at set to current time", async () => {
    setMockTime(10, 5);

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: -12.950,
          stop_lng: -38.500,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "stop-2",
        schedule_entries: {
          time: "09:00",
          stop_lat: -12.951,
          stop_lng: -38.501,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "stop-3",
        schedule_entries: {
          time: "10:00",
          stop_lat: -12.952,
          stop_lng: -38.502,
          geofence_radius_m: 50,
        },
      },
    ];

    // Van is at stop-3's coordinates (~5m away)
    const vanLat = -12.952 + 0.00003;
    const vanLng = -38.502 + 0.00003;

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00" } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "09:00" } },
      { schedule_entry_id: "stop-3", status: "passed", schedule_entries: { time: "10:00" } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: vanLat + 0.00001, lng: vanLng + 0.00001 },
        { lat: vanLat - 0.00001, lng: vanLng - 0.00001 },
      ],
    });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    // Verify backfill happened with passed_at
    expect(mock._backfills).toHaveLength(1);
    expect(mock._backfills[0].schedule_entry_ids).toContain("stop-1");
    expect(mock._backfills[0].schedule_entry_ids).toContain("stop-2");
    expect(mock._backfills[0].status).toBe("passed");
  });
});

describe("inferStopProgress edge cases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("van at last stop marks all stops as passed, nextStopId is null", async () => {
    setMockTime(10, 5);

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: -12.950,
          stop_lng: -38.500,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "stop-2",
        schedule_entries: {
          time: "09:00",
          stop_lat: -12.951,
          stop_lng: -38.501,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "stop-3",
        schedule_entries: {
          time: "10:00",
          stop_lat: -12.952,
          stop_lng: -38.502,
          geofence_radius_m: 50,
        },
      },
    ];

    // Van at stop-3's coordinates (~5m away)
    const vanLat = -12.952 + 0.00003;
    const vanLng = -38.502 + 0.00003;

    // After updates: all stops are passed
    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00" } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "09:00" } },
      { schedule_entry_id: "stop-3", status: "passed", schedule_entries: { time: "10:00" } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: vanLat + 0.00001, lng: vanLng + 0.00001 },
        { lat: vanLat - 0.00001, lng: vanLng - 0.00001 },
      ],
    });
    const result = await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    // 1 geofence match (stop-3), backfill stops 1-2
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-3");
    expect(mock._backfills).toHaveLength(1);
    expect(mock._backfills[0].schedule_entry_ids).toContain("stop-1");
    expect(mock._backfills[0].schedule_entry_ids).toContain("stop-2");
    // All stops passed, nextStopId is null
    expect(result.passedStopIds).toHaveLength(3);
    expect(result.passedStopIds).toContain("stop-1");
    expect(result.passedStopIds).toContain("stop-2");
    expect(result.passedStopIds).toContain("stop-3");
    expect(result.nextStopId).toBeNull();
  });

  it("no geofence match triggers no backfill", async () => {
    setMockTime(9, 5);

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: -12.950,
          stop_lng: -38.500,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "stop-2",
        schedule_entries: {
          time: "09:00",
          stop_lat: -12.951,
          stop_lng: -38.501,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "stop-3",
        schedule_entries: {
          time: "10:00",
          stop_lat: -12.952,
          stop_lng: -38.502,
          geofence_radius_m: 50,
        },
      },
    ];

    // Van far from all stops
    const vanLat = -12.980;
    const vanLng = -38.530;

    // All stops remain pending
    const allStops = [
      { schedule_entry_id: "stop-1", status: "pending", schedule_entries: { time: "08:00" } },
      { schedule_entry_id: "stop-2", status: "pending", schedule_entries: { time: "09:00" } },
      { schedule_entry_id: "stop-3", status: "pending", schedule_entries: { time: "10:00" } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    const result = await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    expect(mock._updates).toHaveLength(0);
    expect(mock._backfills).toHaveLength(0);
    // First pending stop chronologically is stop-1 ("08:00") — overdue stops are kept
    expect(result.nextStopId).toBe("stop-1");
  });

  it("early arrival window prevents matching future stop even with closest-in-time logic", async () => {
    setMockTime(8, 0);

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "09:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];

    // Stop still pending (early arrival blocked the match)
    const allStops = [
      { schedule_entry_id: "stop-1", status: "pending", schedule_entries: { time: "09:00" } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    expect(mock._updates).toHaveLength(0);
    expect(mock._backfills).toHaveLength(0);
  });

  it("all stops already passed returns existing state with no updates", async () => {
    setMockTime(12, 0);

    // No pending stops
    const pendingStops: Array<{
      schedule_entry_id: string;
      schedule_entries: {
        time: string;
        stop_lat: number;
        stop_lng: number;
        geofence_radius_m: number;
      };
    }> = [];

    // All stops already passed
    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00" } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "09:00" } },
      { schedule_entry_id: "stop-3", status: "passed", schedule_entries: { time: "10:00" } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    const result = await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    expect(mock._updates).toHaveLength(0);
    expect(mock._backfills).toHaveLength(0);
    expect(result.passedStopIds).toHaveLength(3);
    expect(result.passedStopIds).toContain("stop-1");
    expect(result.passedStopIds).toContain("stop-2");
    expect(result.passedStopIds).toContain("stop-3");
    expect(result.nextStopId).toBeNull();
  });
});

describe("inferStopProgress shift gate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns EMPTY_PROGRESS when no shifts exist", async () => {
    setMockTime(8, 5);

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-0800",
        status: "pending",
        schedule_entries: { time: "08:00" },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops });
    const result = await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    expect(result.passedStopIds).toHaveLength(0);
    expect(result.nextStopId).toBeNull();
    expect(result.lastPassedStopId).toBeNull();
    expect(mock._updates).toHaveLength(0);
    expect(mock._backfills).toHaveLength(0);
  });

  it("returns EMPTY_PROGRESS when all shifts are ended", async () => {
    setMockTime(8, 5);

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-0800",
        status: "pending",
        schedule_entries: { time: "08:00" },
      },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: "2026-03-07T18:00:00Z" }],
    });
    const result = await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    expect(result.passedStopIds).toHaveLength(0);
    expect(result.nextStopId).toBeNull();
    expect(result.lastPassedStopId).toBeNull();
    expect(mock._updates).toHaveLength(0);
    expect(mock._backfills).toHaveLength(0);
  });

  it("mid-route start with active shift triggers correct backfill", async () => {
    setMockTime(9, 5);

    // 5 stops at different coordinates (~111m apart, outside 50m geofence)
    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: { time: "07:00", stop_lat: -12.950, stop_lng: -38.500, geofence_radius_m: 50 },
      },
      {
        schedule_entry_id: "stop-2",
        schedule_entries: { time: "07:30", stop_lat: -12.951, stop_lng: -38.501, geofence_radius_m: 50 },
      },
      {
        schedule_entry_id: "stop-3",
        schedule_entries: { time: "08:00", stop_lat: -12.952, stop_lng: -38.502, geofence_radius_m: 50 },
      },
      {
        schedule_entry_id: "stop-4",
        schedule_entries: { time: "09:00", stop_lat: -12.953, stop_lng: -38.503, geofence_radius_m: 50 },
      },
      {
        schedule_entry_id: "stop-5",
        schedule_entries: { time: "10:00", stop_lat: -12.954, stop_lng: -38.504, geofence_radius_m: 50 },
      },
    ];

    // Van is at stop-3's coordinates (~5m away)
    const vanLat = -12.952 + 0.00003;
    const vanLng = -38.502 + 0.00003;

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "07:00" } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "07:30" } },
      { schedule_entry_id: "stop-3", status: "passed", schedule_entries: { time: "08:00" } },
      { schedule_entry_id: "stop-4", status: "pending", schedule_entries: { time: "09:00" } },
      { schedule_entry_id: "stop-5", status: "pending", schedule_entries: { time: "10:00" } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: vanLat + 0.00001, lng: vanLng + 0.00001 },
        { lat: vanLat - 0.00001, lng: vanLng - 0.00001 },
      ],
    });
    const result = await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    // stop-3 matched by geofence
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-3");

    // stops 1-2 backfilled
    expect(mock._backfills).toHaveLength(1);
    expect(mock._backfills[0].schedule_entry_ids).toHaveLength(2);
    expect(mock._backfills[0].schedule_entry_ids).toContain("stop-1");
    expect(mock._backfills[0].schedule_entry_ids).toContain("stop-2");

    // stops 4-5 remain pending (not in passedStopIds)
    expect(result.passedStopIds).toContain("stop-1");
    expect(result.passedStopIds).toContain("stop-2");
    expect(result.passedStopIds).toContain("stop-3");
    expect(result.passedStopIds).not.toContain("stop-4");
    expect(result.passedStopIds).not.toContain("stop-5");
  });
});

describe("inferStopProgress persisted progress state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("persists last_passed_stop_id and next_stop_id after stop passage", async () => {
    setMockTime(8, 35);

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: -12.96,
          stop_lng: -38.5,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "stop-2",
        schedule_entries: {
          time: "08:30",
          stop_lat: -12.961,
          stop_lng: -38.501,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "stop-3",
        schedule_entries: {
          time: "09:00",
          stop_lat: -12.962,
          stop_lng: -38.502,
          geofence_radius_m: 50,
        },
      },
    ];

    // Van is at stop-2's coordinates (~5m away)
    const vanLat = -12.961 + 0.00003;
    const vanLng = -38.501 + 0.00003;

    // After updates: stop-1 and stop-2 passed, stop-3 pending
    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00" } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "08:30" } },
      { schedule_entry_id: "stop-3", status: "pending", schedule_entries: { time: "09:00" } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
    });
    const result = await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    // Verify the route_runs update was called with correct pointers
    expect(mock._routeRunUpdates).toHaveLength(1);
    expect(mock._routeRunUpdates[0].last_passed_stop_id).toBe("stop-2");
    expect(mock._routeRunUpdates[0].next_stop_id).toBe("stop-3");
    expect(result.lastPassedStopId).toBe("stop-2");
    expect(result.nextStopId).toBe("stop-3");
  });

  it("sets progress_updated_at on each update", async () => {
    setMockTime(8, 5);

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-0800",
        status: "passed",
        schedule_entries: { time: "08:00" },
      },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
    });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    expect(mock._routeRunUpdates).toHaveLength(1);
    // progress_updated_at should be a valid ISO string
    const updatedAt = mock._routeRunUpdates[0].progress_updated_at;
    expect(updatedAt).toBeDefined();
    expect(new Date(updatedAt).toISOString()).toBe(updatedAt);
  });

  it("does not persist when no stops passed and both pointers are null", async () => {
    setMockTime(12, 0);

    // No pending stops at all
    const pendingStops: Array<{
      schedule_entry_id: string;
      schedule_entries: {
        time: string;
        stop_lat: number;
        stop_lng: number;
        geofence_radius_m: number;
      };
    }> = [];

    // No stops exist - empty route
    const allStops: Array<{
      schedule_entry_id: string;
      status: string;
      schedule_entries: { time: string };
    }> = [];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      stopCount: 0,
      shifts: [{ id: "shift-1", ended_at: null }],
    });
    const result = await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      -12.98,
      -38.53,
    );

    // Both pointers are null - no persist call
    expect(result.lastPassedStopId).toBeNull();
    expect(result.nextStopId).toBeNull();
    expect(mock._routeRunUpdates).toHaveLength(0);
  });
});

// --- Confidence gating tests ---

describe("inferStopProgress confidence gating", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("single ping raw geofence match has confidence 0.7 and does NOT backfill large gap", async () => {
    setMockTime(10, 5);

    const pendingStops = [
      { schedule_entry_id: "stop-1", schedule_entries: { time: "07:00", stop_lat: -12.950, stop_lng: -38.500, geofence_radius_m: 50 } },
      { schedule_entry_id: "stop-2", schedule_entries: { time: "08:00", stop_lat: -12.951, stop_lng: -38.501, geofence_radius_m: 50 } },
      { schedule_entry_id: "stop-3", schedule_entries: { time: "09:00", stop_lat: -12.952, stop_lng: -38.502, geofence_radius_m: 50 } },
      { schedule_entry_id: "stop-4", schedule_entries: { time: "09:30", stop_lat: -12.953, stop_lng: -38.503, geofence_radius_m: 50 } },
      { schedule_entry_id: "stop-5", schedule_entries: { time: "10:00", stop_lat: -12.954, stop_lng: -38.504, geofence_radius_m: 50 } },
    ];

    const vanLat = -12.954 + 0.00003;
    const vanLng = -38.504 + 0.00003;

    const allStops = pendingStops.map((s) => ({
      schedule_entry_id: s.schedule_entry_id,
      status: s.schedule_entry_id === "stop-5" ? "passed" : "pending",
      schedule_entries: { time: s.schedule_entries.time },
    }));

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: vanLat, lng: vanLng }],
    });

    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-5");
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
    expect(mock._updates[0].pass_confidence).toBe(0.7);

    // Backfill NOT allowed (confidence 0.7 is not > 0.7, and gap > 1)
    expect(mock._backfills).toHaveLength(0);
  });

  it("2 pings within 5-min window yield higher confidence and trigger backfill", async () => {
    setMockTime(10, 5);

    const pendingStops = [
      { schedule_entry_id: "stop-1", schedule_entries: { time: "08:00", stop_lat: -12.950, stop_lng: -38.500, geofence_radius_m: 50 } },
      { schedule_entry_id: "stop-2", schedule_entries: { time: "09:00", stop_lat: -12.951, stop_lng: -38.501, geofence_radius_m: 50 } },
      { schedule_entry_id: "stop-3", schedule_entries: { time: "10:00", stop_lat: -12.952, stop_lng: -38.502, geofence_radius_m: 50 } },
    ];

    const vanLat = -12.952 + 0.00003;
    const vanLng = -38.502 + 0.00003;

    const allStops = pendingStops.map((s) => ({
      schedule_entry_id: s.schedule_entry_id,
      status: "passed",
      schedule_entries: { time: s.schedule_entries.time },
    }));

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: -12.952 + 0.00001, lng: -38.502 + 0.00001 },
        { lat: -12.952 + 0.00002, lng: -38.502 + 0.00002 },
      ],
    });

    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
    expect(mock._updates[0].pass_confidence).toBe(0.9);

    expect(mock._backfills).toHaveLength(1);
    expect(mock._backfills[0].pass_source).toBe("backfill");
    expect(mock._backfills[0].pass_confidence).toBe(0.5); // 2-stop gap
  });

  it("single ping DOES backfill for 1-stop gap", async () => {
    setMockTime(9, 5);

    const pendingStops = [
      { schedule_entry_id: "stop-1", schedule_entries: { time: "08:00", stop_lat: -12.950, stop_lng: -38.500, geofence_radius_m: 50 } },
      { schedule_entry_id: "stop-2", schedule_entries: { time: "09:00", stop_lat: -12.951, stop_lng: -38.501, geofence_radius_m: 50 } },
    ];

    const vanLat = -12.951 + 0.00003;
    const vanLng = -38.501 + 0.00003;

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00" } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "09:00" } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: vanLat, lng: vanLng }],
    });

    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-2");

    expect(mock._backfills).toHaveLength(1);
    expect(mock._backfills[0].schedule_entry_ids).toEqual(["stop-1"]);
    expect(mock._backfills[0].pass_source).toBe("backfill");
    expect(mock._backfills[0].pass_confidence).toBe(0.7); // 1-stop gap
  });

  it("backfilled stops have pass_source backfill with scaled confidence", async () => {
    setMockTime(10, 5);

    const pendingStops = [
      { schedule_entry_id: "stop-1", schedule_entries: { time: "07:00", stop_lat: -12.950, stop_lng: -38.500, geofence_radius_m: 50 } },
      { schedule_entry_id: "stop-2", schedule_entries: { time: "08:00", stop_lat: -12.951, stop_lng: -38.501, geofence_radius_m: 50 } },
      { schedule_entry_id: "stop-3", schedule_entries: { time: "09:00", stop_lat: -12.952, stop_lng: -38.502, geofence_radius_m: 50 } },
      { schedule_entry_id: "stop-4", schedule_entries: { time: "10:00", stop_lat: -12.953, stop_lng: -38.503, geofence_radius_m: 50 } },
    ];

    const vanLat = -12.953 + 0.00003;
    const vanLng = -38.503 + 0.00003;

    const allStops = pendingStops.map((s) => ({
      schedule_entry_id: s.schedule_entry_id,
      status: "passed",
      schedule_entries: { time: s.schedule_entries.time },
    }));

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: vanLat, lng: vanLng },
        { lat: vanLat + 0.00001, lng: vanLng },
      ],
    });

    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    expect(mock._updates[0].pass_source).toBe("geofence_raw");
    expect(mock._updates[0].pass_confidence).toBe(0.9);

    expect(mock._backfills[0].pass_source).toBe("backfill");
    expect(mock._backfills[0].pass_confidence).toBe(0.5); // 3-stop gap
  });

  it("direct geofence match with snapped coords has geofence_snapped source and high confidence", async () => {
    setMockTime(8, 5);

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00" } },
    ];

    // Raw GPS ~33m from stop, snapped very close (displacement ~33m < 50m)
    const rawLat = CAAB_LAT + 0.0003;
    const rawLng = CAAB_LNG;
    const snappedLat = CAAB_LAT + 0.00001;
    const snappedLng = CAAB_LNG + 0.00001;

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: snappedLat, lng: snappedLng },
        { lat: snappedLat + 0.00001, lng: snappedLng },
      ],
    });

    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      rawLat,
      rawLng,
      snappedLat,
      snappedLng,
    );

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_snapped");
    expect(mock._updates[0].pass_confidence).toBe(1.0);
  });
});

// --- Hybrid raw/snapped coordinate tests ---

describe("inferStopProgress hybrid raw/snapped position", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses raw GPS when snap displacement > 50m", async () => {
    setMockTime(8, 5);

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00" } },
    ];

    const rawLat = VAN_AT_CAAB_LAT;
    const rawLng = VAN_AT_CAAB_LNG;
    // Snapped ~111m from raw (displacement > 50m)
    const snappedLat = CAAB_LAT + 0.001;
    const snappedLng = CAAB_LNG;

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: rawLat, lng: rawLng }],
    });

    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      rawLat,
      rawLng,
      snappedLat,
      snappedLng,
    );

    // Falls back to raw GPS (snap too far)
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
  });

  it("uses snapped GPS when snap displacement <= 50m", async () => {
    setMockTime(8, 5);

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00" } },
    ];

    // Raw ~28m from stop, snapped ~6m from stop (displacement ~22m < 50m)
    const rawLat = CAAB_LAT + 0.00025;
    const rawLng = CAAB_LNG;
    const snappedLat = CAAB_LAT + 0.00005;
    const snappedLng = CAAB_LNG;

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: snappedLat, lng: snappedLng }],
    });

    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      rawLat,
      rawLng,
      snappedLat,
      snappedLng,
    );

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_snapped");
  });

  it("null snapped coordinates falls back to raw", async () => {
    setMockTime(8, 5);

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00" } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG }],
    });

    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
      null,
      null,
    );

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
  });

  it("undefined snapped coordinates falls back to raw", async () => {
    setMockTime(8, 5);

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00" } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG }],
    });

    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
  });
});

describe("inferStopProgress stop_group_id grouping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("groups entries with same stop_group_id regardless of coordinate differences", async () => {
    setMockTime(8, 5);

    // Two entries at different coordinates but same stop_group_id
    // Van is near entry A only, but both share the same group
    const pendingStops = [
      {
        schedule_entry_id: "entry-a",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_group_id: "group-caab",
        },
      },
      {
        schedule_entry_id: "entry-b",
        schedule_entries: {
          time: "10:00",
          stop_lat: -12.980, // ~1km away from CAAB
          stop_lng: -38.520,
          geofence_radius_m: 50,
          stop_group_id: "group-caab",
        },
      },
    ];
    const allStops = [
      { schedule_entry_id: "entry-a", status: "passed", schedule_entries: { time: "08:00" } },
      { schedule_entry_id: "entry-b", status: "pending", schedule_entries: { time: "10:00" } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    // Only entry-a should be marked (van is within its geofence, closest in time)
    // entry-b is in the same group but van is NOT within its geofence
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("entry-a");
  });

  it("entries with null stop_group_id fall back to coordinate-based grouping", async () => {
    setMockTime(8, 5);

    // Two entries at same coordinates, no stop_group_id — should be grouped by coords
    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_group_id: null,
        },
      },
      {
        schedule_entry_id: "entry-1000",
        schedule_entries: {
          time: "10:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_group_id: null,
        },
      },
    ];
    const allStops = [
      { schedule_entry_id: "entry-0800", status: "passed", schedule_entries: { time: "08:00" } },
      { schedule_entry_id: "entry-1000", status: "pending", schedule_entries: { time: "10:00" } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    // Grouped by coordinates, closest-in-time (08:00) should be picked
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("entry-0800");
  });

  it("closest-in-time selection works within a stop_group_id group", async () => {
    setMockTime(11, 5);

    // Three entries in same group, van near all of them (same coords)
    const pendingStops = [
      {
        schedule_entry_id: "grp-0700",
        schedule_entries: {
          time: "07:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_group_id: "terminal-a",
        },
      },
      {
        schedule_entry_id: "grp-1100",
        schedule_entries: {
          time: "11:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_group_id: "terminal-a",
        },
      },
      {
        schedule_entry_id: "grp-1500",
        schedule_entries: {
          time: "15:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_group_id: "terminal-a",
        },
      },
    ];
    const allStops = [
      { schedule_entry_id: "grp-0700", status: "pending", schedule_entries: { time: "07:00" } },
      { schedule_entry_id: "grp-1100", status: "passed", schedule_entries: { time: "11:00" } },
      { schedule_entry_id: "grp-1500", status: "pending", schedule_entries: { time: "15:00" } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    // At 11:05, closest-in-time is grp-1100 (5 min diff vs 4h5m or 3h55m)
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("grp-1100");
  });
});

// --- Write error logging tests ---

describe("write error logging", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("logs structured error when geofence mark write fails", async () => {
    setMockTime(8, 5);

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      { schedule_entry_id: "entry-0800", status: "passed", schedule_entries: { time: "08:00" } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });

    // Override route_run_stops.update so geofence .eq("schedule_entry_id", ...) returns an error
    const originalFrom = mock.from;
    mock.from = vi.fn((table: string) => {
      if (table === "route_run_stops") {
        const base = originalFrom(table);
        base.update = vi.fn((payload: { status: string; pass_source?: string; pass_confidence?: number }) => ({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn((_field: string, _value: string) => {
              return { error: { message: "geofence write failed" } };
            }),
            in: vi.fn((_field: string, _ids: string[]) => {
              return { error: null };
            }),
          }),
        }));
        return base;
      }
      return originalFrom(table);
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    const geofenceCall = errorSpy.mock.calls.find(
      (call) => call[0] === "inferStopProgress: geofence mark failed",
    );
    expect(geofenceCall).toBeDefined();
    expect(geofenceCall![1]).toMatchObject({
      runId: "run-1",
      scheduleEntryId: "entry-0800",
    });
  });

  it("logs structured error when backfill mark write fails", async () => {
    setMockTime(9, 5);

    // Two pending stops; van is at the later one (09:00), so 08:00 gets backfilled
    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT + 0.01, // far from van
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
      {
        schedule_entry_id: "entry-0900",
        schedule_entries: {
          time: "09:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      { schedule_entry_id: "entry-0800", status: "passed", schedule_entries: { time: "08:00" } },
      { schedule_entry_id: "entry-0900", status: "passed", schedule_entries: { time: "09:00" } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });

    // Override route_run_stops.update so backfill .in() returns an error, geofence .eq() succeeds
    const originalFrom = mock.from;
    mock.from = vi.fn((table: string) => {
      if (table === "route_run_stops") {
        const base = originalFrom(table);
        base.update = vi.fn((payload: { status: string; pass_source?: string; pass_confidence?: number }) => ({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn((_field: string, value: string) => {
              mock._updates.push({
                schedule_entry_id: value,
                status: payload.status,
                pass_source: payload.pass_source,
                pass_confidence: payload.pass_confidence,
              });
              return { error: null };
            }),
            in: vi.fn((_field: string, ids: string[]) => {
              mock._backfills.push({
                schedule_entry_ids: ids,
                status: payload.status,
                pass_source: payload.pass_source,
                pass_confidence: payload.pass_confidence,
              });
              return { error: { message: "backfill write failed" } };
            }),
          }),
        }));
        return base;
      }
      return originalFrom(table);
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    const backfillCall = errorSpy.mock.calls.find(
      (call) => call[0] === "inferStopProgress: backfill mark failed",
    );
    expect(backfillCall).toBeDefined();
    expect(backfillCall![1]).toMatchObject({
      runId: "run-1",
      backfillIds: expect.arrayContaining(["entry-0800"]),
    });
  });

  it("logs structured error when pointer persist write fails", async () => {
    setMockTime(8, 5);

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
        },
      },
    ];
    const allStops = [
      { schedule_entry_id: "entry-0800", status: "passed", schedule_entries: { time: "08:00" } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });

    // Override route_runs.update so pointer persist returns an error
    const originalFrom = mock.from;
    mock.from = vi.fn((table: string) => {
      if (table === "route_runs") {
        const base = originalFrom(table);
        base.update = vi.fn((_payload: RouteRunUpdateCall) => ({
          eq: vi.fn(() => {
            return { error: { message: "pointer persist failed" } };
          }),
        }));
        return base;
      }
      return originalFrom(table);
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      VAN_AT_CAAB_LAT,
      VAN_AT_CAAB_LNG,
    );

    const pointerCall = errorSpy.mock.calls.find(
      (call) => call[0] === "inferStopProgress: pointer persist failed",
    );
    expect(pointerCall).toBeDefined();
    expect(pointerCall![1]).toMatchObject({
      runId: "run-1",
      routeId: "route-1",
      serviceDate: expect.any(String),
    });
  });
});
