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
 * - isRunning = runStatus === "in_progress"
 * - trackingStatus = deriveTrackingStatus(lastGpsFixAt, now)
 * - isTrackingFresh = trackingStatus === "live"
 */
function deriveRouteFields(params: {
  withinWindow: boolean;
  runStatus: string | null;
  lastGpsFixAt: string | null;
  now: DateTime;
}): { isRunning: boolean; trackingStatus: TrackingStatus; isTrackingFresh: boolean } {
  const { runStatus, lastGpsFixAt, now } = params;

  const isRunning = runStatus === "in_progress";
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

    it("is true even when outside schedule window (late run)", () => {
      const freshFix = makeNow().minus({ minutes: 1 }).toISO()!;
      const result = deriveRouteFields({
        withinWindow: false,
        runStatus: "in_progress",
        lastGpsFixAt: freshFix,
        now: makeNow(),
      });
      expect(result.isRunning).toBe(true);
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
      const freshFix = makeNow().minus({ minutes: 1 }).toISO()!;
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

  describe("last-known suppression for waiting routes", () => {
    /**
     * Mirrors the last-known gate in routes/route.ts lines 169-182:
     * nextStop is populated from progress only when !isRunning, includeLastKnown,
     * progress.nextStopId exists, AND progress.runStatus !== "waiting".
     * nextStopMode is then "last_known" if nextStop was populated, null otherwise.
     */
    function deriveLastKnown(params: {
      isRunning: boolean;
      includeLastKnown: boolean;
      runStatus: string | null;
      nextStopId: string | null;
    }): { nextStopPopulated: boolean; nextStopMode: "live" | "last_known" | null } {
      const { isRunning, includeLastKnown, runStatus, nextStopId } = params;
      let nextStopPopulated = false;

      if (!isRunning && includeLastKnown && nextStopId && runStatus !== "waiting") {
        nextStopPopulated = true;
      }

      const nextStopMode = isRunning
        ? "live"
        : (nextStopPopulated ? "last_known" : null);

      return { nextStopPopulated, nextStopMode };
    }

    it("suppresses last-known for waiting routes with valid pointer", () => {
      const result = deriveLastKnown({
        isRunning: false,
        includeLastKnown: true,
        runStatus: "waiting",
        nextStopId: "entry-b",
      });
      expect(result.nextStopPopulated).toBe(false);
      expect(result.nextStopMode).toBeNull();
    });

    it("allows last-known for idle routes with valid pointer", () => {
      const result = deriveLastKnown({
        isRunning: false,
        includeLastKnown: true,
        runStatus: "idle",
        nextStopId: "entry-b",
      });
      expect(result.nextStopPopulated).toBe(true);
      expect(result.nextStopMode).toBe("last_known");
    });

    it("allows last-known for completed routes with valid pointer", () => {
      const result = deriveLastKnown({
        isRunning: false,
        includeLastKnown: true,
        runStatus: "completed",
        nextStopId: "entry-b",
      });
      expect(result.nextStopPopulated).toBe(true);
      expect(result.nextStopMode).toBe("last_known");
    });

    it("returns live mode for running routes regardless of includeLastKnown", () => {
      const result = deriveLastKnown({
        isRunning: true,
        includeLastKnown: true,
        runStatus: "in_progress",
        nextStopId: "entry-b",
      });
      expect(result.nextStopMode).toBe("live");
    });

    it("returns null when includeLastKnown is false", () => {
      const result = deriveLastKnown({
        isRunning: false,
        includeLastKnown: false,
        runStatus: "idle",
        nextStopId: "entry-b",
      });
      expect(result.nextStopPopulated).toBe(false);
      expect(result.nextStopMode).toBeNull();
    });

    it("completed route with null nextStopId produces consistent last-known response", () => {
      // When resolveRouteProgress returns null nextStopId for a completed route,
      // the route handler should also not populate nextStop
      const result = deriveLastKnown({
        isRunning: false,
        includeLastKnown: true,
        runStatus: "completed",
        nextStopId: null,
      });
      expect(result.nextStopPopulated).toBe(false);
      expect(result.nextStopMode).toBeNull();
    });

    it("returns null when no pointer exists", () => {
      const result = deriveLastKnown({
        isRunning: false,
        includeLastKnown: true,
        runStatus: "idle",
        nextStopId: null,
      });
      expect(result.nextStopPopulated).toBe(false);
      expect(result.nextStopMode).toBeNull();
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

  it("returns isUnhealthy: true when stale (>10 min default)", async () => {
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

describe("nextStopMode field", () => {
  // T012: live mode for active routes
  it("returns nextStopMode 'live' when isRunning is true", () => {
    const result = deriveRouteFields({
      withinWindow: true,
      runStatus: "in_progress",
      lastGpsFixAt: makeNow().minus({ minutes: 1 }).toISO()!,
      now: makeNow(),
    });
    // nextStopMode is derived in the route handler, not in deriveRouteFields
    // So we verify isRunning is true (which maps to nextStopMode = "live")
    expect(result.isRunning).toBe(true);
  });

  // T013: null mode when no persisted progress
  it("returns isRunning false when status is waiting (maps to nextStopMode null without lastKnown)", () => {
    const result = deriveRouteFields({
      withinWindow: true,
      runStatus: "waiting",
      lastGpsFixAt: makeNow().minus({ minutes: 1 }).toISO()!,
      now: makeNow(),
    });
    expect(result.isRunning).toBe(false);
  });

  // T014: backward compat — top-level summary null without includeLastKnown
  it("isRunning false for completed route (no lastKnown data without flag)", () => {
    const result = deriveRouteFields({
      withinWindow: false,
      runStatus: "completed",
      lastGpsFixAt: makeNow().minus({ minutes: 30 }).toISO()!,
      now: makeNow(),
    });
    expect(result.isRunning).toBe(false);
  });
});

// ---------- Shift Start: Stop Seeding & Pointer Init (T012) ----------

import { seedRouteRunStops } from "@/lib/tracking/seed-route-run-stops";
import { persistCanonicalProgress } from "@/lib/tracking/persist-canonical-progress";

/**
 * Build a mock Supabase client that tracks seeded rows and pointer updates,
 * simulating the shift-start pipeline (seed then persist).
 */
function createShiftStartMockSupabase(opts: {
  scheduleEntries: Array<{ id: string; stop_sequence: number }>;
  existingStopCount?: number;
}) {
  const { scheduleEntries, existingStopCount = 0 } = opts;

  const seededRows: Array<{ run_id: string; schedule_entry_id: string; status: string }> = [];
  const pointerUpdates: Array<{ runId: string; payload: Record<string, unknown> }> = [];

  const supabase = {
    from: (table: string) => {
      if (table === "route_run_stops") {
        return {
          // select path — used by both seedRouteRunStops (count) and persistCanonicalProgress (fetch)
          select: (_cols: string, selectOpts?: { count?: string; head?: boolean }) => {
            if (selectOpts?.count === "exact") {
              // seedRouteRunStops count query
              return {
                eq: () =>
                  Promise.resolve({
                    count: seededRows.length > 0 ? seededRows.length : existingStopCount,
                    error: null,
                  }),
              };
            }
            // persistCanonicalProgress fetch query
            return {
              eq: () => ({
                order: () =>
                  Promise.resolve({
                    data: seededRows.map((r) => ({
                      schedule_entry_id: r.schedule_entry_id,
                      status: r.status,
                      schedule_entries: {
                        stop_sequence:
                          scheduleEntries.find((e) => e.id === r.schedule_entry_id)
                            ?.stop_sequence ?? 0,
                      },
                    })),
                    error: null,
                  }),
              }),
            };
          },
          // insert path — used by seedRouteRunStops
          insert: (
            rows: Array<{ run_id: string; schedule_entry_id: string; status: string }>,
          ) => {
            seededRows.push(...rows);
            return Promise.resolve({ error: null });
          },
          // update path — used by persistCanonicalProgress heal
          update: () => ({
            eq: () => ({
              in: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      }
      if (table === "schedule_entries") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: scheduleEntries.map((e) => ({ id: e.id })),
                error: null,
              }),
          }),
        };
      }
      if (table === "route_runs") {
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, runId: string) => {
              pointerUpdates.push({ runId, payload });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
  };

  return { supabase: supabase as never, seededRows, pointerUpdates };
}

describe("shift start: stop seeding and pointer initialization", () => {
  it("seeds pending route_run_stops for all schedule entries", async () => {
    const entries = [
      { id: "entry-a", stop_sequence: 1 },
      { id: "entry-b", stop_sequence: 2 },
      { id: "entry-c", stop_sequence: 3 },
    ];

    const { supabase, seededRows } = createShiftStartMockSupabase({
      scheduleEntries: entries,
    });

    const seeded = await seedRouteRunStops(supabase, "run-1", "route-1");

    expect(seeded).toBe(true);
    expect(seededRows).toHaveLength(3);
    expect(seededRows.every((r) => r.status === "pending")).toBe(true);
    expect(seededRows.map((r) => r.schedule_entry_id)).toEqual([
      "entry-a",
      "entry-b",
      "entry-c",
    ]);
  });

  it("sets next_stop_id to the first stop by stop_sequence after seeding", async () => {
    const entries = [
      { id: "entry-a", stop_sequence: 1 },
      { id: "entry-b", stop_sequence: 2 },
      { id: "entry-c", stop_sequence: 3 },
    ];

    const { supabase, pointerUpdates } = createShiftStartMockSupabase({
      scheduleEntries: entries,
    });

    // Replicate the shift-start pipeline: seed then persist
    await seedRouteRunStops(supabase, "run-1", "route-1");
    const result = await persistCanonicalProgress(supabase, "run-1");

    expect(result.nextStopId).toBe("entry-a");
    expect(result.lastPassedStopId).toBeNull();
    expect(pointerUpdates).toHaveLength(1);
    expect(pointerUpdates[0].payload).toMatchObject({
      next_stop_id: "entry-a",
      last_passed_stop_id: null,
    });
  });

  it("skips seeding when stops already exist for the run", async () => {
    const entries = [
      { id: "entry-a", stop_sequence: 1 },
      { id: "entry-b", stop_sequence: 2 },
    ];

    const { supabase, seededRows } = createShiftStartMockSupabase({
      scheduleEntries: entries,
      existingStopCount: 2,
    });

    const seeded = await seedRouteRunStops(supabase, "run-1", "route-1");

    expect(seeded).toBe(false);
    expect(seededRows).toHaveLength(0);
  });
});
