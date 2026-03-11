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
});
vi.mock("@/lib/tracking/infer-stop-progress", () => ({
  inferStopProgress: (args: unknown) => mockInferStopProgress(args),
}));

// Mock processDeviceGeofenceEvents
vi.mock("@/lib/tracking/process-device-geofence-events", () => ({
  processDeviceGeofenceEvents: vi.fn().mockResolvedValue([]),
}));

// Mock snapToRoad
vi.mock("@/lib/tracking/osrm", () => ({
  snapToRoad: vi.fn().mockResolvedValue(null),
}));

// Mock rate limiter
vi.mock("@/lib/api/rate-limit", () => ({
  createRateLimiter: () => () => ({ allowed: true }),
}));

import { POST } from "@/app/api/tracking/[vanId]/route";

// Valid UUID v4 format (version nibble=4, variant=a)
const VAN_ID = "a0eebc99-9c0b-4ef8-ab6d-6bb9bd380a11";
const DEVICE_ID = "b0eebc99-9c0b-4ef8-ab6d-6bb9bd380a22";
const INGESTION_TOKEN = "test-token";

function createRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/tracking/${VAN_ID}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ingestion-token": INGESTION_TOKEN,
    },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    deviceId: DEVICE_ID,
    lat: -12.97,
    lng: -38.51,
    accuracy: 5,
    speed: 0,
    heading: 0,
    ts: Date.now(),
    ...overrides,
  };
}

// Helper to set up mock chains
function setupMocks(opts: {
  vanExists?: boolean;
  upsertData?: { id: string } | null;
  upsertError?: { code: string; message: string } | null;
}) {
  const {
    vanExists = true,
    upsertData = { id: "ping-1" },
    upsertError = null,
  } = opts;

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
          update: () => ({
            eq: () => ({ error: null }),
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
            single: () => ({
              data: upsertData,
              error: upsertError,
            }),
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
            not: () => ({
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
    // Default chain for routes, schedule_entries, etc. — supports .maybeSingle() and .order().limit()
    const chainable: Record<string, unknown> = {};
    const proxy: unknown = new Proxy(chainable, {
      get(_target, prop) {
        if (prop === "then") return undefined;
        if (prop === "single" || prop === "maybeSingle") return () => ({ data: null, error: null });
        return () => proxy;
      },
    });
    return proxy;
  });
}

const routeParams = { params: Promise.resolve({ vanId: VAN_ID }) };

describe("tracking dedup — upsert returns duplicate indicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns duplicate: true when upsert finds existing (van_id, device_ts)", async () => {
    setupMocks({
      upsertData: null,
      upsertError: { code: "PGRST116", message: "No rows returned" },
    });

    const body = validBody();
    const req = createRequest(body);
    const res = await POST(req as never, routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
    expect(json.duplicate).toBe(true);
  });

  it("returns received: true without duplicate flag for new ping", async () => {
    const now = Date.now();
    // Make the inserted ping the newest by returning an older latest
    const olderTs = DateTime.fromMillis(now - 10_000).toISO()!;
    setupMocks({
      upsertData: { id: "ping-1" },

    });

    const body = validBody({ ts: now });
    const req = createRequest(body);
    const res = await POST(req as never, routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
    expect(json.duplicate).toBeUndefined();
  });
});

describe("tracking dedup — inference always runs after successful upsert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls inferStopProgress even when RPC returns false (not newest)", async () => {
    const now = Date.now();

    setupMocks({
      upsertData: { id: "ping-1" },

    });
    // RPC returns false — ping was not newer than stored position
    mockRpc.mockResolvedValueOnce({ data: false, error: null });

    const body = validBody({ ts: now });
    const req = createRequest(body);
    await POST(req as never, routeParams);

    // Inference now always runs after successful upsert
    expect(mockInferStopProgress).toHaveBeenCalledTimes(1);
  });
});

describe("tracking dedup — staleness guard rejects old pings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects ping older than 24 hours with 400", async () => {
    setupMocks({});
    const oldTs = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    const body = validBody({ ts: oldTs });
    const req = createRequest(body);
    const res = await POST(req as never, routeParams);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toBe("Ping too old");
  });

  it("accepts ping 23 hours old", async () => {
    const ts = Date.now() - 23 * 60 * 60 * 1000;
    const olderTs = DateTime.fromMillis(ts - 10_000).toISO()!;
    setupMocks({
      upsertData: { id: "ping-1" },

    });

    const body = validBody({ ts });
    const req = createRequest(body);
    const res = await POST(req as never, routeParams);

    expect(res.status).toBe(200);
  });
});

describe("tracking dedup — downstream only triggers when isNewest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call inferStopProgress for duplicate ping", async () => {
    setupMocks({
      upsertData: null,
      upsertError: { code: "PGRST116", message: "No rows returned" },
    });

    const body = validBody();
    const req = createRequest(body);
    await POST(req as never, routeParams);

    expect(mockInferStopProgress).not.toHaveBeenCalled();
  });

  it("calls inferStopProgress for newest ping with object arg", async () => {
    const now = Date.now();
    // Return an older latest so this ping is newest (strict >)
    const olderTs = DateTime.fromMillis(now - 10_000).toISO()!;
    setupMocks({
      upsertData: { id: "ping-1" },

    });

    const body = validBody({ ts: now });
    const req = createRequest(body);
    await POST(req as never, routeParams);

    expect(mockInferStopProgress).toHaveBeenCalledTimes(1);
    // Verify object arg shape
    const callArg = mockInferStopProgress.mock.calls[0][0];
    expect(callArg).toHaveProperty("rawLat");
    expect(callArg).toHaveProperty("rawLng");
    expect(callArg).toHaveProperty("eventTs");
    expect(callArg).toHaveProperty("vanId", VAN_ID);
  });
});
