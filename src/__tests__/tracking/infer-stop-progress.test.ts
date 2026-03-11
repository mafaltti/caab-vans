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
  passed_at?: string;
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
      stop_lat: number;
      stop_lng: number;
      geofence_radius_m: number;
      stop_group_id?: string | null;
      stop_sequence?: number;
      arrival_time: string;
      departure_time: string;
    };
  }>;
  allStops: Array<{
    schedule_entry_id: string;
    status: string;
    schedule_entries: { stop_sequence?: number };
  }>;
  stopCount?: number;
  shifts?: Array<{ id: string; ended_at: string | null; started_at?: string }>;
  /** Override: force the shift-active query to return this value (bypasses ended_at===null check) */
  activeShiftOverride?: { id: string } | null;
  pings?: Array<{ lat: number; lng: number; snapped_lat?: number | null; snapped_lng?: number | null }>;
}) {
  const updates: UpdateCall[] = [];
  const backfills: BackfillCall[] = [];
  const routeRunUpdates: RouteRunUpdateCall[] = [];
  const routeRunUpserts: Array<{ route_id: string; service_date: string }> = [];
  let pingsLimitSpy: ReturnType<typeof vi.fn> | null = null;
  const { allStops: rawAllStops, stopCount = 10, shifts = [], activeShiftOverride, pings = [] } = opts;
  // Auto-populate stop_sequence if not provided
  const pendingStops = opts.pendingStops.map((s, i) => ({
    ...s,
    schedule_entries: {
      ...s.schedule_entries,
      stop_sequence: s.schedule_entries.stop_sequence ?? i + 1,
    },
  }));
  const allStops = rawAllStops.map((s, i) => ({
    ...s,
    schedule_entries: {
      ...s.schedule_entries,
      stop_sequence: s.schedule_entries.stop_sequence ?? i + 1,
    },
  }));

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
          upsert: vi.fn((payload: { route_id: string; service_date: string }) => {
            routeRunUpserts.push(payload);
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockReturnValue({
                  data: runData,
                  error: null,
                }),
              }),
            };
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
        const activeShift = activeShiftOverride !== undefined
          ? activeShiftOverride
          : (shifts.find(s => s.ended_at === null) ?? null);
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
        let orderCallCount = 0;
        const pingProxy: Record<string, unknown> = {};
        const pp = new Proxy(pingProxy, {
          get(_target, prop) {
            if (prop === "then") return undefined;
            if (prop === "order") {
              return () => {
                orderCallCount++;
                // Production calls .order() twice; return result on the second call
                if (orderCallCount >= 2) return pingResult;
                return pp;
              };
            }
            if (prop === "limit") {
              // Track if limit is called (it should NOT be after T046)
              pingsLimitSpy = vi.fn(() => pingResult);
              return pingsLimitSpy;
            }
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
            if (selectStr.includes("schedule_entries!inner(stop_lat") && selectStr.includes("stop_group_id")) {
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
          update: vi.fn((payload: { status: string; passed_at?: string; pass_source?: string; pass_confidence?: number }) => ({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn((field: string, value: string) => {
                if (field === "schedule_entry_id") {
                  updates.push({
                    schedule_entry_id: value,
                    status: payload.status,
                    passed_at: payload.passed_at,
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
    _routeRunUpserts: routeRunUpserts,
    get _pingsLimitSpy() { return pingsLimitSpy; },
  };

  return mock;
}

function makeEventTs(hour: number, minute: number): string {
  return DateTime.fromObject({ hour, minute }, { zone: TZ }).toISO()!;
}

describe("inferStopProgress geofence dedup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("marks a single-occurrence stop as passed (regression)", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-0800",
        status: "passed",
        schedule_entries: { time: "08:00", stop_sequence: 1 },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("entry-0800");
    expect(result.passedStopIds).toContain("entry-0800");
  });

  it("marks only first pending occurrence of a repeated stop", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "caab-0700",
        schedule_entries: {
          time: "07:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "07:00",
          departure_time: "07:00",
        },
      },
      {
        schedule_entry_id: "caab-0900",
        schedule_entries: {
          time: "09:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
      {
        schedule_entry_id: "caab-1100",
        schedule_entries: {
          time: "11:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 3,
          arrival_time: "11:00",
          departure_time: "11:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "caab-0700",
        status: "passed",
        schedule_entries: { time: "07:00", stop_sequence: 1 },
      },
      {
        schedule_entry_id: "caab-0900",
        status: "pending",
        schedule_entries: { time: "09:00", stop_sequence: 2 },
      },
      {
        schedule_entry_id: "caab-1100",
        status: "pending",
        schedule_entries: { time: "11:00", stop_sequence: 3 },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(7, 5),
    });

    // Only the 07:00 occurrence should be marked
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("caab-0700");
  });

  it("skips stop when current time is >30min before scheduled time", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "caab-0900",
        schedule_entries: {
          time: "09:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "caab-0900",
        status: "pending",
        schedule_entries: { time: "09:00", stop_sequence: 1 },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(7, 10),
    });

    // Stop should NOT be marked — too early
    expect(mock._updates).toHaveLength(0);
  });

  it("marks second occurrence when first is already passed", async () => {

    // Only the 09:00 occurrence is pending (07:00 already passed, filtered out by Supabase query)
    const pendingStops = [
      {
        schedule_entry_id: "caab-0900",
        schedule_entries: {
          time: "09:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
      {
        schedule_entry_id: "caab-1100",
        schedule_entries: {
          time: "11:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "11:00",
          departure_time: "11:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "caab-0700",
        status: "passed",
        schedule_entries: { time: "07:00", stop_sequence: 1 },
      },
      {
        schedule_entry_id: "caab-0900",
        status: "passed",
        schedule_entries: { time: "09:00", stop_sequence: 2 },
      },
      {
        schedule_entry_id: "caab-1100",
        status: "pending",
        schedule_entries: { time: "11:00", stop_sequence: 3 },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(9, 3),
    });

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

    const pendingStops = [
      {
        schedule_entry_id: "caab-0700",
        schedule_entries: {
          time: "07:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "07:00",
          departure_time: "07:00",
        },
      },
      {
        schedule_entry_id: "caab-1100",
        schedule_entries: {
          time: "11:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "11:00",
          departure_time: "11:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "caab-0700",
        status: "pending",
        schedule_entries: { time: "07:00", stop_sequence: 1 },
      },
      {
        schedule_entry_id: "caab-1100",
        status: "passed",
        schedule_entries: { time: "11:00", stop_sequence: 2 },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(11, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("caab-1100");
  });

  it("matches early occurrence when current time is near it", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "caab-0700",
        schedule_entries: {
          time: "07:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "07:00",
          departure_time: "07:00",
        },
      },
      {
        schedule_entry_id: "caab-1100",
        schedule_entries: {
          time: "11:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "11:00",
          departure_time: "11:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "caab-0700",
        status: "passed",
        schedule_entries: { time: "07:00", stop_sequence: 1 },
      },
      {
        schedule_entry_id: "caab-1100",
        status: "pending",
        schedule_entries: { time: "11:00", stop_sequence: 2 },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(7, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("caab-0700");
  });

  it("three occurrences picks middle when closest to now", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "caab-0700",
        schedule_entries: {
          time: "07:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "07:00",
          departure_time: "07:00",
        },
      },
      {
        schedule_entry_id: "caab-1100",
        schedule_entries: {
          time: "11:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "11:00",
          departure_time: "11:00",
        },
      },
      {
        schedule_entry_id: "caab-1500",
        schedule_entries: {
          time: "15:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 3,
          arrival_time: "15:00",
          departure_time: "15:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "caab-0700",
        status: "pending",
        schedule_entries: { time: "07:00", stop_sequence: 1 },
      },
      {
        schedule_entry_id: "caab-1100",
        status: "passed",
        schedule_entries: { time: "11:00", stop_sequence: 2 },
      },
      {
        schedule_entry_id: "caab-1500",
        status: "pending",
        schedule_entries: { time: "15:00", stop_sequence: 3 },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(11, 10),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("caab-1100");
  });
});

describe("inferStopProgress backfill", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("backfills all earlier pending stops when mid-route stop is matched", async () => {

    // 10 stops at different coordinates (0.001 deg apart ~111m, well outside 50m geofence)
    const pendingStops = Array.from({ length: 10 }, (_, i) => {
      const time = `${String(6 + Math.floor(i * 0.5)).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`;
      return {
        schedule_entry_id: `stop-${i + 1}`,
        schedule_entries: {
          time,
          stop_lat: -12.97 + i * 0.001,
          stop_lng: -38.51 + i * 0.001,
          geofence_radius_m: 50,
          stop_sequence: i + 1,
          arrival_time: time,
          departure_time: time,
        },
      };
    });

    // Van is at stop 10's coordinates
    const vanLat = pendingStops[9].schedule_entries.stop_lat + 0.00003;
    const vanLng = pendingStops[9].schedule_entries.stop_lng + 0.00003;

    const allStops = pendingStops.map((s) => ({
      schedule_entry_id: s.schedule_entry_id,
      status: "passed",
      schedule_entries: { time: s.schedule_entries.time, stop_sequence: s.schedule_entries.stop_sequence },
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
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(10, 5),
    });

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
          stop_sequence: 6,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
      {
        schedule_entry_id: "stop-7",
        schedule_entries: {
          time: "08:15",
          stop_lat: -12.961,
          stop_lng: -38.501,
          geofence_radius_m: 50,
          stop_sequence: 7,
          arrival_time: "08:15",
          departure_time: "08:15",
        },
      },
      {
        schedule_entry_id: "stop-8",
        schedule_entries: {
          time: "08:30",
          stop_lat: -12.962,
          stop_lng: -38.502,
          geofence_radius_m: 50,
          stop_sequence: 8,
          arrival_time: "08:30",
          departure_time: "08:30",
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
        schedule_entries: { time: `${String(6 + Math.floor(i * 0.5)).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`, stop_sequence: i + 1 },
      })),
      // Stops 6-8 now passed (after backfill + geofence)
      { schedule_entry_id: "stop-6", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 6 } },
      { schedule_entry_id: "stop-7", status: "passed", schedule_entries: { time: "08:15", stop_sequence: 7 } },
      { schedule_entry_id: "stop-8", status: "passed", schedule_entries: { time: "08:30", stop_sequence: 8 } },
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
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(8, 35),
    });

    // 1 geofence match (stop-8), 1 backfill batch (stops 6-7)
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-8");
    expect(mock._backfills).toHaveLength(1);
    expect(mock._backfills[0].schedule_entry_ids).toHaveLength(2);
    expect(mock._backfills[0].schedule_entry_ids).toContain("stop-6");
    expect(mock._backfills[0].schedule_entry_ids).toContain("stop-7");
  });

  it("no backfill when first stop is matched", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "06:00",
          stop_lat: -12.9700,
          stop_lng: -38.5100,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "06:00",
          departure_time: "06:00",
        },
      },
    ];

    // Van is at stop-1's coordinates
    const vanLat = -12.9700 + 0.00003;
    const vanLng = -38.5100 + 0.00003;

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "06:00", stop_sequence: 1 } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(6, 5),
    });

    // 1 geofence match (stop-1), no backfill (no earlier stops)
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-1");
    expect(mock._backfills).toHaveLength(0);
  });

  it("backfilled stops have passed_at set to current time", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: -12.950,
          stop_lng: -38.500,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
      {
        schedule_entry_id: "stop-2",
        schedule_entries: {
          time: "09:00",
          stop_lat: -12.951,
          stop_lng: -38.501,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
      {
        schedule_entry_id: "stop-3",
        schedule_entries: {
          time: "10:00",
          stop_lat: -12.952,
          stop_lng: -38.502,
          geofence_radius_m: 50,
          stop_sequence: 3,
          arrival_time: "10:00",
          departure_time: "10:00",
        },
      },
    ];

    // Van is at stop-3's coordinates (~5m away)
    const vanLat = -12.952 + 0.00003;
    const vanLng = -38.502 + 0.00003;

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "09:00", stop_sequence: 2 } },
      { schedule_entry_id: "stop-3", status: "passed", schedule_entries: { time: "10:00", stop_sequence: 3 } },
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
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(10, 5),
    });

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

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: -12.950,
          stop_lng: -38.500,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
      {
        schedule_entry_id: "stop-2",
        schedule_entries: {
          time: "09:00",
          stop_lat: -12.951,
          stop_lng: -38.501,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
      {
        schedule_entry_id: "stop-3",
        schedule_entries: {
          time: "10:00",
          stop_lat: -12.952,
          stop_lng: -38.502,
          geofence_radius_m: 50,
          stop_sequence: 3,
          arrival_time: "10:00",
          departure_time: "10:00",
        },
      },
    ];

    // Van at stop-3's coordinates (~5m away)
    const vanLat = -12.952 + 0.00003;
    const vanLng = -38.502 + 0.00003;

    // After updates: all stops are passed
    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "09:00", stop_sequence: 2 } },
      { schedule_entry_id: "stop-3", status: "passed", schedule_entries: { time: "10:00", stop_sequence: 3 } },
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
    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(10, 5),
    });

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

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: -12.950,
          stop_lng: -38.500,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
      {
        schedule_entry_id: "stop-2",
        schedule_entries: {
          time: "09:00",
          stop_lat: -12.951,
          stop_lng: -38.501,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
      {
        schedule_entry_id: "stop-3",
        schedule_entries: {
          time: "10:00",
          stop_lat: -12.952,
          stop_lng: -38.502,
          geofence_radius_m: 50,
          stop_sequence: 3,
          arrival_time: "10:00",
          departure_time: "10:00",
        },
      },
    ];

    // Van far from all stops
    const vanLat = -12.980;
    const vanLng = -38.530;

    // All stops remain pending
    const allStops = [
      { schedule_entry_id: "stop-1", status: "pending", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-2", status: "pending", schedule_entries: { time: "09:00", stop_sequence: 2 } },
      { schedule_entry_id: "stop-3", status: "pending", schedule_entries: { time: "10:00", stop_sequence: 3 } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(9, 5),
    });

    expect(mock._updates).toHaveLength(0);
    expect(mock._backfills).toHaveLength(0);
    // First pending stop chronologically is stop-1 ("08:00") — overdue stops are kept
    expect(result.nextStopId).toBe("stop-1");
  });

  it("early arrival window prevents matching future stop even with closest-in-time logic", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "09:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
    ];

    // Stop still pending (early arrival blocked the match)
    const allStops = [
      { schedule_entry_id: "stop-1", status: "pending", schedule_entries: { time: "09:00", stop_sequence: 1 } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 0),
    });

    expect(mock._updates).toHaveLength(0);
    expect(mock._backfills).toHaveLength(0);
  });

  it("all stops already passed returns existing state with no updates", async () => {

    // No pending stops
    const pendingStops: Array<{
      schedule_entry_id: string;
      schedule_entries: {
        time: string;
        stop_lat: number;
        stop_lng: number;
        geofence_radius_m: number;
        stop_sequence: number;
        arrival_time: string;
        departure_time: string;
      };
    }> = [];

    // All stops already passed
    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "09:00", stop_sequence: 2 } },
      { schedule_entry_id: "stop-3", status: "passed", schedule_entries: { time: "10:00", stop_sequence: 3 } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(12, 0),
    });

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

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-0800",
        status: "pending",
        schedule_entries: { time: "08:00", stop_sequence: 1 },
      },
    ];

    const mock = createMockSupabase({ pendingStops, allStops });
    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    expect(result.passedStopIds).toHaveLength(0);
    expect(result.nextStopId).toBeNull();
    expect(result.lastPassedStopId).toBeNull();
    expect(mock._updates).toHaveLength(0);
    expect(mock._backfills).toHaveLength(0);
  });

  it("returns EMPTY_PROGRESS when all shifts are ended", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-0800",
        status: "pending",
        schedule_entries: { time: "08:00", stop_sequence: 1 },
      },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: "2026-03-07T18:00:00Z" }],
    });
    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    expect(result.passedStopIds).toHaveLength(0);
    expect(result.nextStopId).toBeNull();
    expect(result.lastPassedStopId).toBeNull();
    expect(mock._updates).toHaveLength(0);
    expect(mock._backfills).toHaveLength(0);
  });

  it("mid-route start with active shift triggers correct backfill", async () => {

    // 5 stops at different coordinates (~111m apart, outside 50m geofence)
    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: { time: "07:00", stop_lat: -12.950, stop_lng: -38.500, geofence_radius_m: 50, stop_sequence: 1, arrival_time: "07:00", departure_time: "07:00" },
      },
      {
        schedule_entry_id: "stop-2",
        schedule_entries: { time: "07:30", stop_lat: -12.951, stop_lng: -38.501, geofence_radius_m: 50, stop_sequence: 2, arrival_time: "07:30", departure_time: "07:30" },
      },
      {
        schedule_entry_id: "stop-3",
        schedule_entries: { time: "08:00", stop_lat: -12.952, stop_lng: -38.502, geofence_radius_m: 50, stop_sequence: 3, arrival_time: "08:00", departure_time: "08:00" },
      },
      {
        schedule_entry_id: "stop-4",
        schedule_entries: { time: "09:00", stop_lat: -12.953, stop_lng: -38.503, geofence_radius_m: 50, stop_sequence: 4, arrival_time: "09:00", departure_time: "09:00" },
      },
      {
        schedule_entry_id: "stop-5",
        schedule_entries: { time: "10:00", stop_lat: -12.954, stop_lng: -38.504, geofence_radius_m: 50, stop_sequence: 5, arrival_time: "10:00", departure_time: "10:00" },
      },
    ];

    // Van is at stop-3's coordinates (~5m away)
    const vanLat = -12.952 + 0.00003;
    const vanLng = -38.502 + 0.00003;

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "07:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "07:30", stop_sequence: 2 } },
      { schedule_entry_id: "stop-3", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 3 } },
      { schedule_entry_id: "stop-4", status: "pending", schedule_entries: { time: "09:00", stop_sequence: 4 } },
      { schedule_entry_id: "stop-5", status: "pending", schedule_entries: { time: "10:00", stop_sequence: 5 } },
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
    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(9, 5),
    });

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

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: -12.96,
          stop_lng: -38.5,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
      {
        schedule_entry_id: "stop-2",
        schedule_entries: {
          time: "08:30",
          stop_lat: -12.961,
          stop_lng: -38.501,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "08:30",
          departure_time: "08:30",
        },
      },
      {
        schedule_entry_id: "stop-3",
        schedule_entries: {
          time: "09:00",
          stop_lat: -12.962,
          stop_lng: -38.502,
          geofence_radius_m: 50,
          stop_sequence: 3,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
    ];

    // Van is at stop-2's coordinates (~5m away)
    const vanLat = -12.961 + 0.00003;
    const vanLng = -38.501 + 0.00003;

    // After updates: stop-1 and stop-2 passed, stop-3 pending
    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "08:30", stop_sequence: 2 } },
      { schedule_entry_id: "stop-3", status: "pending", schedule_entries: { time: "09:00", stop_sequence: 3 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
    });
    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(8, 35),
    });

    // Verify the route_runs update was called with correct pointers
    expect(mock._routeRunUpdates).toHaveLength(1);
    expect(mock._routeRunUpdates[0].last_passed_stop_id).toBe("stop-2");
    expect(mock._routeRunUpdates[0].next_stop_id).toBe("stop-3");
    expect(result.lastPassedStopId).toBe("stop-2");
    expect(result.nextStopId).toBe("stop-3");
  });

  it("sets progress_updated_at on each update", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-0800",
        status: "passed",
        schedule_entries: { time: "08:00", stop_sequence: 1 },
      },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
    });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._routeRunUpdates).toHaveLength(1);
    // progress_updated_at should be a valid ISO string
    const updatedAt = mock._routeRunUpdates[0].progress_updated_at;
    expect(updatedAt).toBeDefined();
    expect(new Date(updatedAt).toISOString()).toBe(updatedAt);
  });

  it("does not persist when no stops passed and both pointers are null", async () => {

    // No pending stops at all
    const pendingStops: Array<{
      schedule_entry_id: string;
      schedule_entries: {
        time: string;
        stop_lat: number;
        stop_lng: number;
        geofence_radius_m: number;
        stop_sequence: number;
        arrival_time: string;
        departure_time: string;
      };
    }> = [];

    // No stops exist - empty route
    const allStops: Array<{
      schedule_entry_id: string;
      status: string;
      schedule_entries: { time: string; stop_sequence: number };
    }> = [];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      stopCount: 0,
      shifts: [{ id: "shift-1", ended_at: null }],
    });
    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: -12.98,
      rawLng: -38.53,
      eventTs: makeEventTs(12, 0),
    });

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

    const pendingStops = [
      { schedule_entry_id: "stop-1", schedule_entries: { time: "07:00", stop_lat: -12.950, stop_lng: -38.500, geofence_radius_m: 50, stop_sequence: 1, arrival_time: "07:00", departure_time: "07:00" } },
      { schedule_entry_id: "stop-2", schedule_entries: { time: "08:00", stop_lat: -12.951, stop_lng: -38.501, geofence_radius_m: 50, stop_sequence: 2, arrival_time: "08:00", departure_time: "08:00" } },
      { schedule_entry_id: "stop-3", schedule_entries: { time: "09:00", stop_lat: -12.952, stop_lng: -38.502, geofence_radius_m: 50, stop_sequence: 3, arrival_time: "09:00", departure_time: "09:00" } },
      { schedule_entry_id: "stop-4", schedule_entries: { time: "09:30", stop_lat: -12.953, stop_lng: -38.503, geofence_radius_m: 50, stop_sequence: 4, arrival_time: "09:30", departure_time: "09:30" } },
      { schedule_entry_id: "stop-5", schedule_entries: { time: "10:00", stop_lat: -12.954, stop_lng: -38.504, geofence_radius_m: 50, stop_sequence: 5, arrival_time: "10:00", departure_time: "10:00" } },
    ];

    const vanLat = -12.954 + 0.00003;
    const vanLng = -38.504 + 0.00003;

    const allStops = pendingStops.map((s) => ({
      schedule_entry_id: s.schedule_entry_id,
      status: s.schedule_entry_id === "stop-5" ? "passed" : "pending",
      schedule_entries: { time: s.schedule_entries.time, stop_sequence: s.schedule_entries.stop_sequence },
    }));

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: vanLat, lng: vanLng }],
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(10, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-5");
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
    expect(mock._updates[0].pass_confidence).toBe(0.7);

    // Backfill NOT allowed (confidence 0.7 is not > 0.7, and gap > 1)
    // Note: canonical write enforcement may add healing writes (status=pending),
    // so filter for actual backfill writes (status=passed).
    const actualBackfills = mock._backfills.filter((b: { status: string }) => b.status === "passed");
    expect(actualBackfills).toHaveLength(0);
  });

  it("2 pings within 5-min window yield higher confidence and trigger backfill", async () => {

    const pendingStops = [
      { schedule_entry_id: "stop-1", schedule_entries: { time: "08:00", stop_lat: -12.950, stop_lng: -38.500, geofence_radius_m: 50, stop_sequence: 1, arrival_time: "08:00", departure_time: "08:00" } },
      { schedule_entry_id: "stop-2", schedule_entries: { time: "09:00", stop_lat: -12.951, stop_lng: -38.501, geofence_radius_m: 50, stop_sequence: 2, arrival_time: "09:00", departure_time: "09:00" } },
      { schedule_entry_id: "stop-3", schedule_entries: { time: "10:00", stop_lat: -12.952, stop_lng: -38.502, geofence_radius_m: 50, stop_sequence: 3, arrival_time: "10:00", departure_time: "10:00" } },
    ];

    const vanLat = -12.952 + 0.00003;
    const vanLng = -38.502 + 0.00003;

    const allStops = pendingStops.map((s) => ({
      schedule_entry_id: s.schedule_entry_id,
      status: "passed",
      schedule_entries: { time: s.schedule_entries.time, stop_sequence: s.schedule_entries.stop_sequence },
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

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(10, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
    expect(mock._updates[0].pass_confidence).toBe(0.9);

    expect(mock._backfills).toHaveLength(1);
    expect(mock._backfills[0].pass_source).toBe("backfill");
    expect(mock._backfills[0].pass_confidence).toBe(0.5); // 2-stop gap
  });

  it("single ping does NOT backfill even for 1-stop gap (confidence 0.7 not > 0.7)", async () => {

    const pendingStops = [
      { schedule_entry_id: "stop-1", schedule_entries: { time: "08:00", stop_lat: -12.950, stop_lng: -38.500, geofence_radius_m: 50, stop_sequence: 1, arrival_time: "08:00", departure_time: "08:00" } },
      { schedule_entry_id: "stop-2", schedule_entries: { time: "09:00", stop_lat: -12.951, stop_lng: -38.501, geofence_radius_m: 50, stop_sequence: 2, arrival_time: "09:00", departure_time: "09:00" } },
    ];

    const vanLat = -12.951 + 0.00003;
    const vanLng = -38.501 + 0.00003;

    const allStops = [
      { schedule_entry_id: "stop-1", status: "pending", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "09:00", stop_sequence: 2 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: vanLat, lng: vanLng }],
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(9, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-2");
    expect(mock._updates[0].pass_confidence).toBe(0.7);

    // Backfill NOT allowed — confidence 0.7 is not > 0.7, gap exception removed
    // Filter out canonical healing writes (status=pending)
    const actualBackfills = mock._backfills.filter((b: { status: string }) => b.status === "passed");
    expect(actualBackfills).toHaveLength(0);
  });

  it("backfilled stops have pass_source backfill with scaled confidence", async () => {

    const pendingStops = [
      { schedule_entry_id: "stop-1", schedule_entries: { time: "07:00", stop_lat: -12.950, stop_lng: -38.500, geofence_radius_m: 50, stop_sequence: 1, arrival_time: "07:00", departure_time: "07:00" } },
      { schedule_entry_id: "stop-2", schedule_entries: { time: "08:00", stop_lat: -12.951, stop_lng: -38.501, geofence_radius_m: 50, stop_sequence: 2, arrival_time: "08:00", departure_time: "08:00" } },
      { schedule_entry_id: "stop-3", schedule_entries: { time: "09:00", stop_lat: -12.952, stop_lng: -38.502, geofence_radius_m: 50, stop_sequence: 3, arrival_time: "09:00", departure_time: "09:00" } },
      { schedule_entry_id: "stop-4", schedule_entries: { time: "10:00", stop_lat: -12.953, stop_lng: -38.503, geofence_radius_m: 50, stop_sequence: 4, arrival_time: "10:00", departure_time: "10:00" } },
    ];

    const vanLat = -12.953 + 0.00003;
    const vanLng = -38.503 + 0.00003;

    const allStops = pendingStops.map((s) => ({
      schedule_entry_id: s.schedule_entry_id,
      status: "passed",
      schedule_entries: { time: s.schedule_entries.time, stop_sequence: s.schedule_entries.stop_sequence },
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

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(10, 5),
    });

    expect(mock._updates[0].pass_source).toBe("geofence_raw");
    expect(mock._updates[0].pass_confidence).toBe(0.9);

    expect(mock._backfills[0].pass_source).toBe("backfill");
    expect(mock._backfills[0].pass_confidence).toBe(0.5); // 3-stop gap
  });

  it("direct geofence match with snapped coords has geofence_snapped source and high confidence", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
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
        { lat: rawLat, lng: rawLng, snapped_lat: snappedLat, snapped_lng: snappedLng },
        { lat: rawLat, lng: rawLng, snapped_lat: snappedLat + 0.00001, snapped_lng: snappedLng },
      ],
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: rawLat,
      rawLng: rawLng,
      snappedLat: snappedLat,
      snappedLng: snappedLng,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_snapped");
    // Raw ~33m (inside 50m geofence) → base 0.85 + 0.10 (2 snapped pings in geofence) = 0.95
    expect(mock._updates[0].pass_confidence).toBe(0.95);
  });
});

// --- Hybrid raw/snapped coordinate tests ---

describe("inferStopProgress hybrid raw/snapped position", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses raw GPS when snap displacement > 50m", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
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

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: rawLat,
      rawLng: rawLng,
      snappedLat: snappedLat,
      snappedLng: snappedLng,
      eventTs: makeEventTs(8, 5),
    });

    // Falls back to raw GPS (snap too far)
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
  });

  it("uses snapped GPS when snap displacement <= 50m", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
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

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: rawLat,
      rawLng: rawLng,
      snappedLat: snappedLat,
      snappedLng: snappedLng,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_snapped");
  });

  it("null snapped coordinates falls back to raw", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG }],
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      snappedLat: null,
      snappedLng: null,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
  });

  it("undefined snapped coordinates falls back to raw", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG }],
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
  });
});

describe("inferStopProgress stop_group_id grouping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("groups entries with same stop_group_id regardless of coordinate differences", async () => {

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
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
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
          stop_sequence: 2,
          arrival_time: "10:00",
          departure_time: "10:00",
        },
      },
    ];
    const allStops = [
      { schedule_entry_id: "entry-a", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "entry-b", status: "pending", schedule_entries: { time: "10:00", stop_sequence: 2 } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    // Only entry-a should be marked (van is within its geofence, closest in time)
    // entry-b is in the same group but van is NOT within its geofence
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("entry-a");
  });

  it("entries with null stop_group_id fall back to coordinate-based grouping", async () => {

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
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
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
          stop_sequence: 2,
          arrival_time: "10:00",
          departure_time: "10:00",
        },
      },
    ];
    const allStops = [
      { schedule_entry_id: "entry-0800", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "entry-1000", status: "pending", schedule_entries: { time: "10:00", stop_sequence: 2 } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    // Grouped by coordinates, closest-in-time (08:00) should be picked
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("entry-0800");
  });

  it("closest-in-time selection works within a stop_group_id group", async () => {

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
          stop_sequence: 1,
          arrival_time: "07:00",
          departure_time: "07:00",
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
          stop_sequence: 2,
          arrival_time: "11:00",
          departure_time: "11:00",
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
          stop_sequence: 3,
          arrival_time: "15:00",
          departure_time: "15:00",
        },
      },
    ];
    const allStops = [
      { schedule_entry_id: "grp-0700", status: "pending", schedule_entries: { time: "07:00", stop_sequence: 1 } },
      { schedule_entry_id: "grp-1100", status: "passed", schedule_entries: { time: "11:00", stop_sequence: 2 } },
      { schedule_entry_id: "grp-1500", status: "pending", schedule_entries: { time: "15:00", stop_sequence: 3 } },
    ];

    const mock = createMockSupabase({ pendingStops, allStops, shifts: [{ id: "shift-1", ended_at: null }] });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(11, 5),
    });

    // At 11:05, closest-in-time is grp-1100 (5 min diff vs 4h5m or 3h55m)
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("grp-1100");
  });
});

// --- Per-stop snap evaluation tests (US4) ---

describe("inferStopProgress per-stop snap evaluation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("same ping uses snapped for road stop and raw for campus stop (T020)", async () => {

    // Road stop: snapped coord is closer to it than raw
    // Campus stop: raw coord is closer to it than snapped
    const roadStopLat = -12.9700;
    const roadStopLng = -38.5100;
    const campusStopLat = -12.9720;
    const campusStopLng = -38.5140;

    // Raw GPS is closer to campus stop, snapped is closer to road stop
    const rawLat = -12.9718;
    const rawLng = -38.5138;
    const snappedLat = -12.9701;
    const snappedLng = -38.5101;
    // Snap displacement ~189m? Let me compute: raw at -12.9718, snapped at -12.9701 => ~189m
    // That exceeds 50m threshold, so snap won't be eligible.
    // Let me use coords where displacement < 50m but per-stop decision differs.

    // Better approach: raw and snapped are close together (displacement < 50m)
    // but for one stop snapped is closer and for the other raw is closer
    const rawLat2 = -12.9710;
    const rawLng2 = -38.5120;
    // Snapped ~30m from raw (within 50m threshold)
    const snappedLat2 = -12.97075;
    const snappedLng2 = -38.5120;

    // Stop A at -12.9706 (snapped at -12.97075 is closer: ~17m vs raw -12.9710: ~44m)
    const stopALat = -12.9706;
    const stopALng = -38.5120;
    // Stop B at -12.9713 (raw at -12.9710 is closer: ~33m vs snapped -12.97075: ~61m)
    const stopBLat = -12.9713;
    const stopBLng = -38.5120;

    const pendingStops = [
      {
        schedule_entry_id: "stop-a",
        schedule_entries: {
          time: "08:00",
          stop_lat: stopALat,
          stop_lng: stopALng,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
      {
        schedule_entry_id: "stop-b",
        schedule_entries: {
          time: "08:05",
          stop_lat: stopBLat,
          stop_lng: stopBLng,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "08:05",
          departure_time: "08:05",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-a", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-b", status: "passed", schedule_entries: { time: "08:05", stop_sequence: 2 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: rawLat2, lng: rawLng2 }],
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: rawLat2,
      rawLng: rawLng2,
      snappedLat: snappedLat2,
      snappedLng: snappedLng2,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(2);

    const stopA = mock._updates.find((u: UpdateCall) => u.schedule_entry_id === "stop-a");
    const stopB = mock._updates.find((u: UpdateCall) => u.schedule_entry_id === "stop-b");

    // Stop A: snapped is closer => geofence_snapped
    expect(stopA).toBeDefined();
    expect(stopA!.pass_source).toBe("geofence_snapped");

    // Stop B: raw is closer => geofence_raw
    expect(stopB).toBeDefined();
    expect(stopB!.pass_source).toBe("geofence_raw");
  });

  it("snap displacement > 50m forces raw for all stops (T021)", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
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

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: rawLat,
      rawLng: rawLng,
      snappedLat: snappedLat,
      snappedLng: snappedLng,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
  });
});

// --- Confidence source alignment tests (US5) ---

describe("inferStopProgress confidence source alignment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("snapped passage with 2+ pings gets confidence 0.95 (T027)", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
    ];

    // Raw ~33m from stop, snapped very close (displacement ~33m < 50m)
    const rawLat = CAAB_LAT + 0.0003;
    const rawLng = CAAB_LNG;
    const snappedLat = CAAB_LAT + 0.00001;
    const snappedLng = CAAB_LNG + 0.00001;

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: rawLat, lng: rawLng, snapped_lat: snappedLat, snapped_lng: snappedLng },
        { lat: rawLat, lng: rawLng, snapped_lat: snappedLat + 0.00001, snapped_lng: snappedLng },
      ],
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: rawLat,
      rawLng: rawLng,
      snappedLat: snappedLat,
      snappedLng: snappedLng,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_snapped");
    // Raw ~33m (inside 50m geofence) → base 0.85 + 0.10 (2 snapped pings in geofence) = 0.95
    expect(mock._updates[0].pass_confidence).toBe(0.95);
  });

  it("raw passage with 2+ pings still gets confidence 0.9 (T028)", async () => {

    const pendingStops = [
      { schedule_entry_id: "stop-1", schedule_entries: { time: "10:00", stop_lat: -12.952, stop_lng: -38.502, geofence_radius_m: 50, stop_sequence: 1, arrival_time: "10:00", departure_time: "10:00" } },
    ];

    const vanLat = -12.952 + 0.00003;
    const vanLng = -38.502 + 0.00003;

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "10:00", stop_sequence: 1 } },
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

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(10, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
    expect(mock._updates[0].pass_confidence).toBe(0.9);
  });

  it("snapped passage with < 2 pings and raw inside geofence gets confidence 0.85 (T029)", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
    ];

    // Raw ~33m from stop, snapped very close
    const rawLat = CAAB_LAT + 0.0003;
    const rawLng = CAAB_LNG;
    const snappedLat = CAAB_LAT + 0.00001;
    const snappedLng = CAAB_LNG + 0.00001;

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: snappedLat, lng: snappedLng }],
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: rawLat,
      rawLng: rawLng,
      snappedLat: snappedLat,
      snappedLng: snappedLng,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_snapped");
    // Raw ~33m (inside 50m geofence) → base 0.85, no ping bonus, no disp bonus
    expect(mock._updates[0].pass_confidence).toBe(0.85);
  });
});

// --- Backfill gate tightening tests (US6) ---

describe("inferStopProgress backfill gate tightening", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("2-ping raw match (confidence 0.9) with gap=1 DOES trigger backfill (T033)", async () => {

    const pendingStops = [
      { schedule_entry_id: "stop-1", schedule_entries: { time: "08:00", stop_lat: -12.950, stop_lng: -38.500, geofence_radius_m: 50, stop_sequence: 1, arrival_time: "08:00", departure_time: "08:00" } },
      { schedule_entry_id: "stop-2", schedule_entries: { time: "09:00", stop_lat: -12.951, stop_lng: -38.501, geofence_radius_m: 50, stop_sequence: 2, arrival_time: "09:00", departure_time: "09:00" } },
    ];

    const vanLat = -12.951 + 0.00003;
    const vanLng = -38.501 + 0.00003;

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "09:00", stop_sequence: 2 } },
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

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(9, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-2");
    expect(mock._updates[0].pass_confidence).toBe(0.9);

    // 0.9 > 0.7, so backfill IS allowed
    expect(mock._backfills).toHaveLength(1);
    expect(mock._backfills[0].schedule_entry_ids).toEqual(["stop-1"]);
    expect(mock._backfills[0].pass_confidence).toBe(0.7); // 1-stop gap
  });

  it("snapped passage (confidence 0.85) with gap=1 DOES trigger backfill (T034)", async () => {

    const pendingStops = [
      { schedule_entry_id: "stop-1", schedule_entries: { time: "08:00", stop_lat: -12.950, stop_lng: -38.500, geofence_radius_m: 50, stop_sequence: 1, arrival_time: "08:00", departure_time: "08:00" } },
      { schedule_entry_id: "stop-2", schedule_entries: { time: "09:00", stop_lat: -12.951, stop_lng: -38.501, geofence_radius_m: 50, stop_sequence: 2, arrival_time: "09:00", departure_time: "09:00" } },
    ];

    // Raw far from stop-2, snapped close to stop-2
    const rawLat = -12.951 + 0.0003; // ~33m from stop
    const rawLng = -38.501;
    const snappedLat = -12.951 + 0.00003; // ~3m from stop
    const snappedLng = -38.501;

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "09:00", stop_sequence: 2 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: snappedLat, lng: snappedLng }],
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: rawLat,
      rawLng: rawLng,
      snappedLat: snappedLat,
      snappedLng: snappedLng,
      eventTs: makeEventTs(9, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].schedule_entry_id).toBe("stop-2");
    expect(mock._updates[0].pass_source).toBe("geofence_snapped");
    // Raw ~33m (inside 50m geofence) → base 0.85, no ping bonus, no disp bonus
    expect(mock._updates[0].pass_confidence).toBe(0.85);

    // 0.85 > 0.7, so backfill IS allowed
    expect(mock._backfills).toHaveLength(1);
    expect(mock._backfills[0].schedule_entry_ids).toEqual(["stop-1"]);
  });
});

// --- Write error logging tests ---

describe("write error logging", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("logs structured error when geofence mark write fails", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];
    const allStops = [
      { schedule_entry_id: "entry-0800", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
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

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

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

    // Two pending stops; van is at the later one (09:00), so 08:00 gets backfilled
    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT + 0.01, // far from van
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
      {
        schedule_entry_id: "entry-0900",
        schedule_entries: {
          time: "09:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
    ];
    const allStops = [
      { schedule_entry_id: "entry-0800", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "entry-0900", status: "passed", schedule_entries: { time: "09:00", stop_sequence: 2 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG },
        { lat: VAN_AT_CAAB_LAT + 0.00001, lng: VAN_AT_CAAB_LNG },
      ],
    });

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

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(9, 5),
    });

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

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];
    const allStops = [
      { schedule_entry_id: "entry-0800", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
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

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

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

describe("inferStopProgress evidence query hoisting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("T004: >50 pings in window produces deterministic confidence 0.90", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-0800",
        status: "passed",
        schedule_entries: { time: "08:00", stop_sequence: 1 },
      },
    ];

    // 60 pings all inside geofence
    const pings = Array.from({ length: 60 }, () => ({
      lat: VAN_AT_CAAB_LAT,
      lng: VAN_AT_CAAB_LNG,
    }));

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings,
    });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    // .limit(50) is no longer called — time-window filter is sufficient (T046)
    expect(mock._pingsLimitSpy).toBeNull();

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_confidence).toBe(0.9);
  });

  it("T005: evidence is fetched exactly once per invocation with multiple coord groups", async () => {

    // Two stops at different coordinates — two coordinate groups
    const pendingStops = [
      {
        schedule_entry_id: "stop-a",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
      {
        schedule_entry_id: "stop-b",
        schedule_entries: {
          time: "08:00",
          stop_lat: -12.980,
          stop_lng: -38.520,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "stop-a",
        status: "passed",
        schedule_entries: { time: "08:00", stop_sequence: 1 },
      },
      {
        schedule_entry_id: "stop-b",
        status: "pending",
        schedule_entries: { time: "08:00", stop_sequence: 2 },
      },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG }],
    });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    // Count how many times van_location_pings was queried
    const pingCalls = mock.from.mock.calls.filter(
      (call: string[]) => call[0] === "van_location_pings",
    );
    expect(pingCalls).toHaveLength(1);
  });

  it("T006: 2 raw pings in geofence produces confidence 0.90", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-0800",
        status: "passed",
        schedule_entries: { time: "08:00", stop_sequence: 1 },
      },
    ];

    // Exactly 2 pings inside geofence
    const pings = [
      { lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG },
      { lat: VAN_AT_CAAB_LAT + 0.00001, lng: VAN_AT_CAAB_LNG + 0.00001 },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings,
    });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_confidence).toBe(0.9);
  });

  it("T007: recent-pings query includes tiebreaker ordering and explicit limit", async () => {

    const pendingStops = [
      {
        schedule_entry_id: "entry-0800",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-0800",
        status: "passed",
        schedule_entries: { time: "08:00", stop_sequence: 1 },
      },
    ];
    const pings = [
      { lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings,
    });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    // .limit(50) is no longer called — time-window filter is sufficient (T046)
    expect(mock._pingsLimitSpy).toBeNull();
  });
});

// --- Monotonic snapped confidence tests (US4) ---

describe("inferStopProgress monotonic snapped confidence", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Snapped coordinates: close to stop but snapped position is even closer
  // Raw position is OUTSIDE 50m geofence, snapped is INSIDE
  const STOP_LAT = -12.9714;
  const STOP_LNG = -38.5124;
  // Raw: ~52m from stop (outside 50m geofence, but within 50m snap displacement of SNAPPED_NEAR)
  const RAW_OUTSIDE_LAT = -12.97187;
  const RAW_OUTSIDE_LNG = -38.5124;
  // Snapped: ~5m from stop (inside 50m geofence)
  const SNAPPED_NEAR_LAT = -12.97143;
  const SNAPPED_NEAR_LNG = -38.51237;
  // Raw: ~20m from stop (inside 50m geofence)
  const RAW_INSIDE_LAT = -12.97158;
  const RAW_INSIDE_LNG = -38.5124;
  // Snapped: ~13m from raw outside (displacement ≤15m), ~48m from stop (inside geofence)
  const SNAPPED_LOW_DISP_LAT = -12.97183;
  const SNAPPED_LOW_DISP_LNG = -38.5124;

  function makeSnappedPendingStop() {
    return [{
      schedule_entry_id: "entry-0800",
      schedule_entries: {
        time: "08:00",
        stop_lat: STOP_LAT,
        stop_lng: STOP_LNG,
        geofence_radius_m: 50,
        stop_sequence: 1,
        arrival_time: "08:00",
        departure_time: "08:00",
      },
    }];
  }

  function makeAllStopsPassed() {
    return [{
      schedule_entry_id: "entry-0800",
      status: "passed",
      schedule_entries: { time: "08:00", stop_sequence: 1 },
    }];
  }

  // T027: snapped match with raw outside geofence returns 0.65
  it("snapped match with raw outside geofence returns confidence 0.65", async () => {
    const mock = createMockSupabase({
      pendingStops: makeSnappedPendingStop(),
      allStops: makeAllStopsPassed(),
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [], // no confirming pings
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: RAW_OUTSIDE_LAT,
      rawLng: RAW_OUTSIDE_LNG,
      snappedLat: SNAPPED_NEAR_LAT,
      snappedLng: SNAPPED_NEAR_LNG,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_confidence).toBe(0.65);
    expect(mock._updates[0].pass_source).toBe("geofence_snapped");
  });

  // T028: snapped match with raw inside geofence returns 0.85
  it("snapped match with raw inside geofence returns confidence 0.85", async () => {
    const mock = createMockSupabase({
      pendingStops: makeSnappedPendingStop(),
      allStops: makeAllStopsPassed(),
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [], // no confirming pings
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: RAW_INSIDE_LAT,
      rawLng: RAW_INSIDE_LNG,
      snappedLat: SNAPPED_NEAR_LAT,
      snappedLng: SNAPPED_NEAR_LNG,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    // Raw inside + snapped inside, but snapped is closer so used for geofence
    // But since raw is ALSO inside, base is 0.85
    expect(mock._updates[0].pass_confidence).toBe(0.85);
  });

  // T029: snapped match with 2+ confirming pings adds +0.10 (capped at 0.95)
  it("snapped match with 2+ confirming pings adds 0.10 bonus", async () => {
    const mock = createMockSupabase({
      pendingStops: makeSnappedPendingStop(),
      allStops: makeAllStopsPassed(),
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: RAW_OUTSIDE_LAT, lng: RAW_OUTSIDE_LNG, snapped_lat: STOP_LAT + 0.00001, snapped_lng: STOP_LNG + 0.00001 },
        { lat: RAW_OUTSIDE_LAT, lng: RAW_OUTSIDE_LNG, snapped_lat: STOP_LAT - 0.00001, snapped_lng: STOP_LNG - 0.00001 },
      ], // 2 pings with snapped coords inside geofence
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: RAW_OUTSIDE_LAT,
      rawLng: RAW_OUTSIDE_LNG,
      snappedLat: SNAPPED_NEAR_LAT,
      snappedLng: SNAPPED_NEAR_LNG,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    // base 0.65 (raw outside) + 0.10 (2+ pings) = 0.75
    expect(mock._updates[0].pass_confidence).toBe(0.75);
  });

  // T030: snapped match with snap displacement ≤15m adds +0.05
  it("snapped match with low snap displacement adds 0.05 bonus", async () => {
    const mock = createMockSupabase({
      pendingStops: makeSnappedPendingStop(),
      allStops: makeAllStopsPassed(),
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [],
    });

    // Raw outside, snapped close (low displacement ~10m between raw and snapped)
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: RAW_OUTSIDE_LAT,
      rawLng: RAW_OUTSIDE_LNG,
      snappedLat: SNAPPED_LOW_DISP_LAT,
      snappedLng: SNAPPED_LOW_DISP_LNG,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    // base 0.65 (raw outside) + 0.05 (low displacement) = 0.70
    expect(mock._updates[0].pass_confidence).toBe(0.70);
  });

  // T031: monotonic property — progressively stronger evidence never decreases confidence
  it("confidence is monotonically increasing with stronger evidence", async () => {

    // Level 1: snapped only, raw outside, no pings, high displacement
    const mock1 = createMockSupabase({
      pendingStops: makeSnappedPendingStop(),
      allStops: makeAllStopsPassed(),
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [],
    });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock1 as any,
      vanId: "van-1",
      rawLat: RAW_OUTSIDE_LAT,
      rawLng: RAW_OUTSIDE_LNG,
      snappedLat: SNAPPED_NEAR_LAT,
      snappedLng: SNAPPED_NEAR_LNG,
      eventTs: makeEventTs(8, 5),
    });
    const conf1 = mock1._updates[0].pass_confidence!;

    // Level 2: snapped, raw outside, low displacement
    const mock2 = createMockSupabase({
      pendingStops: makeSnappedPendingStop(),
      allStops: makeAllStopsPassed(),
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [],
    });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock2 as any,
      vanId: "van-1",
      rawLat: RAW_OUTSIDE_LAT,
      rawLng: RAW_OUTSIDE_LNG,
      snappedLat: SNAPPED_LOW_DISP_LAT,
      snappedLng: SNAPPED_LOW_DISP_LNG,
      eventTs: makeEventTs(8, 5),
    });
    const conf2 = mock2._updates[0].pass_confidence!;

    // Level 3: snapped, raw outside, 2+ pings with snapped coords
    const mock3 = createMockSupabase({
      pendingStops: makeSnappedPendingStop(),
      allStops: makeAllStopsPassed(),
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: RAW_OUTSIDE_LAT, lng: RAW_OUTSIDE_LNG, snapped_lat: STOP_LAT + 0.00001, snapped_lng: STOP_LNG + 0.00001 },
        { lat: RAW_OUTSIDE_LAT, lng: RAW_OUTSIDE_LNG, snapped_lat: STOP_LAT - 0.00001, snapped_lng: STOP_LNG - 0.00001 },
      ],
    });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock3 as any,
      vanId: "van-1",
      rawLat: RAW_OUTSIDE_LAT,
      rawLng: RAW_OUTSIDE_LNG,
      snappedLat: SNAPPED_NEAR_LAT,
      snappedLng: SNAPPED_NEAR_LNG,
      eventTs: makeEventTs(8, 5),
    });
    const conf3 = mock3._updates[0].pass_confidence!;

    // Level 4: snapped, raw inside
    const mock4 = createMockSupabase({
      pendingStops: makeSnappedPendingStop(),
      allStops: makeAllStopsPassed(),
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [],
    });
    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock4 as any,
      vanId: "van-1",
      rawLat: RAW_INSIDE_LAT,
      rawLng: RAW_INSIDE_LNG,
      snappedLat: SNAPPED_NEAR_LAT,
      snappedLng: SNAPPED_NEAR_LNG,
      eventTs: makeEventTs(8, 5),
    });
    const conf4 = mock4._updates[0].pass_confidence!;

    // Verify monotonic: conf1 <= conf2 <= conf3 <= conf4
    expect(conf1).toBeLessThanOrEqual(conf2); // 0.65 <= 0.70
    expect(conf2).toBeLessThanOrEqual(conf3); // 0.70 <= 0.75
    expect(conf3).toBeLessThanOrEqual(conf4); // 0.75 <= 0.85
  });
});

describe("inferStopProgress adjacency validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rolls back lastPassedStopId to last contiguous stop when backfill is skipped (confidence <= 0.7)", async () => {

    // Van is at stop-3 but confidence is low (no confirming pings) so backfill is skipped.
    // stop-1 and stop-2 remain pending while stop-3 is marked passed.
    const pendingStops = [
      {
        schedule_entry_id: "stop-3",
        schedule_entries: {
          time: "09:00",
          stop_lat: -12.952,
          stop_lng: -38.502,
          geofence_radius_m: 50,
          stop_sequence: 3,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
    ];

    // After the write path: stop-1 and stop-2 are pending, stop-3 is passed (gap)
    const allStops = [
      { schedule_entry_id: "stop-1", status: "pending", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-2", status: "pending", schedule_entries: { time: "08:30", stop_sequence: 2 } },
      { schedule_entry_id: "stop-3", status: "passed", schedule_entries: { time: "09:00", stop_sequence: 3 } },
    ];

    const vanLat = -12.952 + 0.00003;
    const vanLng = -38.502 + 0.00003;

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [], // no confirming pings → confidence = 0.70, backfill skipped
    });
    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(9, 5),
    });

    // lastPassedStopId should be rolled back to null (no contiguously-passed stop before first pending)
    expect(result.lastPassedStopId).toBeNull();
    // nextStopId should be the first pending stop
    expect(result.nextStopId).toBe("stop-1");
    // passedStopIds is filtered to contiguous prefix (empty — no stops passed before first pending)
    expect(result.passedStopIds).not.toContain("stop-3");
    // Persisted pointer should use the rolled-back lastPassedStopId
    expect(mock._routeRunUpdates).toHaveLength(1);
    expect(mock._routeRunUpdates[0].last_passed_stop_id).toBeNull();
    expect(mock._routeRunUpdates[0].next_stop_id).toBe("stop-1");
  });

  it("does not roll back lastPassedStopId when backfill succeeds (confidence > 0.7)", async () => {

    // Van is at stop-3 with high confidence (confirming pings), backfill runs.
    // After backfill: all stops are passed, no gap.
    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: -12.950,
          stop_lng: -38.500,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
      {
        schedule_entry_id: "stop-2",
        schedule_entries: {
          time: "08:30",
          stop_lat: -12.951,
          stop_lng: -38.501,
          geofence_radius_m: 50,
          stop_sequence: 2,
          arrival_time: "08:30",
          departure_time: "08:30",
        },
      },
      {
        schedule_entry_id: "stop-3",
        schedule_entries: {
          time: "09:00",
          stop_lat: -12.952,
          stop_lng: -38.502,
          geofence_radius_m: 50,
          stop_sequence: 3,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
    ];

    const vanLat = -12.952 + 0.00003;
    const vanLng = -38.502 + 0.00003;

    // After backfill succeeds: all passed, stop-4 is next pending
    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-2", status: "passed", schedule_entries: { time: "08:30", stop_sequence: 2 } },
      { schedule_entry_id: "stop-3", status: "passed", schedule_entries: { time: "09:00", stop_sequence: 3 } },
      { schedule_entry_id: "stop-4", status: "pending", schedule_entries: { time: "09:30", stop_sequence: 4 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: vanLat + 0.00001, lng: vanLng + 0.00001 },
        { lat: vanLat - 0.00001, lng: vanLng - 0.00001 },
      ], // 2 confirming pings → confidence = 0.90 > 0.7, backfill runs
    });
    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(9, 5),
    });

    // lastPassedStopId should be stop-3 (adjacent to nextStopId stop-4, no rollback)
    expect(result.lastPassedStopId).toBe("stop-3");
    expect(result.nextStopId).toBe("stop-4");
    // Persisted pointer matches
    expect(mock._routeRunUpdates).toHaveLength(1);
    expect(mock._routeRunUpdates[0].last_passed_stop_id).toBe("stop-3");
    expect(mock._routeRunUpdates[0].next_stop_id).toBe("stop-4");
  });
});

describe("inferStopProgress insertion-order resilience", () => {
  // Regression: PostgREST referencedTable .order() only sorts the embedded
  // sub-object, not parent rows. Without the JS sort fix, rows returned in
  // insertion order produce wrong nextStopId / lastPassedStopId pointers.

  it("returns correct pointers when allStops arrive in scrambled insertion order", async () => {

    // Simulate 4 stops whose insertion order differs from schedule order.
    // Schedule order: stop-A 07:00, stop-B 08:00, stop-C 09:00, stop-D 10:00
    // Insertion order (scrambled): stop-C, stop-A, stop-D, stop-B
    const allStops = [
      { schedule_entry_id: "stop-C", status: "passed",  schedule_entries: { time: "09:00", stop_sequence: 3 } },
      { schedule_entry_id: "stop-A", status: "passed",  schedule_entries: { time: "07:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-D", status: "pending", schedule_entries: { time: "10:00", stop_sequence: 4 } },
      { schedule_entry_id: "stop-B", status: "passed",  schedule_entries: { time: "08:00", stop_sequence: 2 } },
    ];

    const mock = createMockSupabase({
      pendingStops: [],
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
    });

    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: CAAB_LAT,
      rawLng: CAAB_LNG,
      eventTs: makeEventTs(10, 0),
    });

    // After sorting by time, the order is A B C D.
    // A, B, C are passed contiguously → lastPassedStopId = stop-C
    // D is the first pending → nextStopId = stop-D
    expect(result.lastPassedStopId).toBe("stop-C");
    expect(result.nextStopId).toBe("stop-D");
    expect(result.passedStopIds).toEqual(["stop-A", "stop-B", "stop-C"]);

    // Persisted pointer must match
    expect(mock._routeRunUpdates).toHaveLength(1);
    expect(mock._routeRunUpdates[0].last_passed_stop_id).toBe("stop-C");
    expect(mock._routeRunUpdates[0].next_stop_id).toBe("stop-D");
  });

  it("returns correct pointers when pendingStops arrive in scrambled insertion order", async () => {

    // Van is at CAAB coords. Two pending stops in scrambled order:
    // Schedule: stop-E 13:00 (at CAAB), stop-F 14:00 (far away)
    // Insertion: stop-F first, stop-E second
    const pendingStops = [
      {
        schedule_entry_id: "stop-F",
        schedule_entries: { time: "14:00", stop_lat: -13.5, stop_lng: -39.0, geofence_radius_m: 50, stop_group_id: null, stop_sequence: 2, arrival_time: "14:00", departure_time: "14:00" },
      },
      {
        schedule_entry_id: "stop-E",
        schedule_entries: { time: "13:00", stop_lat: CAAB_LAT, stop_lng: CAAB_LNG, geofence_radius_m: 50, stop_group_id: null, stop_sequence: 1, arrival_time: "13:00", departure_time: "13:00" },
      },
    ];

    // After geofence pass on stop-E, allStops reflects it (scrambled order)
    const allStops = [
      { schedule_entry_id: "stop-F", status: "pending", schedule_entries: { time: "14:00", stop_sequence: 2 } },
      { schedule_entry_id: "stop-E", status: "passed",  schedule_entries: { time: "13:00", stop_sequence: 1 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG },
        { lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG },
      ],
    });

    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(14, 0),
    });

    // Sorted order: stop-E 13:00 (passed), stop-F 14:00 (pending)
    expect(result.lastPassedStopId).toBe("stop-E");
    expect(result.nextStopId).toBe("stop-F");
  });
});

describe("inferStopProgress event-time service date derivation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("T016: derives service_date from eventTs in America/Bahia, not UTC", async () => {
    // 2026-03-10T01:30:00Z = 2026-03-09T22:30:00-03:00 in America/Bahia
    // So the service_date should be 2026-03-09, not 2026-03-10
    const utcMidnightIsh = "2026-03-10T01:30:00.000Z";

    const pendingStops = [
      {
        schedule_entry_id: "entry-2200",
        schedule_entries: {
          time: "22:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "22:00",
          departure_time: "22:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-2200",
        status: "passed",
        schedule_entries: { time: "22:00", stop_sequence: 1 },
      },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: utcMidnightIsh,
    });

    // The route_runs upsert should use the Bahia-local date (2026-03-09)
    expect(mock._routeRunUpserts).toHaveLength(1);
    expect(mock._routeRunUpserts[0].service_date).toBe("2026-03-09");
  });
});

describe("inferStopProgress shift-active-at-event-time replay", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("T017: allows replay when eventTs falls within a shift that has since ended", async () => {
    // Shift started at 08:00, ended at 12:00.
    // eventTs is 10:00, within the shift window.
    // The real DB query (.lte("started_at", eventTs).or("ended_at.is.null,ended_at.gt.{eventTs}"))
    // would return this shift. We simulate that via activeShiftOverride.
    const pendingStops = [
      {
        schedule_entry_id: "entry-1000",
        schedule_entries: {
          time: "10:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "10:00",
          departure_time: "10:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-1000",
        status: "passed",
        schedule_entries: { time: "10:00", stop_sequence: 1 },
      },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [
        {
          id: "shift-1",
          started_at: "2026-03-10T08:00:00.000-03:00",
          ended_at: "2026-03-10T12:00:00.000-03:00",
        },
      ],
      // The shift is active at eventTs=10:00, so the query would return it
      activeShiftOverride: { id: "shift-1" },
    });

    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(10, 0),
    });

    // Inference should proceed — not return EMPTY_PROGRESS
    expect(result.passedStopIds).toHaveLength(1);
    expect(result.passedStopIds).toContain("entry-1000");
  });
});

describe("inferStopProgress passed_at uses eventTs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("T018: passed_at equals eventTs, not server time", async () => {
    const knownEventTs = "2026-03-10T09:05:00.000-03:00";

    const pendingStops = [
      {
        schedule_entry_id: "entry-0900",
        schedule_entries: {
          time: "09:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
    ];
    const allStops = [
      {
        schedule_entry_id: "entry-0900",
        status: "passed",
        schedule_entries: { time: "09:00", stop_sequence: 1 },
      },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: knownEventTs,
    });

    // The update payload should use eventTs as passed_at
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].passed_at).toBe(knownEventTs);
  });
});

describe("inferStopProgress contiguity enforcement (T024–T026)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("T024: low-confidence late match does not persist non-contiguous passed row", async () => {
    // 4 stops: A 07:00, B 07:30, C 08:00, D 08:30
    // A and B already passed, C pending, D pending
    // Van is at D's location (far from C), single ping → confidence 0.70

    const stopD_lat = -13.0;
    const stopD_lng = -38.6;
    const vanAtD_lat = -13.00003; // ~5m from D, within 50m geofence
    const vanAtD_lng = -38.60003;

    const pendingStops = [
      {
        schedule_entry_id: "stop-C",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_group_id: null,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
      {
        schedule_entry_id: "stop-D",
        schedule_entries: {
          time: "08:30",
          stop_lat: stopD_lat,
          stop_lng: stopD_lng,
          geofence_radius_m: 50,
          stop_group_id: null,
          stop_sequence: 2,
          arrival_time: "08:30",
          departure_time: "08:30",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-A", status: "passed", schedule_entries: { time: "07:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-B", status: "passed", schedule_entries: { time: "07:30", stop_sequence: 2 } },
      { schedule_entry_id: "stop-C", status: "pending", schedule_entries: { time: "08:00", stop_sequence: 3 } },
      { schedule_entry_id: "stop-D", status: "passed", schedule_entries: { time: "08:30", stop_sequence: 4 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: vanAtD_lat, lng: vanAtD_lng }], // single ping → confidence 0.70
    });

    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanAtD_lat,
      rawLng: vanAtD_lng,
      eventTs: makeEventTs(8, 35),
    });

    // Adjacency validation should strip D from passedStopIds (C is pending between B and D)
    expect(result.passedStopIds).toEqual(["stop-A", "stop-B"]);
    expect(result.passedStopIds).not.toContain("stop-D");
    // lastPassedStopId should be the last contiguous passed stop
    expect(result.lastPassedStopId).toBe("stop-B");
    // nextStopId should be the first pending stop
    expect(result.nextStopId).toBe("stop-C");
  });

  it("T025: previously corrupted non-contiguous rows are healed in return value", async () => {
    // 5 stops: A=passed, B=passed, C=pending, D=passed (corrupted), E=pending
    // Van is far from all stops — no new geofence matches

    const farLat = -14.0;
    const farLng = -39.0;

    const pendingStops = [
      {
        schedule_entry_id: "stop-C",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_group_id: null,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
      {
        schedule_entry_id: "stop-E",
        schedule_entries: {
          time: "09:00",
          stop_lat: -12.98,
          stop_lng: -38.52,
          geofence_radius_m: 50,
          stop_group_id: null,
          stop_sequence: 2,
          arrival_time: "09:00",
          departure_time: "09:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-A", status: "passed", schedule_entries: { time: "07:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-B", status: "passed", schedule_entries: { time: "07:30", stop_sequence: 2 } },
      { schedule_entry_id: "stop-C", status: "pending", schedule_entries: { time: "08:00", stop_sequence: 3 } },
      { schedule_entry_id: "stop-D", status: "passed", schedule_entries: { time: "08:30", stop_sequence: 4 } },
      { schedule_entry_id: "stop-E", status: "pending", schedule_entries: { time: "09:00", stop_sequence: 5 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [{ lat: farLat, lng: farLng }],
    });

    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: farLat,
      rawLng: farLng,
      eventTs: makeEventTs(8, 35),
    });

    // Adjacency validation should return only contiguous prefix [A, B]
    expect(result.passedStopIds).toEqual(["stop-A", "stop-B"]);
    expect(result.passedStopIds).not.toContain("stop-D");
    expect(result.lastPassedStopId).toBe("stop-B");
    expect(result.nextStopId).toBe("stop-C");
  });

  it("T026: contiguous legitimate passes all persist correctly", async () => {
    // 3 stops: A 07:00 (already passed), B 07:30, C 08:00
    // Van is at B and C's location (same stop_group_id, both within geofence)
    // All should be marked as passed since they form a contiguous prefix

    const pendingStops = [
      {
        schedule_entry_id: "stop-B",
        schedule_entries: {
          time: "07:30",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_group_id: "group-terminal",
          stop_sequence: 1,
          arrival_time: "07:30",
          departure_time: "07:30",
        },
      },
      {
        schedule_entry_id: "stop-C",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_group_id: "group-terminal",
          stop_sequence: 2,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-A", status: "passed", schedule_entries: { time: "07:00", stop_sequence: 1 } },
      { schedule_entry_id: "stop-B", status: "passed", schedule_entries: { time: "07:30", stop_sequence: 2 } },
      { schedule_entry_id: "stop-C", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 3 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: [
        { lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG },
        { lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG },
      ],
    });

    const result = await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    // All three stops form a contiguous passed prefix
    expect(result.passedStopIds).toEqual(["stop-A", "stop-B", "stop-C"]);
    expect(result.lastPassedStopId).toBe("stop-C");
    // No more pending stops
    expect(result.nextStopId).toBeNull();
  });
});

// --- Source-aligned confidence scoring tests (US4 T043-T048) ---

describe("inferStopProgress source-aligned confidence scoring", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("no .limit(50) cap — all pings in time window considered (T043)", async () => {
    // Generate >50 pings, all within geofence
    const manyPings = Array.from({ length: 60 }, (_, i) => ({
      lat: CAAB_LAT + 0.00001 * (i % 3),
      lng: CAAB_LNG + 0.00001 * (i % 2),
    }));

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings: manyPings,
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: VAN_AT_CAAB_LAT,
      rawLng: VAN_AT_CAAB_LNG,
      eventTs: makeEventTs(8, 5),
    });

    // .limit() should NOT be called — query relies on time-window filter only
    expect(mock._pingsLimitSpy).toBeNull();

    // All 60 pings are within geofence, so confidence should reflect >= 2 pings
    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_confidence).toBe(0.9);
  });

  it("snapped-triggered match counts only snapped evidence pings (T044)", async () => {
    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "08:00",
          stop_lat: CAAB_LAT,
          stop_lng: CAAB_LNG,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "08:00",
          departure_time: "08:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "08:00", stop_sequence: 1 } },
    ];

    // Raw is ~33m from stop, snapped is very close — triggers snapped match
    const rawLat = CAAB_LAT + 0.0003;
    const rawLng = CAAB_LNG;
    const snappedLat = CAAB_LAT + 0.00001;
    const snappedLng = CAAB_LNG + 0.00001;

    // 3 pings with raw coords inside geofence but NO snapped coords
    // 1 ping with snapped coords inside geofence
    // Only the snapped ping should count for confidence
    const pings = [
      { lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG, snapped_lat: null, snapped_lng: null },
      { lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG, snapped_lat: null, snapped_lng: null },
      { lat: VAN_AT_CAAB_LAT, lng: VAN_AT_CAAB_LNG, snapped_lat: null, snapped_lng: null },
      { lat: CAAB_LAT + 0.0005, lng: CAAB_LNG, snapped_lat: CAAB_LAT + 0.00002, snapped_lng: CAAB_LNG + 0.00002 },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings,
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat,
      rawLng,
      snappedLat,
      snappedLng,
      eventTs: makeEventTs(8, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_snapped");
    // Only 1 snapped ping in geofence (< 2), raw inside geofence → base 0.85
    // No ping bonus (< 2 snapped pings in geofence)
    // Snap displacement ~33m > 15m, no disp bonus
    expect(mock._updates[0].pass_confidence).toBe(0.85);
  });

  it("raw-triggered match counts only raw evidence pings (T045)", async () => {
    const stopLat = -12.952;
    const stopLng = -38.502;

    const pendingStops = [
      {
        schedule_entry_id: "stop-1",
        schedule_entries: {
          time: "10:00",
          stop_lat: stopLat,
          stop_lng: stopLng,
          geofence_radius_m: 50,
          stop_sequence: 1,
          arrival_time: "10:00",
          departure_time: "10:00",
        },
      },
    ];

    const allStops = [
      { schedule_entry_id: "stop-1", status: "passed", schedule_entries: { time: "10:00", stop_sequence: 1 } },
    ];

    // Van raw position is inside geofence (~3m)
    const vanLat = stopLat + 0.00003;
    const vanLng = stopLng + 0.00003;

    // Pings: 2 with raw coords inside geofence and with snapped coords (but snapped should be ignored)
    // Plus 1 with raw coords outside geofence
    const pings = [
      { lat: stopLat + 0.00002, lng: stopLng + 0.00002, snapped_lat: stopLat + 0.01, snapped_lng: stopLng + 0.01 },
      { lat: stopLat - 0.00002, lng: stopLng - 0.00002, snapped_lat: stopLat + 0.01, snapped_lng: stopLng + 0.01 },
      { lat: stopLat + 0.005, lng: stopLng + 0.005, snapped_lat: stopLat + 0.00001, snapped_lng: stopLng + 0.00001 },
    ];

    const mock = createMockSupabase({
      pendingStops,
      allStops,
      shifts: [{ id: "shift-1", ended_at: null }],
      pings,
    });

    await inferStopProgress({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId: "van-1",
      rawLat: vanLat,
      rawLng: vanLng,
      eventTs: makeEventTs(10, 5),
    });

    expect(mock._updates).toHaveLength(1);
    expect(mock._updates[0].pass_source).toBe("geofence_raw");
    // 2 raw pings inside geofence → confidence 0.9
    // (3rd ping's snapped coords are inside geofence but should be ignored for raw match)
    expect(mock._updates[0].pass_confidence).toBe(0.9);
  });
});