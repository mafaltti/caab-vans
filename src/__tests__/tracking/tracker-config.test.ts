/// <reference types="vitest/globals" />

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/tracker-config/[vanId]/route";
import { NextRequest } from "next/server";

const VAN_ID = "a0eebc99-9c0b-4ef8-ab6d-6bb9bd380a11";
const ROUTE_ID = "c0eebc99-9c0b-4ef8-ab6d-6bb9bd380a33";
const TOKEN = "test-token";

function createRequest(token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers["x-ingestion-token"] = token;
  return new NextRequest(
    `http://localhost/api/tracker-config/${VAN_ID}`,
    { headers },
  );
}

const routeParams = { params: Promise.resolve({ vanId: VAN_ID }) };

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    stop_name: "Stop A",
    stop_lat: -12.97,
    stop_lng: -38.51,
    geofence_radius_m: 50,
    device_geofence_radius_m: null,
    stop_group_id: null,
    updated_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function setupMocks(opts: {
  vanData?: Record<string, unknown> | null;
  vanError?: { code: string; message: string } | null;
  routeData?: Record<string, unknown> | null;
  routeError?: { code: string; message: string } | null;
  entries?: Record<string, unknown>[];
  entriesError?: { code: string; message: string } | null;
}) {
  const {
    vanData = { id: VAN_ID, ingestion_token: TOKEN },
    vanError = null,
    routeData = { id: ROUTE_ID },
    routeError = null,
    entries = [makeEntry()],
    entriesError = null,
  } = opts;

  mockFrom.mockImplementation((table: string) => {
    if (table === "vans") {
      return {
        select: () => ({
          eq: () => ({
            single: () => ({ data: vanData, error: vanError }),
          }),
        }),
      };
    }
    if (table === "routes") {
      return {
        select: () => ({
          eq: () => ({
            single: () => ({ data: routeData, error: routeError }),
          }),
        }),
      };
    }
    if (table === "schedule_entries") {
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              not: () => ({
                order: () => ({ data: entries, error: entriesError }),
              }),
            }),
          }),
        }),
      };
    }
    return {};
  });
}

describe("tracker-config GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns geofenceRegions and configVersion for valid auth", async () => {
    setupMocks({
      entries: [
        makeEntry({ id: "e1", stop_group_id: "grp-a", updated_at: "2026-01-01T10:00:00Z" }),
        makeEntry({ id: "e2", stop_group_id: "grp-b", stop_lat: -13.0, stop_lng: -38.6, updated_at: "2026-01-01T11:00:00Z" }),
      ],
    });

    const res = await GET(createRequest(TOKEN), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.geofenceRegions).toHaveLength(2);
    expect(json.configVersion).toBeDefined();
  });

  it("returns 401 for invalid token", async () => {
    setupMocks({});

    const res = await GET(createRequest("wrong-token"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 when van has no route", async () => {
    setupMocks({
      routeData: null,
      routeError: { code: "PGRST116", message: "Not found" },
    });

    const res = await GET(createRequest(TOKEN), routeParams);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("deduplicates regions by stop_group_id", async () => {
    setupMocks({
      entries: [
        makeEntry({ id: "e1", stop_group_id: "grp-a", stop_lat: -12.97, stop_lng: -38.51 }),
        makeEntry({ id: "e2", stop_group_id: "grp-a", stop_lat: -12.97, stop_lng: -38.51 }),
        makeEntry({ id: "e3", stop_group_id: "grp-b", stop_lat: -13.0, stop_lng: -38.6 }),
      ],
    });

    const res = await GET(createRequest(TOKEN), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.geofenceRegions).toHaveLength(2);
    expect(json.geofenceRegions[0].placeId).toBe("grp-a");
    expect(json.geofenceRegions[1].placeId).toBe("grp-b");
  });

  it("uses device_geofence_radius_m when present", async () => {
    setupMocks({
      entries: [
        makeEntry({ device_geofence_radius_m: 300 }),
      ],
    });

    const res = await GET(createRequest(TOKEN), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.geofenceRegions[0].radius).toBe(300);
  });

  it("falls back to 150m when device_geofence_radius_m is null", async () => {
    setupMocks({
      entries: [
        makeEntry({ device_geofence_radius_m: null }),
      ],
    });

    const res = await GET(createRequest(TOKEN), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.geofenceRegions[0].radius).toBe(150);
  });

  it("configVersion equals the latest updated_at", async () => {
    const oldest = "2026-01-01T08:00:00Z";
    const newest = "2026-01-01T12:00:00Z";
    setupMocks({
      entries: [
        makeEntry({ id: "e1", stop_group_id: "grp-a", updated_at: oldest }),
        makeEntry({ id: "e2", stop_group_id: "grp-b", stop_lat: -13.0, stop_lng: -38.6, updated_at: newest }),
      ],
    });

    const res = await GET(createRequest(TOKEN), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.configVersion).toBe(newest);
  });
});
