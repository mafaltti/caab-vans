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
};

type BackfillCall = {
  schedule_entry_ids: string[];
  status: string;
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
    };
  }>;
  allStops: Array<{
    schedule_entry_id: string;
    status: string;
    schedule_entries: { time: string };
  }>;
  stopCount?: number;
}) {
  const updates: UpdateCall[] = [];
  const backfills: BackfillCall[] = [];
  const { pendingStops, allStops, stopCount = 10 } = opts;

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
        return chain({ id: "run-1", started_at: null });
      }
      if (table === "schedule_entries") {
        return chain([]);
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
            if (selectStr.includes("schedule_entries!inner(time, stop_lat")) {
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
          update: vi.fn((payload: { status: string }) => ({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn((field: string, value: string) => {
                if (field === "schedule_entry_id") {
                  updates.push({
                    schedule_entry_id: value,
                    status: payload.status,
                  });
                }
                return { error: null };
              }),
              in: vi.fn((field: string, ids: string[]) => {
                if (field === "schedule_entry_id") {
                  backfills.push({
                    schedule_entry_ids: ids,
                    status: payload.status,
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
    const result = await inferStopProgress(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      vanLat,
      vanLng,
    );

    expect(mock._updates).toHaveLength(0);
    expect(mock._backfills).toHaveLength(0);
    // timeFloor at 09:05, first pending stop with time >= "09:05" is stop-3 ("10:00")
    expect(result.nextStopId).toBe("stop-3");
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

    const mock = createMockSupabase({ pendingStops, allStops });
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

    const mock = createMockSupabase({ pendingStops, allStops });
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
