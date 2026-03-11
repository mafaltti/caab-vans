/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import {
  suggestStartStop,
  type ScheduleEntryForSuggestion,
} from "@/lib/tracking/suggest-start-stop";

const TZ = "America/Bahia";

function makeEntry(
  id: string,
  time: string,
  lat: number | null = -12.9714,
  lng: number | null = -38.5124,
  seq: number = 1,
): ScheduleEntryForSuggestion {
  return { id, stop_name: `Stop ${id}`, arrival_time: time, stop_sequence: seq, stop_lat: lat, stop_lng: lng };
}

// Position near CAAB (within 2km)
const NEAR_LAT = -12.972;
const NEAR_LNG = -38.513;

// Position far from CAAB (>2km)
const FAR_LAT = -13.0;
const FAR_LNG = -38.6;

function nowAt(hh: string, mm: string): DateTime {
  return DateTime.fromObject(
    { hour: parseInt(hh), minute: parseInt(mm), second: 0 },
    { zone: TZ },
  );
}

describe("suggestStartStop", () => {
  const entries: ScheduleEntryForSuggestion[] = [
    makeEntry("e1", "06:10", -12.9714, -38.5124, 1),
    makeEntry("e2", "06:30", -12.9714, -38.5124, 2),
    makeEntry("e3", "07:00", -12.9714, -38.5124, 3),
    makeEntry("e4", "07:30", -12.9714, -38.5124, 4),
    makeEntry("e5", "08:00", -12.9714, -38.5124, 5),
  ];

  describe("with GPS (proximity filter)", () => {
    it("suggests the closest stop by time when nearby", () => {
      const result = suggestStartStop({
        entries,
        lat: NEAR_LAT,
        lng: NEAR_LNG,
        now: nowAt("07", "05"),
      });

      expect(result.suggestedStop).not.toBeNull();
      expect(result.suggestedStop!.id).toBe("e3"); // 07:00 is closest to 07:05
      expect(result.alternatives.length).toBeGreaterThan(0);
      expect(result.alternatives.length).toBeLessThanOrEqual(4);
    });

    it("includes stops within 30min future window", () => {
      const result = suggestStartStop({
        entries,
        lat: NEAR_LAT,
        lng: NEAR_LNG,
        now: nowAt("07", "35"),
      });

      // 08:00 is within 30min of 07:35 → included
      expect(result.suggestedStop).not.toBeNull();
      const allIds = [
        result.suggestedStop!.id,
        ...result.alternatives.map((a) => a.id),
      ];
      expect(allIds).toContain("e5"); // 08:00
    });

    it("returns no candidates when all stops are far away", () => {
      const result = suggestStartStop({
        entries,
        lat: FAR_LAT,
        lng: FAR_LNG,
        now: nowAt("07", "00"),
      });

      // Falls back to time-only list
      expect(result.suggestedStop).toBeNull();
    });

    it("skips stops with null coordinates", () => {
      const mixed = [
        makeEntry("e1", "07:00", null, null, 1),
        makeEntry("e2", "07:10", -12.9714, -38.5124, 2),
      ];

      const result = suggestStartStop({
        entries: mixed,
        lat: NEAR_LAT,
        lng: NEAR_LNG,
        now: nowAt("07", "05"),
      });

      expect(result.suggestedStop).not.toBeNull();
      expect(result.suggestedStop!.id).toBe("e2");
    });

    it("disambiguates stops at same location by time closeness", () => {
      const samePlace = [
        makeEntry("e1", "07:00", -12.9714, -38.5124, 1),
        makeEntry("e2", "07:30", -12.9714, -38.5124, 2),
        makeEntry("e3", "08:00", -12.9714, -38.5124, 3),
      ];

      const result = suggestStartStop({
        entries: samePlace,
        lat: NEAR_LAT,
        lng: NEAR_LNG,
        now: nowAt("07", "25"),
      });

      // 07:30 is closest to 07:25
      expect(result.suggestedStop!.id).toBe("e2");
    });
  });

  describe("no-GPS fallback (time-only)", () => {
    it("returns null suggestedStop with up to 5 time-only alternatives", () => {
      const result = suggestStartStop({
        entries,
        lat: null,
        lng: null,
        now: nowAt("07", "00"),
      });

      expect(result.suggestedStop).toBeNull();
      expect(result.alternatives.length).toBeLessThanOrEqual(5);
      expect(result.alternatives.length).toBeGreaterThan(0);
    });

    it("sorts alternatives by time closeness to now", () => {
      const result = suggestStartStop({
        entries,
        lat: null,
        lng: null,
        now: nowAt("07", "00"),
      });

      // 07:00 should be first (exact match)
      expect(result.alternatives[0].id).toBe("e3");
    });

    it("caps at 5 alternatives", () => {
      const manyEntries = Array.from({ length: 10 }, (_, i) =>
        makeEntry(`e${i}`, `07:${String(i * 3).padStart(2, "0")}`, -12.9714, -38.5124, i + 1),
      );

      const result = suggestStartStop({
        entries: manyEntries,
        lat: null,
        lng: null,
        now: nowAt("07", "15"),
      });

      expect(result.alternatives.length).toBeLessThanOrEqual(5);
    });
  });

  describe("edge cases", () => {
    it("returns empty when no entries exist", () => {
      const result = suggestStartStop({
        entries: [],
        lat: NEAR_LAT,
        lng: NEAR_LNG,
        now: nowAt("07", "00"),
      });

      expect(result.suggestedStop).toBeNull();
      expect(result.alternatives).toEqual([]);
    });

    it("filters out stops more than 30min in the future", () => {
      const futureEntries = [makeEntry("e1", "10:00", -12.9714, -38.5124, 1)];

      const result = suggestStartStop({
        entries: futureEntries,
        lat: NEAR_LAT,
        lng: NEAR_LNG,
        now: nowAt("07", "00"),
      });

      expect(result.suggestedStop).toBeNull();
      expect(result.alternatives).toEqual([]);
    });
  });
});
