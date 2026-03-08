/// <reference types="vitest/globals" />

/**
 * T013 — etaMinutes derivation on route detail page.
 *
 * The page computes (lines 135-137):
 *   const etaMinutes = route?.nextStop?.id === route?.progress?.nextStopId
 *     ? (route?.progress?.etaNextStopMinutes ?? null)
 *     : null;
 *
 * We extract this as a pure function and test the three cases.
 */

import type { RouteDetail } from "@/types";

/** Mirrors the derivation at routes/[routeId]/page.tsx lines 135-137 */
function deriveEtaMinutes(route: RouteDetail | undefined): number | null {
  return route?.nextStop?.id === route?.progress?.nextStopId
    ? (route?.progress?.etaNextStopMinutes ?? null)
    : null;
}

function makeRoute(overrides: Partial<{
  nextStopId: string | null;
  progressNextStopId: string | null;
  etaNextStopMinutes: number | null;
  progress: null;
  runStatus: "waiting" | "in_progress" | "completed";
}>): RouteDetail {
  const hasProgress = overrides.progress !== null;

  return {
    id: "route-1",
    name: "Test Route",
    isRunning: true,
    trackingStatus: "live",
    isTrackingFresh: true,
    nextStop: overrides.nextStopId
      ? { id: overrides.nextStopId, stopName: "Stop A", time: "08:00" }
      : null,
    scheduleStatus: "active",
    totalStops: 5,
    currentStopIndex: 1,
    van: {
      id: "van-1",
      locationUrl: null,
      lastGpsFixAt: "2026-03-07T10:00:00-03:00",
      isLocationOutdated: false,
      lastLat: -12.97,
      lastLng: -38.51,
    },
    progress: hasProgress
      ? {
          serviceDate: "2026-03-07",
          runStatus: overrides.runStatus ?? "in_progress",
          nextStopId: overrides.progressNextStopId ?? null,
          passedStopIds: [],
          etaNextStopISO: null,
          etaNextStopMinutes: overrides.etaNextStopMinutes ?? null,
          delayMinutes: null,
          etaSource: "gps",
        }
      : null,
    schedule: [
      { id: "stop-1", stopName: "Stop A", time: "08:00", stopLat: -12.97, stopLng: -38.51 },
      { id: "stop-2", stopName: "Stop B", time: "09:00", stopLat: -12.98, stopLng: -38.52 },
    ],
  };
}

describe("RouteDetail etaMinutes derivation", () => {
  it("returns etaNextStopMinutes when nextStop.id matches progress.nextStopId", () => {
    const route = makeRoute({
      nextStopId: "stop-1",
      progressNextStopId: "stop-1",
      etaNextStopMinutes: 7,
    });
    expect(deriveEtaMinutes(route)).toBe(7);
  });

  it("returns null when nextStop.id differs from progress.nextStopId", () => {
    const route = makeRoute({
      nextStopId: "stop-1",
      progressNextStopId: "stop-2",
      etaNextStopMinutes: 7,
    });
    expect(deriveEtaMinutes(route)).toBeNull();
  });

  it("returns null for a completed run (nextStop is null)", () => {
    const route = makeRoute({
      nextStopId: null,
      progressNextStopId: null,
      etaNextStopMinutes: null,
      runStatus: "completed",
    });
    expect(deriveEtaMinutes(route)).toBeNull();
  });

  it("returns null when route is undefined", () => {
    expect(deriveEtaMinutes(undefined)).toBeNull();
  });

  it("returns null when progress is null", () => {
    const route = makeRoute({
      nextStopId: "stop-1",
      progress: null,
    });
    expect(deriveEtaMinutes(route)).toBeNull();
  });
});
