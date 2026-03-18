/// <reference types="vitest/globals" />
import { evaluatePendingCorroborations } from "@/lib/tracking/evaluate-pending-corroborations";

vi.mock("@/lib/tracking/persist-canonical-progress", () => ({
  persistCanonicalProgress: vi.fn().mockResolvedValue({
    contiguousPassedIds: new Set(),
    healIds: [],
    lastPassedStopId: null,
    nextStopId: null,
  }),
}));

vi.mock("@/lib/tracking/seed-route-run-stops", () => ({
  seedRouteRunStops: vi.fn().mockResolvedValue(false),
}));

const stopLat = -12.9714;
const stopLng = -38.5124;
const vanId = "van-1";
const eventReceivedAt = "2026-03-18T16:00:00.000Z";

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
  awaitingEvents?: Array<{
    event_id: string;
    matched_run_id: string;
    matched_schedule_entry_id: string;
    received_at: string;
  }>;
  stopEntry?: {
    stop_lat: number;
    stop_lng: number;
    geofence_radius_m: number;
  } | null;
  firstPendingStopId?: string;
  pingsAfterEvent?: Array<{ id: string }>;
  anyPings?: Array<{ id: string }>;
  shifts?: Array<{ run_id: string; started_at: string }>;
}) {
  const {
    awaitingEvents = [],
    stopEntry = { stop_lat: stopLat, stop_lng: stopLng, geofence_radius_m: 50 },
    firstPendingStopId = "entry-1",
    pingsAfterEvent = [],
    anyPings = [],
    shifts = [{ run_id: "run-1", started_at: "2026-03-18T12:00:00.000Z" }],
  } = opts;

  const stopUpdates: StopUpdate[] = [];
  const eventUpdates: EventUpdate[] = [];

  const mock = {
    from: vi.fn((table: string) => {
      // --- tracking_geofence_events ---
      if (table === "tracking_geofence_events") {
        return {
          select: vi.fn(() => {
            // .eq("van_id",...).eq("status","awaiting_corroboration").order(...)
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    data: awaitingEvents,
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
              if (field === "event_id") {
                eventUpdates.push({ payload, filters: { ...filters } });
              }
              return { eq: eqFn, error: null };
            });
            return { eq: eqFn };
          }),
        };
      }

      // --- route_shifts (P1: shift start lookup) ---
      if (table === "route_shifts") {
        const proxy: unknown = new Proxy(
          {},
          {
            get(_t, prop) {
              if (prop === "then") return undefined;
              if (prop === "data") return shifts;
              if (prop === "error") return null;
              return () => proxy;
            },
          },
        );
        return proxy;
      }

      // --- schedule_entries ---
      if (table === "schedule_entries") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockReturnValue({
                data: stopEntry,
                error: null,
              }),
            }),
          })),
        };
      }

      // --- route_run_stops ---
      if (table === "route_run_stops") {
        return {
          select: vi.fn(() => {
            // Pending stops query: .eq("run_id",...).eq("status","pending").order(...).limit(1)
            const pendingResult = firstPendingStopId
              ? [
                  {
                    schedule_entry_id: firstPendingStopId,
                    schedule_entries: { stop_sequence: 1 },
                  },
                ]
              : [];
            const proxy: unknown = new Proxy(
              {},
              {
                get(_t, prop) {
                  if (prop === "then") return undefined;
                  if (prop === "data") return pendingResult;
                  if (prop === "error") return null;
                  return () => proxy;
                },
              },
            );
            return proxy;
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            const filters: Record<string, unknown> = {};
            const eqFn = vi.fn((field: string, value: unknown) => {
              filters[field] = value;
              if (field === "schedule_entry_id") {
                stopUpdates.push({
                  table: "route_run_stops",
                  payload: { ...payload },
                  filters: { ...filters },
                });
              }
              return { eq: eqFn, error: null };
            });
            return { eq: eqFn };
          }),
        };
      }

      // --- van_location_pings ---
      if (table === "van_location_pings") {
        // Build a proxy that detects whether .gt() is called (pingsAfterEvent)
        // or .gte() / neither (anyPings scoped to shift).
        let usesGt = false;
        const resolveData = () =>
          usesGt ? pingsAfterEvent : anyPings;

        const proxy: unknown = new Proxy(
          {},
          {
            get(_t, prop) {
              if (prop === "then") return undefined;
              if (prop === "data") return resolveData();
              if (prop === "error") return null;
              if (prop === "gt") {
                return () => {
                  usesGt = true;
                  return proxy;
                };
              }
              // select, eq, gte, limit all chain
              return () => proxy;
            },
          },
        );
        return proxy;
      }

      // Fallback: generic chain proxy
      const fallback: unknown = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") return undefined;
            if (prop === "single" || prop === "maybeSingle")
              return () => ({ data: null, error: null });
            return () => fallback;
          },
        },
      );
      return fallback;
    }),
    _stopUpdates: stopUpdates,
    _eventUpdates: eventUpdates,
  };

  return mock;
}

describe("evaluatePendingCorroborations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("ping within geofence_radius_m confirms stop at 0.95 with ping timestamp", async () => {
    const pingReceivedAt = "2026-03-18T16:00:10.000Z";
    const mock = createMockSupabase({
      awaitingEvents: [
        {
          event_id: "ev-1",
          matched_run_id: "run-1",
          matched_schedule_entry_id: "entry-1",
          received_at: eventReceivedAt,
        },
      ],
      stopEntry: {
        stop_lat: stopLat,
        stop_lng: stopLng,
        geofence_radius_m: 50,
      },
      firstPendingStopId: "entry-1",
    });

    // Ping ~5m from stop
    const result = await evaluatePendingCorroborations({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      pingLat: -12.97143,
      pingLng: -38.51237,
      pingReceivedAt,
    });

    expect(result).toEqual(["ev-1"]);
    expect(mock._stopUpdates).toHaveLength(1);
    expect(mock._stopUpdates[0].payload).toMatchObject({
      status: "passed",
      pass_source: "device_geofence",
      pass_confidence: 0.95,
      passed_at: pingReceivedAt,
    });
    expect(mock._stopUpdates[0].filters).toMatchObject({
      schedule_entry_id: "entry-1",
    });
    expect(mock._eventUpdates).toHaveLength(1);
    expect(mock._eventUpdates[0].payload).toMatchObject({
      status: "matched",
    });
  });

  it("ping outside geofence_radius_m keeps event as awaiting_corroboration", async () => {
    const mock = createMockSupabase({
      awaitingEvents: [
        {
          event_id: "ev-1",
          matched_run_id: "run-1",
          matched_schedule_entry_id: "entry-1",
          received_at: eventReceivedAt,
        },
      ],
      stopEntry: {
        stop_lat: stopLat,
        stop_lng: stopLng,
        geofence_radius_m: 50,
      },
      firstPendingStopId: "entry-1",
      pingsAfterEvent: [{ id: "p-1" }], // GPS is alive
    });

    // Ping ~303m from stop
    const result = await evaluatePendingCorroborations({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      pingLat: -12.97,
      pingLng: -38.51,
      pingReceivedAt: "2026-03-18T16:00:10.000Z",
    });

    expect(result).toEqual([]);
    expect(mock._stopUpdates).toHaveLength(0);
    expect(mock._eventUpdates).toHaveLength(0);
  });

  it("contiguous-prefix guard: only head-of-line stop confirmed", async () => {
    const mock = createMockSupabase({
      awaitingEvents: [
        {
          event_id: "ev-1",
          matched_run_id: "run-1",
          matched_schedule_entry_id: "entry-2", // not head-of-line
          received_at: eventReceivedAt,
        },
      ],
      stopEntry: {
        stop_lat: stopLat,
        stop_lng: stopLng,
        geofence_radius_m: 50,
      },
      firstPendingStopId: "entry-1", // different from matched
    });

    const result = await evaluatePendingCorroborations({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      pingLat: -12.97143,
      pingLng: -38.51237,
      pingReceivedAt: "2026-03-18T16:00:10.000Z",
    });

    expect(result).toEqual([]);
    expect(mock._stopUpdates).toHaveLength(0);
    expect(mock._eventUpdates).toHaveLength(0);
  });

  it("multiple awaiting events — only first-pending confirmed", async () => {
    const mock = createMockSupabase({
      awaitingEvents: [
        {
          event_id: "ev-1",
          matched_run_id: "run-1",
          matched_schedule_entry_id: "entry-1",
          received_at: eventReceivedAt,
        },
        {
          event_id: "ev-2",
          matched_run_id: "run-1",
          matched_schedule_entry_id: "entry-2",
          received_at: eventReceivedAt,
        },
      ],
      stopEntry: {
        stop_lat: stopLat,
        stop_lng: stopLng,
        geofence_radius_m: 50,
      },
      firstPendingStopId: "entry-1", // only entry-1 is head-of-line
    });

    // Ping within 50m of stop
    const result = await evaluatePendingCorroborations({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      pingLat: -12.97143,
      pingLng: -38.51237,
      pingReceivedAt: "2026-03-18T16:00:10.000Z",
    });

    // Only ev-1 confirmed (head-of-line), ev-2 skipped by prefix guard
    expect(result).toEqual(["ev-1"]);
    expect(mock._stopUpdates).toHaveLength(1);
    expect(mock._stopUpdates[0].filters).toMatchObject({
      schedule_entry_id: "entry-1",
    });
  });

  it("already-passed stops skipped idempotently", async () => {
    const mock = createMockSupabase({
      awaitingEvents: [
        {
          event_id: "ev-1",
          matched_run_id: "run-1",
          matched_schedule_entry_id: "entry-1",
          received_at: eventReceivedAt,
        },
      ],
      stopEntry: {
        stop_lat: stopLat,
        stop_lng: stopLng,
        geofence_radius_m: 50,
      },
      firstPendingStopId: "", // empty string — pendingStops returns empty array
    });

    const result = await evaluatePendingCorroborations({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      pingLat: -12.97143,
      pingLng: -38.51237,
      pingReceivedAt: "2026-03-18T16:00:10.000Z",
    });

    expect(result).toEqual([]);
    expect(mock._stopUpdates).toHaveLength(0);
    expect(mock._eventUpdates).toHaveLength(0);
  });

  it("staleness fallback: no ping after event receipt + 30s elapsed confirms at 0.90 with ping timestamp", async () => {
    // pingReceivedAt = 35 seconds after eventReceivedAt
    const pingReceivedAt = "2026-03-18T16:00:35.000Z";

    const mock = createMockSupabase({
      awaitingEvents: [
        {
          event_id: "ev-1",
          matched_run_id: "run-1",
          matched_schedule_entry_id: "entry-1",
          received_at: eventReceivedAt,
        },
      ],
      stopEntry: {
        stop_lat: stopLat,
        stop_lng: stopLng,
        geofence_radius_m: 50,
      },
      firstPendingStopId: "entry-1",
      pingsAfterEvent: [], // no pings after event
      anyPings: [{ id: "p-old" }], // some pings exist in current shift
    });

    // Ping far from stop — GPS distance doesn't matter, staleness takes over
    const result = await evaluatePendingCorroborations({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      pingLat: -12.97,
      pingLng: -38.51,
      pingReceivedAt,
    });

    expect(result).toEqual(["ev-1"]);
    expect(mock._stopUpdates).toHaveLength(1);
    expect(mock._stopUpdates[0].payload).toMatchObject({
      status: "passed",
      pass_source: "device_geofence",
      pass_confidence: 0.9,
      passed_at: pingReceivedAt,
    });
    expect(mock._eventUpdates).toHaveLength(1);
    expect(mock._eventUpdates[0].payload).toMatchObject({
      status: "matched",
    });
  });

  it("no staleness yet: no ping after event receipt + only 20s elapsed stays awaiting", async () => {
    // pingReceivedAt = 20 seconds after eventReceivedAt
    const pingReceivedAt = "2026-03-18T16:00:20.000Z";

    const mock = createMockSupabase({
      awaitingEvents: [
        {
          event_id: "ev-1",
          matched_run_id: "run-1",
          matched_schedule_entry_id: "entry-1",
          received_at: eventReceivedAt,
        },
      ],
      stopEntry: {
        stop_lat: stopLat,
        stop_lng: stopLng,
        geofence_radius_m: 50,
      },
      firstPendingStopId: "entry-1",
      pingsAfterEvent: [], // no pings after event
      anyPings: [{ id: "p-old" }], // some pings exist in current shift
    });

    // Ping far from stop
    const result = await evaluatePendingCorroborations({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      pingLat: -12.97,
      pingLng: -38.51,
      pingReceivedAt,
    });

    expect(result).toEqual([]);
    expect(mock._stopUpdates).toHaveLength(0);
    expect(mock._eventUpdates).toHaveLength(0);
  });

  it("GPS alive but far: pings exist after event receipt but >50m stays awaiting", async () => {
    const mock = createMockSupabase({
      awaitingEvents: [
        {
          event_id: "ev-1",
          matched_run_id: "run-1",
          matched_schedule_entry_id: "entry-1",
          received_at: eventReceivedAt,
        },
      ],
      stopEntry: {
        stop_lat: stopLat,
        stop_lng: stopLng,
        geofence_radius_m: 50,
      },
      firstPendingStopId: "entry-1",
      pingsAfterEvent: [{ id: "p-1" }], // GPS is alive
    });

    // Ping ~303m from stop
    const result = await evaluatePendingCorroborations({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      pingLat: -12.97,
      pingLng: -38.51,
      pingReceivedAt: "2026-03-18T16:00:10.000Z",
    });

    expect(result).toEqual([]);
    expect(mock._stopUpdates).toHaveLength(0);
    expect(mock._eventUpdates).toHaveLength(0);
  });

  it("no GPS pings in current shift confirms at 0.85 with ping timestamp", async () => {
    const pingReceivedAt = "2026-03-18T16:00:10.000Z";

    const mock = createMockSupabase({
      awaitingEvents: [
        {
          event_id: "ev-1",
          matched_run_id: "run-1",
          matched_schedule_entry_id: "entry-1",
          received_at: eventReceivedAt,
        },
      ],
      stopEntry: {
        stop_lat: stopLat,
        stop_lng: stopLng,
        geofence_radius_m: 50,
      },
      firstPendingStopId: "entry-1",
      pingsAfterEvent: [], // no pings after event
      anyPings: [], // zero pings in current shift
    });

    // Ping far from stop — doesn't matter
    const result = await evaluatePendingCorroborations({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      pingLat: -12.97,
      pingLng: -38.51,
      pingReceivedAt,
    });

    expect(result).toEqual(["ev-1"]);
    expect(mock._stopUpdates).toHaveLength(1);
    expect(mock._stopUpdates[0].payload).toMatchObject({
      status: "passed",
      pass_source: "device_geofence",
      pass_confidence: 0.85,
      passed_at: pingReceivedAt,
    });
    expect(mock._eventUpdates).toHaveLength(1);
    expect(mock._eventUpdates[0].payload).toMatchObject({
      status: "matched",
    });
  });

  it("staleness + contiguous-prefix: only confirms head-of-line even via fallback", async () => {
    // pingReceivedAt = 35 seconds after eventReceivedAt (staleness met)
    const pingReceivedAt = "2026-03-18T16:00:35.000Z";

    const mock = createMockSupabase({
      awaitingEvents: [
        {
          event_id: "ev-1",
          matched_run_id: "run-1",
          matched_schedule_entry_id: "entry-1",
          received_at: eventReceivedAt,
        },
        {
          event_id: "ev-2",
          matched_run_id: "run-1",
          matched_schedule_entry_id: "entry-2",
          received_at: eventReceivedAt,
        },
      ],
      stopEntry: {
        stop_lat: stopLat,
        stop_lng: stopLng,
        geofence_radius_m: 50,
      },
      firstPendingStopId: "entry-1", // only entry-1 is head-of-line
      pingsAfterEvent: [], // no pings after event
      anyPings: [{ id: "p-old" }], // some pings exist in current shift
    });

    // Ping far from stop — staleness fallback
    const result = await evaluatePendingCorroborations({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      pingLat: -12.97,
      pingLng: -38.51,
      pingReceivedAt,
    });

    // Only ev-1 confirmed (head-of-line), ev-2 skipped by prefix guard
    expect(result).toEqual(["ev-1"]);
    expect(mock._stopUpdates).toHaveLength(1);
    expect(mock._stopUpdates[0].payload).toMatchObject({
      pass_confidence: 0.9,
    });
    expect(mock._stopUpdates[0].filters).toMatchObject({
      schedule_entry_id: "entry-1",
    });
  });

  it("returns empty when no awaiting events exist", async () => {
    const mock = createMockSupabase({
      awaitingEvents: [],
    });

    const result = await evaluatePendingCorroborations({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: mock as any,
      vanId,
      pingLat: -12.97143,
      pingLng: -38.51237,
      pingReceivedAt: "2026-03-18T16:00:10.000Z",
    });

    expect(result).toEqual([]);
    expect(mock._stopUpdates).toHaveLength(0);
    expect(mock._eventUpdates).toHaveLength(0);
  });
});
