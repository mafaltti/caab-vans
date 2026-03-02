/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import { computeEta } from "@/lib/tracking/eta";
import type { VanPosition } from "@/lib/tracking/eta";

const TZ = "America/Bahia";

describe("computeEta", () => {
  it("computes ETA with 5-min delay", () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject(
          { hour: 8, minute: 35 },
          { zone: TZ },
        ).toISO()!,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
    ];
    const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });

    const result = computeEta({ stops, now });

    expect(result.nextStopId).toBe("b");
    expect(result.delayMinutes).toBe(5);
    expect(result.etaNextStopMinutes).toBe(8);
    expect(result.passedStopIds).toEqual(["a"]);
  });

  it("returns scheduled time when no stops have been passed", () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "09:00",
        status: "pending" as const,
        passedAt: null,
      },
      {
        scheduleEntryId: "b",
        time: "09:15",
        status: "pending" as const,
        passedAt: null,
      },
    ];
    const now = DateTime.fromObject({ hour: 8, minute: 50 }, { zone: TZ });

    const result = computeEta({ stops, now });

    expect(result.nextStopId).toBe("a");
    expect(result.delayMinutes).toBeNull();
    expect(result.etaNextStopMinutes).toBe(10);
    expect(result.passedStopIds).toEqual([]);
  });

  it("returns null ETA when all stops have been passed", () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: "2026-03-01T08:32:00-03:00",
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "passed" as const,
        passedAt: "2026-03-01T08:48:00-03:00",
      },
    ];
    const now = DateTime.fromObject({ hour: 9, minute: 0 }, { zone: TZ });

    const result = computeEta({ stops, now });

    expect(result.etaNextStopISO).toBeNull();
    expect(result.etaNextStopMinutes).toBeNull();
    expect(result.nextStopId).toBeNull();
    expect(result.passedStopIds).toEqual(["a", "b"]);
  });

  it("computes negative delay when van is ahead of schedule", () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject(
          { hour: 8, minute: 25 },
          { zone: TZ },
        ).toISO()!,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
    ];
    const now = DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ });

    const result = computeEta({ stops, now });

    expect(result.nextStopId).toBe("b");
    expect(result.delayMinutes).toBe(-5);
    // ETA = 08:45 + (-5) = 08:40; minutes from 08:35 to 08:40 = 5
    expect(result.etaNextStopMinutes).toBe(5);
    expect(result.passedStopIds).toEqual(["a"]);
  });

  it("computes zero delay when van is exactly on time", () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject(
          { hour: 8, minute: 30 },
          { zone: TZ },
        ).toISO()!,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
    ];
    const now = DateTime.fromObject({ hour: 8, minute: 40 }, { zone: TZ });

    const result = computeEta({ stops, now });

    expect(result.nextStopId).toBe("b");
    expect(result.delayMinutes).toBe(0);
    // ETA = 08:45 + 0 = 08:45; minutes from 08:40 to 08:45 = 5
    expect(result.etaNextStopMinutes).toBe(5);
    expect(result.passedStopIds).toEqual(["a"]);
  });

  describe("time-aware filtering", () => {
    it("picks the correct future stop when tracking starts mid-day", () => {
      const stops = [
        {
          scheduleEntryId: "caab-0000",
          time: "00:00",
          status: "pending" as const,
          passedAt: null,
        },
        {
          scheduleEntryId: "stop-0800",
          time: "08:00",
          status: "pending" as const,
          passedAt: null,
        },
        {
          scheduleEntryId: "stop-2200",
          time: "22:00",
          status: "passed" as const,
          passedAt: DateTime.fromObject(
            { hour: 22, minute: 2 },
            { zone: TZ },
          ).toISO()!,
        },
        {
          scheduleEntryId: "stop-2240",
          time: "22:40",
          status: "pending" as const,
          passedAt: null,
        },
      ];
      const now = DateTime.fromObject({ hour: 22, minute: 35 }, { zone: TZ });

      const result = computeEta({ stops, now });

      expect(result.nextStopId).toBe("stop-2240");
      expect(result.etaNextStopMinutes).toBeGreaterThan(0);
      expect(result.passedStopIds).toEqual(["stop-2200"]);
    });

    it("returns null ETA when all pending stops are in the past", () => {
      const stops = [
        {
          scheduleEntryId: "caab-0000",
          time: "00:00",
          status: "pending" as const,
          passedAt: null,
        },
        {
          scheduleEntryId: "stop-0800",
          time: "08:00",
          status: "pending" as const,
          passedAt: null,
        },
        {
          scheduleEntryId: "stop-2200",
          time: "22:00",
          status: "passed" as const,
          passedAt: "2026-03-01T22:02:00-03:00",
        },
        {
          scheduleEntryId: "stop-2220",
          time: "22:20",
          status: "passed" as const,
          passedAt: "2026-03-01T22:22:00-03:00",
        },
      ];
      const now = DateTime.fromObject({ hour: 23, minute: 0 }, { zone: TZ });

      const result = computeEta({ stops, now });

      expect(result.nextStopId).toBeNull();
      expect(result.etaNextStopMinutes).toBeNull();
      expect(result.etaNextStopISO).toBeNull();
      expect(result.passedStopIds).toEqual(["stop-2200", "stop-2220"]);
    });

    it("does not regress when all pending stops are in the future", () => {
      const stops = [
        {
          scheduleEntryId: "a",
          time: "09:00",
          status: "pending" as const,
          passedAt: null,
        },
        {
          scheduleEntryId: "b",
          time: "09:15",
          status: "pending" as const,
          passedAt: null,
        },
      ];
      const now = DateTime.fromObject({ hour: 8, minute: 50 }, { zone: TZ });

      const result = computeEta({ stops, now });

      expect(result.nextStopId).toBe("a");
      expect(result.etaNextStopMinutes).toBe(10);
    });

    it("still counts passed stops correctly with time-aware filter", () => {
      const stops = [
        {
          scheduleEntryId: "a",
          time: "08:00",
          status: "passed" as const,
          passedAt: "2026-03-01T08:02:00-03:00",
        },
        {
          scheduleEntryId: "b",
          time: "08:15",
          status: "passed" as const,
          passedAt: "2026-03-01T08:18:00-03:00",
        },
        {
          scheduleEntryId: "c-past-pending",
          time: "08:30",
          status: "pending" as const,
          passedAt: null,
        },
        {
          scheduleEntryId: "d",
          time: "22:40",
          status: "pending" as const,
          passedAt: null,
        },
      ];
      const now = DateTime.fromObject({ hour: 22, minute: 35 }, { zone: TZ });

      const result = computeEta({ stops, now });

      expect(result.passedStopIds).toEqual(["a", "b"]);
      expect(result.nextStopId).toBe("d");
    });
  });

  describe("GPS-based ETA", () => {
    // Salvador, Bahia area coordinates
    // Van position: ~12.9714° S, 38.5124° W (Pituba)
    // Stop position: ~12.9814° S, 38.4524° W (Itapuã) — ~6.6 km apart
    const VAN_LAT = -12.9714;
    const VAN_LNG = -38.5124;
    const STOP_LAT = -12.9814;
    const STOP_LNG = -38.4524;

    function makeVanPosition(
      overrides: Partial<VanPosition> = {},
    ): VanPosition {
      return {
        lat: VAN_LAT,
        lng: VAN_LNG,
        speedMps: 10, // ~36 km/h
        locationUpdatedAt: DateTime.fromObject(
          { hour: 8, minute: 40 },
          { zone: TZ },
        ),
        ...overrides,
      };
    }

    function makeStops(overrides: { stopLat?: number | null; stopLng?: number | null } = {}) {
      return [
        {
          scheduleEntryId: "a",
          time: "08:30",
          status: "passed" as const,
          passedAt: DateTime.fromObject(
            { hour: 8, minute: 35 },
            { zone: TZ },
          ).toISO()!,
          stopLat: -12.96,
          stopLng: -38.52,
        },
        {
          scheduleEntryId: "b",
          time: "08:45",
          status: "pending" as const,
          passedAt: null,
          stopLat: overrides.stopLat !== undefined ? overrides.stopLat : STOP_LAT,
          stopLng: overrides.stopLng !== undefined ? overrides.stopLng : STOP_LNG,
        },
      ];
    }

    it("uses GPS when van is moving + fresh location + stop has coords", () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition();
      const stops = makeStops();

      const result = computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("gps");
      expect(result.nextStopId).toBe("b");
      expect(result.etaNextStopMinutes).toBeGreaterThan(0);
      expect(result.etaNextStopISO).not.toBeNull();
    });

    it("falls back when speed = 0", () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({ speedMps: 0 });
      const stops = makeStops();

      const result = computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("schedule");
    });

    it("falls back when speed < MIN_SPEED_MPS", () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({ speedMps: 0.5 });
      const stops = makeStops();

      const result = computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("schedule");
    });

    it("falls back when location is stale (>10 min)", () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({
        locationUpdatedAt: DateTime.fromObject(
          { hour: 8, minute: 20 },
          { zone: TZ },
        ), // 22 minutes ago
      });
      const stops = makeStops();

      const result = computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("schedule");
    });

    it("falls back when stop has no coords", () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition();
      const stops = makeStops({ stopLat: null, stopLng: null });

      const result = computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("schedule");
    });

    it("falls back when vanPosition is null", () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const stops = makeStops();

      const result = computeEta({ stops, now, vanPosition: null });

      expect(result.etaSource).toBe("schedule");
    });

    it("returns ~0 min ETA when van is at the stop", () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({
        lat: STOP_LAT,
        lng: STOP_LNG,
      });
      const stops = makeStops();

      const result = computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("gps");
      expect(result.etaNextStopMinutes).toBe(0);
    });

    it("falls back when locationUpdatedAt is in the future (clock skew)", () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({
        locationUpdatedAt: DateTime.fromObject(
          { hour: 8, minute: 50 },
          { zone: TZ },
        ), // 8 minutes in the future
      });
      const stops = makeStops();

      const result = computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("schedule");
    });

    it("backward compat: existing tests work with vanPosition not provided", () => {
      const stops = [
        {
          scheduleEntryId: "a",
          time: "08:30",
          status: "passed" as const,
          passedAt: DateTime.fromObject(
            { hour: 8, minute: 35 },
            { zone: TZ },
          ).toISO()!,
        },
        {
          scheduleEntryId: "b",
          time: "08:45",
          status: "pending" as const,
          passedAt: null,
        },
      ];
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });

      const result = computeEta({ stops, now });

      expect(result.etaSource).toBe("schedule");
      expect(result.nextStopId).toBe("b");
      expect(result.delayMinutes).toBe(5);
      expect(result.etaNextStopMinutes).toBe(8);
    });

    it("uses GPS ETA for next pending occurrence after repeated stop partial progress", () => {
      const now = DateTime.fromObject({ hour: 8, minute: 30 }, { zone: TZ });
      const vanPosition = makeVanPosition({
        locationUpdatedAt: DateTime.fromObject(
          { hour: 8, minute: 28 },
          { zone: TZ },
        ),
      });
      const stops = [
        {
          scheduleEntryId: "caab-0700",
          time: "07:00",
          status: "passed" as const,
          passedAt: DateTime.fromObject(
            { hour: 7, minute: 3 },
            { zone: TZ },
          ).toISO()!,
          stopLat: STOP_LAT,
          stopLng: STOP_LNG,
        },
        {
          scheduleEntryId: "caab-0900",
          time: "09:00",
          status: "pending" as const,
          passedAt: null,
          stopLat: STOP_LAT,
          stopLng: STOP_LNG,
        },
      ];

      const result = computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("gps");
      expect(result.nextStopId).toBe("caab-0900");
      expect(result.etaNextStopMinutes).toBeGreaterThan(0);
    });
  });
});
