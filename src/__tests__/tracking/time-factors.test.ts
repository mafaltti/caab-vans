/// <reference types="vitest/globals" />
import {
  buildRecentRuns,
  computeRecentFactor,
  type PassedStop,
} from "@/lib/tracking/time-factors";

// Two stops ~1.1 km apart in Salvador, BA
const STOP_A = { lat: -12.9714, lng: -38.5124 };
const STOP_B = { lat: -12.9800, lng: -38.5100 };

// Two stops ~40m apart (below MIN_SEGMENT_DIST_M)
const CLOSE_A = { lat: -12.9714, lng: -38.5124 };
const CLOSE_B = { lat: -12.97143, lng: -38.51237 };

function makeStops(pairs: { lat: number; lng: number; passedAt: string }[]): PassedStop[] {
  return pairs.map((p) => ({ passedAt: p.passedAt, stopLat: p.lat, stopLng: p.lng }));
}

describe("buildRecentRuns", () => {
  const ROAD_FACTOR = 1.3;

  it("returns empty array for 0 stops", () => {
    expect(buildRecentRuns([], ROAD_FACTOR)).toEqual([]);
  });

  it("returns empty array for 1 stop", () => {
    const stops = makeStops([
      { ...STOP_A, passedAt: "2026-03-06T08:00:00-03:00" },
    ]);
    expect(buildRecentRuns(stops, ROAD_FACTOR)).toEqual([]);
  });

  it("computes stable predictedMinutes using fixed reference speed", () => {
    const stops = makeStops([
      { ...STOP_A, passedAt: "2026-03-06T08:00:00-03:00" },
      { ...STOP_B, passedAt: "2026-03-06T08:05:00-03:00" },
    ]);

    const result1 = buildRecentRuns(stops, ROAD_FACTOR);
    const result2 = buildRecentRuns(stops, ROAD_FACTOR);

    expect(result1).toHaveLength(1);
    expect(result1[0].actualMinutes).toBeCloseTo(5.0, 1);
    expect(result1[0].predictedMinutes).toBeGreaterThan(0);
    // Same input produces identical output
    expect(result1[0].predictedMinutes).toBe(result2[0].predictedMinutes);
    expect(result1[0].actualMinutes).toBe(result2[0].actualMinutes);
  });

  it("filters short-distance segments below MIN_SEGMENT_DIST_M", () => {
    const stops = makeStops([
      { ...CLOSE_A, passedAt: "2026-03-06T08:00:00-03:00" },
      { ...CLOSE_B, passedAt: "2026-03-06T08:05:00-03:00" },
    ]);
    expect(buildRecentRuns(stops, ROAD_FACTOR)).toEqual([]);
  });

  it("filters short-time segments below MIN_SEGMENT_TIME_MIN", () => {
    const stops = makeStops([
      { ...STOP_A, passedAt: "2026-03-06T08:00:00-03:00" },
      { ...STOP_B, passedAt: "2026-03-06T08:00:20-03:00" }, // 20 seconds < 0.5 min
    ]);
    expect(buildRecentRuns(stops, ROAD_FACTOR)).toEqual([]);
  });

  it("produces identical output for same input regardless of call order", () => {
    const stops = makeStops([
      { ...STOP_A, passedAt: "2026-03-06T08:00:00-03:00" },
      { ...STOP_B, passedAt: "2026-03-06T08:05:00-03:00" },
    ]);

    // Call multiple times
    const r1 = buildRecentRuns(stops, ROAD_FACTOR);
    const r2 = buildRecentRuns(stops, ROAD_FACTOR);
    const r3 = buildRecentRuns(stops, ROAD_FACTOR);

    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it("skips segments with null coordinates", () => {
    const stops: PassedStop[] = [
      { passedAt: "2026-03-06T08:00:00-03:00", stopLat: STOP_A.lat, stopLng: STOP_A.lng },
      { passedAt: "2026-03-06T08:05:00-03:00", stopLat: null, stopLng: null },
      { passedAt: "2026-03-06T08:10:00-03:00", stopLat: STOP_B.lat, stopLng: STOP_B.lng },
    ];
    // First pair has null coords on second stop → skipped
    // Second pair has null coords on first stop → skipped
    expect(buildRecentRuns(stops, ROAD_FACTOR)).toEqual([]);
  });
});

describe("computeRecentFactor", () => {
  it("returns > 1.0 when actual times consistently exceed predicted (congestion)", () => {
    const runs = [
      { actualMinutes: 10, predictedMinutes: 5 },
      { actualMinutes: 12, predictedMinutes: 6 },
      { actualMinutes: 8, predictedMinutes: 4 },
    ];
    const factor = computeRecentFactor(runs);
    expect(factor).toBeGreaterThan(1.0);
  });

  it("returns < 1.0 when actual times are consistently below predicted (free flow)", () => {
    const runs = [
      { actualMinutes: 3, predictedMinutes: 5 },
      { actualMinutes: 4, predictedMinutes: 6 },
      { actualMinutes: 2, predictedMinutes: 4 },
    ];
    const factor = computeRecentFactor(runs);
    expect(factor).toBeLessThan(1.0);
  });

  it("median correctly smooths mixed-condition segments", () => {
    const runs = [
      { actualMinutes: 10, predictedMinutes: 5 }, // ratio 2.0 (congested)
      { actualMinutes: 5, predictedMinutes: 5 },  // ratio 1.0 (normal)
      { actualMinutes: 3, predictedMinutes: 5 },  // ratio 0.6 (free flow)
    ];
    const factor = computeRecentFactor(runs);
    // Median of [0.6, 1.0, 2.0] = 1.0
    expect(factor).toBeCloseTo(1.0, 5);
  });
});
