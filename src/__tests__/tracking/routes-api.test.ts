/// <reference types="vitest/globals" />
import { DateTime } from "luxon";
import { deriveTrackingStatus } from "@/lib/tracking/tracking-status";
import type { TrackingStatus } from "@/types";

// --- Mocks for tracker-health tests ---

const mockSingle = vi.fn();
const mockLimit = vi.fn().mockReturnValue({ single: mockSingle });
const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
const mockSelectPings = vi.fn().mockReturnValue({ eq: mockEq });
const mockSelectVans = vi.fn();
const mockFrom = vi.fn((table: string) => {
  if (table === "vans") return { select: mockSelectVans };
  if (table === "van_location_pings") return { select: mockSelectPings };
  return { select: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

const TIMEZONE = "America/Bahia";

function makeNow(): DateTime {
  return DateTime.fromISO("2026-03-07T10:00:00", { zone: TIMEZONE });
}

/**
 * Mirrors the derivation logic from routes/route.ts:
 * - isRunning = withinWindow && runStatus === "in_progress"
 * - trackingStatus = deriveTrackingStatus(lastGpsFixAt, now)
 * - isTrackingFresh = trackingStatus === "live"
 */
function deriveRouteFields(params: {
  withinWindow: boolean;
  runStatus: string | null;
  lastGpsFixAt: string | null;
  now: DateTime;
}): { isRunning: boolean; trackingStatus: TrackingStatus; isTrackingFresh: boolean } {
  const { withinWindow, runStatus, lastGpsFixAt, now } = params;

  const isRunning = withinWindow && runStatus === "in_progress";
  const trackingStatus = deriveTrackingStatus(lastGpsFixAt, now);
  const isTrackingFresh = trackingStatus === "live";

  return { isRunning, trackingStatus, isTrackingFresh };
}

describe("routes API derivation logic", () => {
  describe("isRunning", () => {
    it("is true when withinWindow and runStatus is in_progress, regardless of GPS age", () => {
      const staleFix = makeNow().minus({ minutes: 30 }).toISO()!;
      const result = deriveRouteFields({
        withinWindow: true,
        runStatus: "in_progress",
        lastGpsFixAt: staleFix,
        now: makeNow(),
      });
      expect(result.isRunning).toBe(true);
    });

    it("is true even with no GPS fix at all", () => {
      const result = deriveRouteFields({
        withinWindow: true,
        runStatus: "in_progress",
        lastGpsFixAt: null,
        now: makeNow(),
      });
      expect(result.isRunning).toBe(true);
    });

    it("is false when shift is not active (waiting)", () => {
      const freshFix = makeNow().minus({ minutes: 1 }).toISO()!;
      const result = deriveRouteFields({
        withinWindow: true,
        runStatus: "waiting",
        lastGpsFixAt: freshFix,
        now: makeNow(),
      });
      expect(result.isRunning).toBe(false);
    });

    it("is false when outside schedule window", () => {
      const freshFix = makeNow().minus({ minutes: 1 }).toISO()!;
      const result = deriveRouteFields({
        withinWindow: false,
        runStatus: "in_progress",
        lastGpsFixAt: freshFix,
        now: makeNow(),
      });
      expect(result.isRunning).toBe(false);
    });

    it("is false when runStatus is null (no run data)", () => {
      const result = deriveRouteFields({
        withinWindow: true,
        runStatus: null,
        lastGpsFixAt: makeNow().toISO()!,
        now: makeNow(),
      });
      expect(result.isRunning).toBe(false);
    });
  });

  describe("trackingStatus and isTrackingFresh", () => {
    it("isTrackingFresh is true when trackingStatus is live", () => {
      const freshFix = makeNow().minus({ minutes: 3 }).toISO()!;
      const result = deriveRouteFields({
        withinWindow: true,
        runStatus: "in_progress",
        lastGpsFixAt: freshFix,
        now: makeNow(),
      });
      expect(result.trackingStatus).toBe("live");
      expect(result.isTrackingFresh).toBe(true);
    });

    it("isTrackingFresh is false when trackingStatus is stale", () => {
      const staleFix = makeNow().minus({ minutes: 25 }).toISO()!;
      const result = deriveRouteFields({
        withinWindow: true,
        runStatus: "in_progress",
        lastGpsFixAt: staleFix,
        now: makeNow(),
      });
      expect(result.trackingStatus).toBe("stale");
      expect(result.isTrackingFresh).toBe(false);
    });

    it("isTrackingFresh is false when trackingStatus is missing", () => {
      const result = deriveRouteFields({
        withinWindow: true,
        runStatus: "in_progress",
        lastGpsFixAt: null,
        now: makeNow(),
      });
      expect(result.trackingStatus).toBe("missing");
      expect(result.isTrackingFresh).toBe(false);
    });

    it("response includes trackingStatus field", () => {
      const result = deriveRouteFields({
        withinWindow: true,
        runStatus: "in_progress",
        lastGpsFixAt: makeNow().toISO()!,
        now: makeNow(),
      });
      expect(result).toHaveProperty("trackingStatus");
      expect(["live", "stale", "missing"]).toContain(result.trackingStatus);
    });
  });
});

// ---------- Tracker Health Tests ----------

import { getTrackerHealthStatuses } from "@/lib/tracking/tracker-health";

describe("getTrackerHealthStatuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns isStale: true when staleSinceMinutes > 10", async () => {
    const staleFixAt = new Date(Date.now() - 15 * 60_000).toISOString();
    mockSelectVans.mockResolvedValue({
      data: [{ id: "van-1", last_gps_fix_at: staleFixAt }],
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { buffer_size: 0, failure_count: 0, battery_level: 80, network_type: "wifi" },
    });

    const result = await getTrackerHealthStatuses();
    expect(result).toHaveLength(1);
    expect(result[0].isStale).toBe(true);
    expect(result[0].staleSinceMinutes).toBeGreaterThanOrEqual(14);
  });

  it("returns isUnhealthy: true when stale (>10 min)", async () => {
    const staleFixAt = new Date(Date.now() - 20 * 60_000).toISOString();
    mockSelectVans.mockResolvedValue({
      data: [{ id: "van-1", last_gps_fix_at: staleFixAt }],
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { buffer_size: 0, failure_count: 0, battery_level: 90, network_type: "wifi" },
    });

    const result = await getTrackerHealthStatuses();
    expect(result[0].isUnhealthy).toBe(true);
  });

  it("returns isUnhealthy: true when bufferSize > 20", async () => {
    const freshFixAt = new Date(Date.now() - 2 * 60_000).toISOString();
    mockSelectVans.mockResolvedValue({
      data: [{ id: "van-1", last_gps_fix_at: freshFixAt }],
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { buffer_size: 25, failure_count: 0, battery_level: 80, network_type: "4g" },
    });

    const result = await getTrackerHealthStatuses();
    expect(result[0].isStale).toBe(false);
    expect(result[0].isUnhealthy).toBe(true);
  });

  it("returns isUnhealthy: true when failureCount > 3", async () => {
    const freshFixAt = new Date(Date.now() - 2 * 60_000).toISOString();
    mockSelectVans.mockResolvedValue({
      data: [{ id: "van-1", last_gps_fix_at: freshFixAt }],
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { buffer_size: 5, failure_count: 5, battery_level: 70, network_type: "3g" },
    });

    const result = await getTrackerHealthStatuses();
    expect(result[0].isStale).toBe(false);
    expect(result[0].isUnhealthy).toBe(true);
  });

  it("returns isUnhealthy: false when all metrics are healthy", async () => {
    const freshFixAt = new Date(Date.now() - 2 * 60_000).toISOString();
    mockSelectVans.mockResolvedValue({
      data: [{ id: "van-1", last_gps_fix_at: freshFixAt }],
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { buffer_size: 5, failure_count: 1, battery_level: 95, network_type: "wifi" },
    });

    const result = await getTrackerHealthStatuses();
    expect(result[0].isStale).toBe(false);
    expect(result[0].isUnhealthy).toBe(false);
  });

  it("returns correct staleSinceMinutes, bufferSize, failureCount, batteryLevel, networkType", async () => {
    const fixAt = new Date(Date.now() - 5 * 60_000).toISOString();
    mockSelectVans.mockResolvedValue({
      data: [{ id: "van-1", last_gps_fix_at: fixAt }],
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { buffer_size: 12, failure_count: 2, battery_level: 65, network_type: "4g" },
    });

    const result = await getTrackerHealthStatuses();
    expect(result).toHaveLength(1);

    const h = result[0];
    expect(h.vanId).toBe("van-1");
    expect(h.staleSinceMinutes).toBeGreaterThanOrEqual(4);
    expect(h.staleSinceMinutes).toBeLessThanOrEqual(6);
    expect(h.latestBufferSize).toBe(12);
    expect(h.latestFailureCount).toBe(2);
    expect(h.latestBatteryLevel).toBe(65);
    expect(h.latestNetworkType).toBe("4g");
  });
});
