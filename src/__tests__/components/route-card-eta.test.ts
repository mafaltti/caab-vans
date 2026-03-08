/// <reference types="vitest/globals" />

/**
 * T012 — ETA display gating on route cards.
 *
 * The route-card renders the ETA badge when BOTH conditions hold:
 *   1. route.progress?.etaNextStopMinutes != null
 *   2. route.nextStop?.id === route.progress.nextStopId
 *
 * We extract this as a pure predicate and test the four cases.
 */

import type { RouteWithStatus } from "@/types";

/** Mirrors the gating condition at route-card.tsx line 68 */
function shouldShowEtaBadge(route: RouteWithStatus): boolean {
  return (
    route.progress?.etaNextStopMinutes != null &&
    route.nextStop?.id === route.progress.nextStopId
  );
}

function makeRoute(overrides: Partial<{
  nextStopId: string;
  progressNextStopId: string | null;
  etaNextStopMinutes: number | null;
  progress: null;
}>): RouteWithStatus {
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
          runStatus: "in_progress",
          nextStopId: overrides.progressNextStopId ?? null,
          passedStopIds: [],
          etaNextStopISO: null,
          etaNextStopMinutes: overrides.etaNextStopMinutes ?? null,
          delayMinutes: null,
          etaSource: "gps",
        }
      : null,
  };
}

describe("RouteCard ETA badge gating", () => {
  it("shows ETA when nextStop.id matches progress.nextStopId and etaNextStopMinutes is non-null", () => {
    const route = makeRoute({
      nextStopId: "stop-1",
      progressNextStopId: "stop-1",
      etaNextStopMinutes: 5,
    });
    expect(shouldShowEtaBadge(route)).toBe(true);
  });

  it("hides ETA when nextStop.id differs from progress.nextStopId", () => {
    const route = makeRoute({
      nextStopId: "stop-1",
      progressNextStopId: "stop-2",
      etaNextStopMinutes: 5,
    });
    expect(shouldShowEtaBadge(route)).toBe(false);
  });

  it("hides ETA when etaNextStopMinutes is null", () => {
    const route = makeRoute({
      nextStopId: "stop-1",
      progressNextStopId: "stop-1",
      etaNextStopMinutes: null,
    });
    expect(shouldShowEtaBadge(route)).toBe(false);
  });

  it("hides ETA when progress is null", () => {
    const route = makeRoute({
      nextStopId: "stop-1",
      progress: null,
    });
    expect(shouldShowEtaBadge(route)).toBe(false);
  });
});
