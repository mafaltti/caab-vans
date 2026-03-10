/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

// Mock Supabase server client
const mockFrom = vi.fn();
const mockRpc = vi.fn().mockResolvedValue({ data: true, error: null });
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

// Mock inferStopProgress
const mockInferStopProgress = vi.fn().mockResolvedValue({
  passedStopIds: [],
  nextStopId: null,
  lastPassedStopId: null,
});
vi.mock("@/lib/tracking/infer-stop-progress", () => ({
  inferStopProgress: (args: unknown) => mockInferStopProgress(args),
}));

// Mock snapToRoad and matchTrajectory
const mockMatchTrajectory = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/tracking/osrm", () => ({
  snapToRoad: vi.fn().mockResolvedValue(null),
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
  duplicateIndices?: number[]; // indices in the sorted batch that should be treated as duplicates
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

describe("T012: Earlier ping crosses stop, later does not — progress advances with correct passed_at", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls inferStopProgress for each accepted ping with correct eventTs", async () => {
    const now = Date.now();
    const earlierTs = now - 30_000; // 30 seconds ago — near a stop
    const laterTs = now - 10_000; // 10 seconds ago — away from stop

    setupMocks({});
    mockRpc.mockResolvedValue({ data: true, error: null });

    const body = {
      points: [
        validPoint({ ts: earlierTs, lat: -12.971, lng: -38.511 }), // near stop
        validPoint({ ts: laterTs, lat: -12.980, lng: -38.520 }), // away from stop
      ],
    };

    const req = createRequest(body);
    await POST(req as never, routeParams);

    // Both pings accepted — inferStopProgress called for each
    expect(mockInferStopProgress).toHaveBeenCalledTimes(2);

    // First call should use the earlier ping's eventTs
    const firstCallArg = mockInferStopProgress.mock.calls[0][0];
    const expectedFirstTs = DateTime.fromMillis(earlierTs).toISO()!;
    expect(firstCallArg).toHaveProperty("eventTs", expectedFirstTs);
    expect(firstCallArg).toHaveProperty("vanId", VAN_ID);
    expect(firstCallArg).toHaveProperty("rawLat", -12.971);
    expect(firstCallArg).toHaveProperty("rawLng", -38.511);

    // Second call should use the later ping's eventTs
    const secondCallArg = mockInferStopProgress.mock.calls[1][0];
    const expectedSecondTs = DateTime.fromMillis(laterTs).toISO()!;
    expect(secondCallArg).toHaveProperty("eventTs", expectedSecondTs);
    expect(secondCallArg).toHaveProperty("rawLat", -12.980);
    expect(secondCallArg).toHaveProperty("rawLng", -38.520);
  });
});

describe("T013: Replay is chronological — pings processed in device_ts order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls inferStopProgress in device_ts chronological order regardless of input order", async () => {
    const now = Date.now();
    const ts1 = now - 60_000; // oldest
    const ts2 = now - 30_000; // middle
    const ts3 = now - 10_000; // newest

    setupMocks({});
    mockRpc.mockResolvedValue({ data: true, error: null });

    // Send pings deliberately out of order: middle, newest, oldest
    const body = {
      points: [
        validPoint({ ts: ts2, lat: -12.972 }),
        validPoint({ ts: ts3, lat: -12.973 }),
        validPoint({ ts: ts1, lat: -12.971 }),
      ],
    };

    const req = createRequest(body);
    await POST(req as never, routeParams);

    expect(mockInferStopProgress).toHaveBeenCalledTimes(3);

    // Verify calls are in chronological order: ts1, ts2, ts3
    const call0 = mockInferStopProgress.mock.calls[0][0];
    const call1 = mockInferStopProgress.mock.calls[1][0];
    const call2 = mockInferStopProgress.mock.calls[2][0];

    const expectedTs1 = DateTime.fromMillis(ts1).toISO()!;
    const expectedTs2 = DateTime.fromMillis(ts2).toISO()!;
    const expectedTs3 = DateTime.fromMillis(ts3).toISO()!;

    expect(call0).toHaveProperty("eventTs", expectedTs1);
    expect(call1).toHaveProperty("eventTs", expectedTs2);
    expect(call2).toHaveProperty("eventTs", expectedTs3);
  });
});

describe("T014: Inference runs even when update_van_position returns false", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls inferStopProgress even when RPC returns false", async () => {
    const now = Date.now();
    const ts = now - 10_000;

    setupMocks({});
    // RPC returns false — position was not updated (not newest)
    mockRpc.mockResolvedValue({ data: false, error: null });

    const body = {
      points: [validPoint({ ts })],
    };

    const req = createRequest(body);
    await POST(req as never, routeParams);

    // Inference must still run despite RPC returning false
    expect(mockInferStopProgress).toHaveBeenCalledTimes(1);

    const callArg = mockInferStopProgress.mock.calls[0][0];
    expect(callArg).toHaveProperty("vanId", VAN_ID);
    expect(callArg).toHaveProperty("rawLat", -12.97);
    expect(callArg).toHaveProperty("rawLng", -38.51);
  });
});

describe("T015: Per-point snapped coords from matchTrajectory are passed into each inference call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes matchTrajectory snapped coords to each inferStopProgress call", async () => {
    const now = Date.now();
    const ts1 = now - 30_000;
    const ts2 = now - 10_000;

    setupMocks({});
    mockRpc.mockResolvedValue({ data: true, error: null });

    // matchTrajectory returns per-point snapped coordinates
    const snappedCoords = [
      { lat: -12.9701, lng: -38.5101 },
      { lat: -12.9801, lng: -38.5201 },
    ];
    mockMatchTrajectory.mockResolvedValue(snappedCoords);

    // Set OSRM_BASE_URL so the snapping path is triggered
    const originalEnv = process.env.OSRM_BASE_URL;
    process.env.OSRM_BASE_URL = "http://localhost:5000";

    try {
      const body = {
        points: [
          validPoint({ ts: ts1, lat: -12.971, lng: -38.511 }),
          validPoint({ ts: ts2, lat: -12.980, lng: -38.520 }),
        ],
      };

      const req = createRequest(body);
      await POST(req as never, routeParams);

      expect(mockInferStopProgress).toHaveBeenCalledTimes(2);

      // First inference call gets first snapped coords
      const call0 = mockInferStopProgress.mock.calls[0][0];
      expect(call0).toHaveProperty("snappedLat", -12.9701);
      expect(call0).toHaveProperty("snappedLng", -38.5101);

      // Second inference call gets second snapped coords
      const call1 = mockInferStopProgress.mock.calls[1][0];
      expect(call1).toHaveProperty("snappedLat", -12.9801);
      expect(call1).toHaveProperty("snappedLng", -38.5201);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.OSRM_BASE_URL;
      } else {
        process.env.OSRM_BASE_URL = originalEnv;
      }
    }
  });

  it("passes null snapped coords when matchTrajectory returns null", async () => {
    const now = Date.now();
    const ts = now - 10_000;

    setupMocks({});
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockMatchTrajectory.mockResolvedValue(null);

    const originalEnv = process.env.OSRM_BASE_URL;
    process.env.OSRM_BASE_URL = "http://localhost:5000";

    try {
      const body = {
        points: [validPoint({ ts })],
      };

      const req = createRequest(body);
      await POST(req as never, routeParams);

      expect(mockInferStopProgress).toHaveBeenCalledTimes(1);

      const callArg = mockInferStopProgress.mock.calls[0][0];
      // When matchTrajectory returns null, snapped coords should be null
      expect(callArg.snappedLat).toBeNull();
      expect(callArg.snappedLng).toBeNull();
    } finally {
      if (originalEnv === undefined) {
        delete process.env.OSRM_BASE_URL;
      } else {
        process.env.OSRM_BASE_URL = originalEnv;
      }
    }
  });
});
