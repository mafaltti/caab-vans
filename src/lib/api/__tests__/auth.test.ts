import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module under test
const mockGetUser = vi.fn();
const mockCookieAuth = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: () =>
    Promise.resolve({ auth: { getUser: mockCookieAuth } }),
  createServiceClient: () => ({
    from: mockSupabaseFrom,
  }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, opts?: { status?: number }) => ({
      body,
      status: opts?.status ?? 200,
      json: async () => body,
    }),
  },
}));

// Import after mocks
import { requireAuth, requireBoundVan, requireRole } from "../auth";

function makeRequest(headers: Record<string, string> = {}) {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as import("next/server").NextRequest;
}

function makeDriver(overrides: Record<string, unknown> = {}) {
  return {
    id: "driver-1",
    email: "driver@test.com",
    app_metadata: { role: "driver", is_active: true },
    ...overrides,
  };
}

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates bearer token for native callers", async () => {
    const user = makeDriver();
    mockGetUser.mockResolvedValue({ data: { user }, error: null });

    const request = makeRequest({ authorization: "Bearer valid-token" });
    const result = await requireAuth(request);

    expect(result).toEqual({
      user: { id: "driver-1", email: "driver@test.com" },
      role: "driver",
    });
    expect(mockGetUser).toHaveBeenCalledWith("valid-token");
  });

  it("falls back to cookie auth when no bearer header", async () => {
    const user = makeDriver();
    mockCookieAuth.mockResolvedValue({ data: { user }, error: null });

    const result = await requireAuth();

    expect(result).toEqual({
      user: { id: "driver-1", email: "driver@test.com" },
      role: "driver",
    });
    expect(mockCookieAuth).toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("falls back to cookie auth when request has no bearer header", async () => {
    const user = makeDriver();
    mockCookieAuth.mockResolvedValue({ data: { user }, error: null });

    const request = makeRequest({});
    const result = await requireAuth(request);

    expect(result).toEqual({
      user: { id: "driver-1", email: "driver@test.com" },
      role: "driver",
    });
  });

  it("throws 401 for invalid bearer token", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error("Invalid token"),
    });

    const request = makeRequest({ authorization: "Bearer bad-token" });

    await expect(requireAuth(request)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws 403 for inactive user via bearer", async () => {
    const user = makeDriver({
      app_metadata: { role: "driver", is_active: false },
    });
    mockGetUser.mockResolvedValue({ data: { user }, error: null });

    const request = makeRequest({ authorization: "Bearer token" });

    await expect(requireAuth(request)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("cookie auth still works without request param", async () => {
    const user = makeDriver({ app_metadata: { role: "admin", is_active: true } });
    mockCookieAuth.mockResolvedValue({ data: { user }, error: null });

    const result = await requireAuth();

    expect(result.role).toBe("admin");
  });
});

describe("requireBoundVan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns vanId when headers and token are valid", async () => {
    mockSupabaseFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { id: "van-1", ingestion_token: "valid-token" },
            }),
        }),
      }),
    });

    const request = makeRequest({
      "x-bound-van-id": "van-1",
      "x-ingestion-token": "valid-token",
    });

    const result = await requireBoundVan(request);
    expect(result).toBe("van-1");
  });

  it("returns null for web callers (no headers)", async () => {
    const request = makeRequest({});
    const result = await requireBoundVan(request);
    expect(result).toBeNull();
  });

  it("returns null when only one header is present", async () => {
    const request = makeRequest({ "x-bound-van-id": "van-1" });
    const result = await requireBoundVan(request);
    expect(result).toBeNull();
  });

  it("throws 401 for invalid ingestion token", async () => {
    mockSupabaseFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { id: "van-1", ingestion_token: "correct-token" },
            }),
        }),
      }),
    });

    const request = makeRequest({
      "x-bound-van-id": "van-1",
      "x-ingestion-token": "wrong-token",
    });

    await expect(requireBoundVan(request)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws 404 when van not found", async () => {
    mockSupabaseFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null }),
        }),
      }),
    });

    const request = makeRequest({
      "x-bound-van-id": "missing-van",
      "x-ingestion-token": "token",
    });

    await expect(requireBoundVan(request)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through request param to requireAuth", async () => {
    const user = makeDriver();
    mockGetUser.mockResolvedValue({ data: { user }, error: null });

    const request = makeRequest({ authorization: "Bearer token" });
    const result = await requireRole("driver", request);

    expect(result.role).toBe("driver");
    expect(mockGetUser).toHaveBeenCalledWith("token");
  });
});
