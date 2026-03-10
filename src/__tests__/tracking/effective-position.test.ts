/// <reference types="vitest/globals" />
import { chooseEffectivePosition } from "@/lib/tracking/effective-position";

// Salvador, Bahia area coordinates
// Base raw position: ~Pituba neighborhood
const RAW_LAT = -12.9714;
const RAW_LNG = -38.5124;

// Target stop: ~200m south-east of raw
const TARGET_LAT = -12.9730;
const TARGET_LNG = -38.5108;

describe("chooseEffectivePosition", () => {
  // T032: raw preferred when closer to target
  it("T032: returns raw when raw is closer to target than snapped", () => {
    // Snapped position: ~300m north-west of target (farther than raw)
    const snappedLat = -12.9700;
    const snappedLng = -38.5140;

    const result = chooseEffectivePosition({
      rawLat: RAW_LAT,
      rawLng: RAW_LNG,
      snappedLat,
      snappedLng,
      targetLat: TARGET_LAT,
      targetLng: TARGET_LNG,
      snapDisplacementThreshold: 500, // generous threshold
    });

    expect(result).toEqual({ lat: RAW_LAT, lng: RAW_LNG, source: "raw" });
  });

  // T033: snapped preferred when closer to target
  it("T033: returns snapped when snapped is closer to target than raw", () => {
    // Snapped position: very close to target (~30m away)
    const snappedLat = -12.9728;
    const snappedLng = -38.5110;

    const result = chooseEffectivePosition({
      rawLat: RAW_LAT,
      rawLng: RAW_LNG,
      snappedLat,
      snappedLng,
      targetLat: TARGET_LAT,
      targetLng: TARGET_LNG,
      snapDisplacementThreshold: 500,
    });

    expect(result).toEqual({ lat: snappedLat, lng: snappedLng, source: "snapped" });
  });

  // T034: fallback to raw when snapped is null/undefined
  it("T034: returns raw when snappedLat/snappedLng are null", () => {
    const result = chooseEffectivePosition({
      rawLat: RAW_LAT,
      rawLng: RAW_LNG,
      snappedLat: null,
      snappedLng: null,
      targetLat: TARGET_LAT,
      targetLng: TARGET_LNG,
      snapDisplacementThreshold: 500,
    });

    expect(result).toEqual({ lat: RAW_LAT, lng: RAW_LNG, source: "raw" });
  });

  it("T034: returns raw when snappedLat/snappedLng are undefined", () => {
    const result = chooseEffectivePosition({
      rawLat: RAW_LAT,
      rawLng: RAW_LNG,
      snappedLat: undefined,
      snappedLng: undefined,
      targetLat: TARGET_LAT,
      targetLng: TARGET_LNG,
      snapDisplacementThreshold: 500,
    });

    expect(result).toEqual({ lat: RAW_LAT, lng: RAW_LNG, source: "raw" });
  });

  // T035: fallback to raw when snap displacement exceeds threshold
  it("T035: returns raw when snap displacement exceeds threshold even if snapped is closer to target", () => {
    // Snapped position: closer to target but far from raw (~800m displacement)
    const snappedLat = -12.9729;
    const snappedLng = -38.5050; // significantly displaced in longitude

    const result = chooseEffectivePosition({
      rawLat: RAW_LAT,
      rawLng: RAW_LNG,
      snappedLat,
      snappedLng,
      targetLat: TARGET_LAT,
      targetLng: TARGET_LNG,
      snapDisplacementThreshold: 100, // tight threshold to trigger fallback
    });

    expect(result).toEqual({ lat: RAW_LAT, lng: RAW_LNG, source: "raw" });
  });
});
