/// <reference types="vitest/globals" />
import { haversineDistanceMeters } from "@/lib/tracking/haversine";

describe("geofence detection via haversineDistanceMeters", () => {
  const stopLat = -12.9714;
  const stopLng = -38.5124;

  it("detects a point within 50m geofence", () => {
    const vanLat = -12.97143;
    const vanLng = -38.51237;
    const distance = haversineDistanceMeters(vanLat, vanLng, stopLat, stopLng);
    expect(distance).toBeLessThan(50);
  });

  it("rejects a point outside 50m geofence", () => {
    const vanLat = -12.9724;
    const vanLng = -38.5124;
    const distance = haversineDistanceMeters(vanLat, vanLng, stopLat, stopLng);
    expect(distance).toBeGreaterThan(50);
  });

  it("accepts a point ~80m away with 100m geofence radius", () => {
    // Move ~80m south (roughly 0.00072 degrees latitude)
    const vanLat = stopLat - 0.00072;
    const vanLng = stopLng;
    const distance = haversineDistanceMeters(vanLat, vanLng, stopLat, stopLng);
    expect(distance).toBeGreaterThan(70);
    expect(distance).toBeLessThan(90);
    expect(distance).toBeLessThan(100); // within 100m geofence
  });

  it("verifies monotonically increasing distances from reference point", () => {
    const points: [number, number][] = [
      [stopLat + 0.0001, stopLng], // ~11m
      [stopLat + 0.0005, stopLng], // ~55m
      [stopLat + 0.001, stopLng], // ~111m
      [stopLat + 0.005, stopLng], // ~555m
    ];

    const distances = points.map(([lat, lng]) =>
      haversineDistanceMeters(stopLat, stopLng, lat, lng),
    );

    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThan(distances[i - 1]);
    }
  });
});
