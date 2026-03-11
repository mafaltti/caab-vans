/// <reference types="vitest/globals" />

// Mock Supabase server client
const mockFrom = vi.fn();
const mockRpc = vi.fn().mockResolvedValue({ data: true, error: null });
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

// Mock snapToRoad and matchTrajectory
const mockSnapToRoad = vi.fn().mockResolvedValue(null);
const mockMatchTrajectory = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/tracking/osrm", () => ({
  snapToRoad: (...args: unknown[]) => mockSnapToRoad(...args),
  matchTrajectory: (...args: unknown[]) => mockMatchTrajectory(...args),
}));

// Mock rate limiter
vi.mock("@/lib/api/rate-limit", () => ({
  createRateLimiter: () => () => ({ allowed: true }),
}));

import { POST } from "@/app/api/tracking-batch/[vanId]/route";

const VAN_ID = "a0eebc99-9c0b-4ef8-ab6d-6bb9bd380a11";
const DEVICE_ID = "b0eebc99-9c0b-4ef8-ab6d-6bb9bd380a22";
const INGESTION_TOKEN = "test-token";

function createRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/tracking-batch/${VAN_ID}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ingestion-token": INGESTION_TOKEN,
    },
    body: JSON.stringify(body),
  });
}

function validPoint(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    deviceId: DEVICE_ID,
    lat: -12.97,
    lng: -38.51,
    accuracy: 5,
    speed: 10,
    heading: 90,
    ts: Date.now(),
    ...overrides,
  };
}

// Track upserted ping IDs to distinguish accepted vs duplicate
let upsertCounter = 0;

function setupMocks(opts: {
  vanExists?: boolean;
  duplicateIndices?: number[];
}) {
  const { vanExists = true, duplicateIndices = [] } = opts;

  upsertCounter = 0;

  mockFrom.mockImplementation((table: string) => {
    if (table === "vans") {
      if (vanExists) {
        return {
          select: () => ({
            eq: () => ({
              single: () => ({
                data: { id: VAN_ID, ingestion_token: INGESTION_TOKEN },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            single: () => ({
              data: null,
              error: { code: "PGRST116", message: "Not found" },
            }),
          }),
        }),
      };
    }
    if (table === "van_location_pings") {
      return {
        upsert: () => ({
          select: () => ({
            single: () => {
              const idx = upsertCounter++;
              if (duplicateIndices.includes(idx)) {
                return {
                  data: null,
                  error: { code: "PGRST116", message: "No rows returned" },
                };
              }
              return {
                data: { id: `ping-${idx}` },
                error: null,
              };
            },
          }),
        }),
        update: () => ({
          eq: () => ({ error: null }),
        }),
        select: () => ({
          eq: () => ({
            lte: () => ({
              order: () => ({
                limit: () => ({
                  data: [],
                  error: null,
                }),
              }),
            }),
            order: () => ({
              limit: () => ({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({ single: () => ({ data: null, error: null }) }),
      }),
    };
  });
}

const routeParams = { params: Promise.resolve({ vanId: VAN_ID }) };

describe("batch ping ingestion does not call inferStopProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores pings and updates van position without mutating stop progress", async () => {
    const now = Date.now();
    const ts1 = now - 30_000;
    const ts2 = now - 10_000;

    setupMocks({});
    mockRpc.mockResolvedValue({ data: true, error: null });

    const body = {
      points: [
        validPoint({ ts: ts1, lat: -12.971, lng: -38.511 }),
        validPoint({ ts: ts2, lat: -12.980, lng: -38.520 }),
      ],
    };

    const req = createRequest(body);
    const res = await POST(req as never, routeParams);
    const json = await res.json();

    expect(json.received).toBe(2);
    expect(json.duplicates).toBe(0);

    // Van position is updated via RPC
    expect(mockRpc).toHaveBeenCalledWith(
      "update_van_position",
      expect.objectContaining({ p_van_id: VAN_ID }),
    );

    // No stop progress mutations: route_run_stops and route_runs are NOT touched
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0]);
    expect(fromCalls).not.toContain("route_run_stops");
    expect(fromCalls).not.toContain("route_runs");
  });

  it("does not call inferStopProgress even when RPC returns false", async () => {
    setupMocks({});
    mockRpc.mockResolvedValue({ data: false, error: null });

    const body = {
      points: [validPoint({ ts: Date.now() - 10_000 })],
    };

    const req = createRequest(body);
    const res = await POST(req as never, routeParams);
    const json = await res.json();

    expect(json.received).toBe(1);

    // Only vans and van_location_pings tables are accessed
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0]);
    expect(fromCalls).toContain("vans");
    expect(fromCalls).toContain("van_location_pings");
    expect(fromCalls).not.toContain("route_run_stops");
    expect(fromCalls).not.toContain("route_runs");
  });

  it("handles duplicates without touching stop progress", async () => {
    setupMocks({ duplicateIndices: [0, 1] });
    mockRpc.mockResolvedValue({ data: true, error: null });

    const body = {
      points: [
        validPoint({ ts: Date.now() - 30_000 }),
        validPoint({ ts: Date.now() - 10_000 }),
      ],
    };

    const req = createRequest(body);
    const res = await POST(req as never, routeParams);
    const json = await res.json();

    expect(json.duplicates).toBe(2);
    expect(json.received).toBe(2); // received = total input - skipped (stale)

    // No RPC call (no accepted pings)
    expect(mockRpc).not.toHaveBeenCalled();

    // No stop tables accessed
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0]);
    expect(fromCalls).not.toContain("route_run_stops");
    expect(fromCalls).not.toContain("route_runs");
  });
});
