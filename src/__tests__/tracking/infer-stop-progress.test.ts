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
  return {
    ...actual,
    nowBahia: vi.fn(() => actual.nowBahia()),
    todayBahiaDate: vi.fn(() => actual.todayBahiaDate()),
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
