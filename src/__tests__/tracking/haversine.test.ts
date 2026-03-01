/// <reference types="vitest/globals" />
import { haversineDistanceMeters } from "@/lib/tracking/haversine";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    const d = haversineDistanceMeters(-12.9714, -38.5124, -12.9714, -38.5124);
    expect(d).toBe(0);
  });

  it("calculates ~55m for Salvador nearby pair", () => {
    const d = haversineDistanceMeters(-12.9714, -38.5124, -12.9718, -38.512);
    expect(d).toBeGreaterThan(45);
    expect(d).toBeLessThan(65);
  });

  it("calculates ~5,570 km for New York to London", () => {
    const d = haversineDistanceMeters(40.7128, -74.006, 51.5074, -0.1278);
    const km = d / 1000;
    expect(km).toBeCloseTo(5570, -2); // within 1% (~55 km)
    expect(km).toBeGreaterThan(5570 * 0.99);
    expect(km).toBeLessThan(5570 * 1.01);
  });

  it("calculates ~20,015 km for antipodal points (half Earth circumference)", () => {
    const d = haversineDistanceMeters(0, 0, 0, 180);
    const km = d / 1000;
    expect(km).toBeGreaterThan(20015 * 0.99);
    expect(km).toBeLessThan(20015 * 1.01);
  });

  it("calculates ~111 km for 1 degree longitude at equator", () => {
    const d = haversineDistanceMeters(0, 0, 0, 1);
    const km = d / 1000;
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(112);
  });
});
