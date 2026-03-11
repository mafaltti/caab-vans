/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import { processDeviceGeofenceEvents } from "@/lib/tracking/process-device-geofence-events";

vi.mock("@/lib/tracking/seed-route-run-stops", () => ({
  seedRouteRunStops: vi.fn().mockResolvedValue(false),
}));

const TZ = "America/Bahia";
const stopLat = -12.9714;
const stopLng = -38.5124;
const placeId = "mundo_plaza";
const vanId = "van-1";

const eventTime = DateTime.fromObject(
  { hour: 13, minute: 50, second: 0 },
  { zone: TZ },
);
const enteredAt = eventTime.toMillis();

// --- Mock Supabase builder ---

type StopUpdate = {
  table: string;
  payload: Record<string, unknown>;
  filters: Record<string, unknown>;
};

type EventUpdate = {
  payload: Record<string, unknown>;
  filters: Record<string, unknown>;
};

function createMockSupabase(opts: {
  insertReturns?: unknown[] | null; // null = duplicate (empty array)
  existingEvent?: {
    status: string;
    matched_schedule_entry_id?: string | null;
    matched_run_id?: string | null;
  } | null;
  matchedStopStatus?: string; // for dedup recheck
  activeShift?: { id: string } | null;
  pendingStops?: Array<{
    schedule_entry_id: string;
    schedule_entries: {
      stop_lat: number;
      stop_lng: number;
      stop_group_id: string | null;
      geofence_radius_m: number;
      stop_sequence: number;
      arrival_time: string;
      departure_time: string;
    };
  }>;
  recentPings?: Array<{ lat: number; lng: number }>;
}) {
  const {
    insertReturns = [{ id: "ge-1" }],
    existingEvent = null,
    matchedStopStatus = "passed",
    activeShift = { id: "shift-1" },
    pendingStops = [],
    recentPings = [],
  } = opts;

  const stopUpdates: StopUpdate[] = [];
  const eventUpdates: EventUpdate[] = [];

  function chain(result: unknown) {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return undefined;
          if (prop === "single" || prop === "maybeSingle")
            return () => ({ data: result, error: null });
          return () => proxy;
        },
      },
    );
    return proxy;
  }

  const mock = {
    from: vi.fn((table: string) => {
      // --- tracking_geofence_events ---
      if (table === "tracking_geofence_events") {
        return {
          upsert: vi.fn(() => ({
            select: vi.fn(() => ({
              data: insertReturns,
              error: null,
            })),
          })),
          select: vi.fn(() => {
            // existing event lookup for dedup path
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockReturnValue({
                    data: existingEvent,
                    error: null,
                  }),
                }),
              }),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            const filters: Record<string, unknown> = {};
            const eqFn = vi.fn((field: string, value: unknown) => {
              filters[field] = value;
              // Capture on last eq call (event_id)
              if (field === "event_id") {
                eventUpdates.push({ payload, filters: { ...filters } });
              }
              return { eq: eqFn, error: null };
            });
            return { eq: eqFn };
          }),
        };
      }

      // --- routes ---
      if (table === "routes") {
        return chain({ id: "route-1" });
      }

      // --- route_runs ---
      if (table === "route_runs") {
        return {
          upsert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { id: "run-1" },
                error: null,
              })),
            })),
          })),
        };
      }

      // --- route_shifts ---
      if (table === "route_shifts") {
        // Recursive proxy: any method returns self, maybeSingle terminates
        const shiftProxy: unknown = new Proxy(
          {},
          {
            get(_t, prop) {
              if (prop === "then") return undefined;
              if (prop === "maybeSingle")
                return () => ({ data: activeShift, error: null });
              return () => shiftProxy;
            },
          },
        );
        return shiftProxy;
      }

      // --- route_run_stops ---
      if (table === "route_run_stops") {
        return {
          select: vi.fn((selectStr: string) => {
            // Dedup path: status check on matched stop
            if (selectStr === "status") {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockReturnValue({
                      data: { status: matchedStopStatus },
                      error: null,
                    }),
                  }),
                }),
              };
            }
            // Pending stops query (joined with schedule_entries)
            const proxy: unknown = new Proxy(
              {},
              {
                get(_t, prop) {
                  if (prop === "then") return undefined;
                  if (prop === "data") return pendingStops;
                  if (prop === "error") return null;
                  return () => proxy;
                },
              },
            );
            return proxy;
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            let captured = false;
            const filters: Record<string, unknown> = {};
            // Recursive eq chain — captures the update once, supports N .eq() calls
            function makeEq(): (field: string, value: unknown) => { eq: ReturnType<typeof makeEq>; error: null } {
              return (field: string, value: unknown) => {
                filters[field] = value;
                if (!captured) {
                  captured = true;
                  stopUpdates.push({
                    table: "route_run_stops",
                    payload: { ...payload },
                    filters, // shared ref — final snapshot after all eq calls
                  });
                }
                return { eq: makeEq(), error: null };
              };
            }
            return { eq: makeEq() };
          }),
        };
      }

      // --- van_location_pings ---
      if (table === "van_location_pings") {
        const proxy: unknown = new Proxy(
          {},
          {
            get(_t, prop) {
              if (prop === "then") return undefined;
              if (prop === "data") return recentPings;
              if (prop === "error") return null;
              return () => proxy;
            },
          },
        );
        return proxy;
      }

      return chain(null);
    }),
    _stopUpdates: stopUpdates,
    _eventUpdates: eventUpdates,
  };

  return mock;
}

// Helper to build a pending stop entry
function pendingStop(
  id: string,
  arrivalTime: string,
  groupId: string | null = placeId,
  radius = 50,
  seq = 1,
) {
  return {
    schedule_entry_id: id,
    schedule_entries: {
      arrival_time: arrivalTime,
      departure_time: arrivalTime,
      stop_lat: stopLat,
      stop_lng: stopLng,
      stop_group_id: groupId,
      geofence_radius_m: radius,
      stop_sequence: seq,
    },
  };
}

describe("processDeviceGeofenceEvents", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("marks a pending stop as passed with device_geofence source", async () => {
    const mock = createMockSupabase({
      activeShift: { id: "shift-1" },
      pendingStops: [pendingStop("entry-1350", "13:50")],
      recentPings: [],
    });

    const result = await processDeviceGeofenceEvents({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      geofenceEvents: [{ placeId, enteredAt, eventId: "ev-1" }],
    });

    expect(result).toContain("ev-1");
    expect(mock._stopUpdates).toHaveLength(1);
    expect(mock._stopUpdates[0].payload).toMatchObject({
      status: "passed",
      pass_source: "device_geofence",
      pass_confidence: 0.9,
    });
    expect(mock._stopUpdates[0].filters).toMatchObject({
      schedule_entry_id: "entry-1350",
    });
    // Event ledger updated to matched
    expect(mock._eventUpdates).toHaveLength(1);
    expect(mock._eventUpdates[0].payload).toMatchObject({
      status: "matched",
      matched_run_id: "run-1",
      matched_schedule_entry_id: "entry-1350",
    });
  });

  it("sets no_match when no active shift exists", async () => {
    const mock = createMockSupabase({
      activeShift: null,
      pendingStops: [pendingStop("entry-1350", "13:50")],
    });

    const result = await processDeviceGeofenceEvents({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      geofenceEvents: [{ placeId, enteredAt, eventId: "ev-no-shift" }],
    });

    expect(result).toHaveLength(0);
    expect(mock._stopUpdates).toHaveLength(0);
    // Event should be updated to no_match
    expect(mock._eventUpdates).toHaveLength(1);
    expect(mock._eventUpdates[0].payload).toMatchObject({ status: "no_match" });
  });

  it("is idempotent for duplicate eventId when stop is still passed", async () => {
    const mock = createMockSupabase({
      insertReturns: [], // empty = duplicate, ON CONFLICT ignored
      existingEvent: {
        status: "matched",
        matched_schedule_entry_id: "entry-1350",
        matched_run_id: "run-1",
      },
      matchedStopStatus: "passed", // still passed
      activeShift: { id: "shift-1" },
      pendingStops: [pendingStop("entry-1350", "13:50")],
    });

    const result = await processDeviceGeofenceEvents({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      geofenceEvents: [{ placeId, enteredAt, eventId: "ev-dup" }],
    });

    // Should add to tentativeMatchIds without re-processing
    expect(result).toContain("ev-dup");
    // No new stop updates since it short-circuits
    expect(mock._stopUpdates).toHaveLength(0);
    expect(mock._eventUpdates).toHaveLength(0);
  });

  it("re-processes a healed event when stop reverted to pending", async () => {
    const mock = createMockSupabase({
      insertReturns: [], // duplicate
      existingEvent: {
        status: "matched",
        matched_schedule_entry_id: "entry-1350",
        matched_run_id: "run-1",
      },
      matchedStopStatus: "pending", // healed back to pending
      activeShift: { id: "shift-1" },
      pendingStops: [pendingStop("entry-1350", "13:50")],
      recentPings: [],
    });

    const result = await processDeviceGeofenceEvents({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      geofenceEvents: [{ placeId, enteredAt, eventId: "ev-healed" }],
    });

    // Should re-process and match again
    expect(result).toContain("ev-healed");
    expect(mock._stopUpdates).toHaveLength(1);
    expect(mock._stopUpdates[0].payload).toMatchObject({
      status: "passed",
      pass_source: "device_geofence",
    });
  });

  it("adds GPS corroboration confidence bonus when ping is within radius", async () => {
    // Ping ~5m from stop, well within 50m geofence
    const nearPing = { lat: -12.97143, lng: -38.51237 };

    const mock = createMockSupabase({
      activeShift: { id: "shift-1" },
      pendingStops: [pendingStop("entry-1350", "13:50")],
      recentPings: [nearPing],
    });

    const result = await processDeviceGeofenceEvents({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      geofenceEvents: [{ placeId, enteredAt, eventId: "ev-gps" }],
    });

    expect(result).toContain("ev-gps");
    expect(mock._stopUpdates[0].payload.pass_confidence).toBe(0.95);
  });

  it("backfills gap-1 preceding pending stop at confidence 0.80", async () => {
    const mock = createMockSupabase({
      activeShift: { id: "shift-1" },
      pendingStops: [
        pendingStop("entry-1340", "13:40", null, 50, 1), // preceding stop, different place
        pendingStop("entry-1350", "13:50", placeId, 50, 2), // matched stop
      ],
      recentPings: [],
    });

    const result = await processDeviceGeofenceEvents({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      geofenceEvents: [{ placeId, enteredAt, eventId: "ev-gap" }],
    });

    expect(result).toContain("ev-gap");
    // Two updates: the matched stop + the backfilled stop
    expect(mock._stopUpdates).toHaveLength(2);

    const matchedUpdate = mock._stopUpdates.find(
      (u) => u.filters.schedule_entry_id === "entry-1350",
    );
    expect(matchedUpdate?.payload).toMatchObject({
      status: "passed",
      pass_source: "device_geofence",
      pass_confidence: 0.9,
    });

    const backfillUpdate = mock._stopUpdates.find(
      (u) => u.filters.schedule_entry_id === "entry-1340",
    );
    expect(backfillUpdate?.payload).toMatchObject({
      status: "passed",
      pass_source: "backfill",
      pass_confidence: 0.8,
    });
  });

  it("picks the closest-in-time stop when placeId repeats", async () => {
    // Two pending stops at same place, event at 13:50 is closer to the 14:00 one
    const laterEventTime = DateTime.fromObject(
      { hour: 13, minute: 55, second: 0 },
      { zone: TZ },
    );
    const laterEnteredAt = laterEventTime.toMillis();

    const mock = createMockSupabase({
      activeShift: { id: "shift-1" },
      pendingStops: [
        pendingStop("entry-1300", "13:00", placeId, 50, 1), // 55 min ago
        pendingStop("entry-1400", "14:00", placeId, 50, 2), // 5 min ahead
      ],
      recentPings: [],
    });

    const result = await processDeviceGeofenceEvents({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      geofenceEvents: [
        { placeId, enteredAt: laterEnteredAt, eventId: "ev-closest" },
      ],
    });

    expect(result).toContain("ev-closest");
    expect(mock._stopUpdates.length).toBeGreaterThanOrEqual(1);
    const mainUpdate = mock._stopUpdates.find(
      (u) => u.payload.pass_source === "device_geofence",
    );
    expect(mainUpdate?.filters.schedule_entry_id).toBe("entry-1400");
  });

  it("returns no_match when event is outside the early arrival window", async () => {
    // Event at 13:10, stop at 13:50 => 40 min early, beyond 30-min window
    const earlyEventTime = DateTime.fromObject(
      { hour: 13, minute: 10, second: 0 },
      { zone: TZ },
    );
    const earlyEnteredAt = earlyEventTime.toMillis();

    const mock = createMockSupabase({
      activeShift: { id: "shift-1" },
      pendingStops: [pendingStop("entry-1350", "13:50")],
      recentPings: [],
    });

    const result = await processDeviceGeofenceEvents({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      geofenceEvents: [
        { placeId, enteredAt: earlyEnteredAt, eventId: "ev-early" },
      ],
    });

    expect(result).toHaveLength(0);
    expect(mock._stopUpdates).toHaveLength(0);
    expect(mock._eventUpdates).toHaveLength(1);
    expect(mock._eventUpdates[0].payload).toMatchObject({ status: "no_match" });
  });

  it("re-processes a previously no_match event when conditions recover", async () => {
    // Event was no_match (e.g. no shift at first delivery), now shift exists
    const mock = createMockSupabase({
      insertReturns: [], // duplicate
      existingEvent: {
        status: "no_match",
        matched_schedule_entry_id: null,
        matched_run_id: null,
      },
      activeShift: { id: "shift-1" },
      pendingStops: [pendingStop("entry-1350", "13:50")],
      recentPings: [],
    });

    const result = await processDeviceGeofenceEvents({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      geofenceEvents: [{ placeId, enteredAt, eventId: "ev-retry" }],
    });

    // Should now match after re-processing
    expect(result).toContain("ev-retry");
    expect(mock._stopUpdates).toHaveLength(1);
    expect(mock._stopUpdates[0].payload).toMatchObject({
      status: "passed",
      pass_source: "device_geofence",
    });
  });
});
