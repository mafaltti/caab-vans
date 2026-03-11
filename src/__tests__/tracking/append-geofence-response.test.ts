/// <reference types="vitest/globals" />
import { appendGeofenceResponse } from "@/app/api/tracking/[vanId]/route";

// --- Mock Supabase builder ---

interface ConfirmedEvent {
  event_id: string;
  matched_schedule_entry_id: string | null;
  matched_run_id: string | null;
}

interface RunStop {
  schedule_entry_id: string;
  status: "pending" | "passed";
  schedule_entries: { stop_sequence: number };
}

interface MockOptions {
  confirmedEvents?: ConfirmedEvent[];
  runStops?: Record<string, RunStop[]>;
  routeId?: string | null;
  configVersion?: string | null;
}

function createMockSupabase(opts: MockOptions) {
  const {
    confirmedEvents = [],
    runStops = {},
    routeId = "route-1",
    configVersion = "2026-01-01T00:00:00Z",
  } = opts;

  function chain(result: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxy: any = new Proxy(
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

  // Track which run_id is being queried for route_run_stops
  let currentRunId: string | null = null;

  const mock = {
    from: vi.fn((table: string) => {
      // --- tracking_geofence_events ---
      if (table === "tracking_geofence_events") {
        // Build a chainable that resolves to confirmedEvents
        // Chain: .select().eq("van_id", ...).in("event_id", ...).eq("status", ...)
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  data: confirmedEvents,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      // --- route_run_stops ---
      if (table === "route_run_stops") {
        // Chain: .select(...).eq("run_id", runId).order(...)
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_field: string, value: string) => {
              currentRunId = value;
              return {
                order: vi.fn(() => ({
                  data: runStops[currentRunId ?? ""] ?? [],
                  error: null,
                })),
              };
            }),
          })),
        };
      }

      // --- routes (for appendConfigVersion) ---
      if (table === "routes") {
        return chain(routeId ? { id: routeId } : null);
      }

      // --- schedule_entries (for appendConfigVersion) ---
      if (table === "schedule_entries") {
        // Chain: .select("updated_at").eq("route_id", ...).order(...).limit(...)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entryProxy: any = new Proxy(
          {},
          {
            get(_t, prop) {
              if (prop === "then") return undefined;
              if (prop === "data")
                return configVersion ? [{ updated_at: configVersion }] : [];
              if (prop === "error") return null;
              return () => entryProxy;
            },
          },
        );
        return entryProxy;
      }

      return chain(null);
    }),
  };

  return mock;
}

describe("appendGeofenceResponse", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("non-contiguous matched stop excluded from processedEventIds (T009)", async () => {
    // Event matched to stop B (seq 2), but stop A (seq 1) is pending.
    // B is passed but not in the contiguous prefix, so it should be excluded.
    const mock = createMockSupabase({
      confirmedEvents: [
        {
          event_id: "ev-b",
          matched_schedule_entry_id: "stop-B",
          matched_run_id: "run-1",
        },
      ],
      runStops: {
        "run-1": [
          {
            schedule_entry_id: "stop-A",
            status: "pending",
            schedule_entries: { stop_sequence: 1 },
          },
          {
            schedule_entry_id: "stop-B",
            status: "passed",
            schedule_entries: { stop_sequence: 2 },
          },
          {
            schedule_entry_id: "stop-C",
            status: "pending",
            schedule_entries: { stop_sequence: 3 },
          },
        ],
      },
    });

    const response: Record<string, unknown> = {};
    await appendGeofenceResponse(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      ["ev-b"],
      response,
    );

    expect(response.processedEventIds).toEqual([]);
  });

  it("contiguous matched stops included in processedEventIds (T010)", async () => {
    // Events matched to stops A (seq 1) and B (seq 2), both passed.
    // Contiguous prefix includes A and B, so both should be included.
    const mock = createMockSupabase({
      confirmedEvents: [
        {
          event_id: "ev-a",
          matched_schedule_entry_id: "stop-A",
          matched_run_id: "run-1",
        },
        {
          event_id: "ev-b",
          matched_schedule_entry_id: "stop-B",
          matched_run_id: "run-1",
        },
      ],
      runStops: {
        "run-1": [
          {
            schedule_entry_id: "stop-A",
            status: "passed",
            schedule_entries: { stop_sequence: 1 },
          },
          {
            schedule_entry_id: "stop-B",
            status: "passed",
            schedule_entries: { stop_sequence: 2 },
          },
          {
            schedule_entry_id: "stop-C",
            status: "pending",
            schedule_entries: { stop_sequence: 3 },
          },
        ],
      },
    });

    const response: Record<string, unknown> = {};
    await appendGeofenceResponse(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      ["ev-a", "ev-b"],
      response,
    );

    expect(response.processedEventIds).toEqual(
      expect.arrayContaining(["ev-a", "ev-b"]),
    );
    expect(response.processedEventIds).toHaveLength(2);
  });

  it("duplicate ping with non-contiguous stop returns empty processedEventIds (T011)", async () => {
    // Event matched to stop C (seq 3), but stop B (seq 2) is pending.
    // C is passed but not in contiguous prefix (B breaks it).
    const mock = createMockSupabase({
      confirmedEvents: [
        {
          event_id: "ev-c",
          matched_schedule_entry_id: "stop-C",
          matched_run_id: "run-1",
        },
      ],
      runStops: {
        "run-1": [
          {
            schedule_entry_id: "stop-A",
            status: "passed",
            schedule_entries: { stop_sequence: 1 },
          },
          {
            schedule_entry_id: "stop-B",
            status: "pending",
            schedule_entries: { stop_sequence: 2 },
          },
          {
            schedule_entry_id: "stop-C",
            status: "passed",
            schedule_entries: { stop_sequence: 3 },
          },
        ],
      },
    });

    const response: Record<string, unknown> = {};
    await appendGeofenceResponse(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mock as any,
      "van-1",
      ["ev-c"],
      response,
    );

    expect(response.processedEventIds).toEqual([]);
  });
});
