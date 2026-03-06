/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import { computeEta, computeSmoothedSpeed, PROXIMITY_THRESHOLD_M } from "@/lib/tracking/eta";
import type { VanPosition } from "@/lib/tracking/eta";

const TZ = "America/Bahia";

describe("computeEta", () => {
  it("computes ETA with 5-min delay", async () => {
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

    const result = await computeEta({ stops, now });

    expect(result.nextStopId).toBe("b");
    expect(result.delayMinutes).toBe(5);
    expect(result.etaNextStopMinutes).toBe(8);
    expect(result.passedStopIds).toEqual(["a"]);
  });

  it("returns scheduled time when no stops have been passed", async () => {
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

    const result = await computeEta({ stops, now });

    expect(result.nextStopId).toBe("a");
    expect(result.delayMinutes).toBeNull();
    expect(result.etaNextStopMinutes).toBe(10);
    expect(result.passedStopIds).toEqual([]);
  });

  it("returns null ETA when all stops have been passed", async () => {
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

    const result = await computeEta({ stops, now });

    expect(result.etaNextStopISO).toBeNull();
    expect(result.etaNextStopMinutes).toBeNull();
    expect(result.nextStopId).toBeNull();
    expect(result.passedStopIds).toEqual(["a", "b"]);
  });

  it("computes negative delay when van is ahead of schedule", async () => {
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

    const result = await computeEta({ stops, now });

    expect(result.nextStopId).toBe("b");
    expect(result.delayMinutes).toBe(-5);
    // ETA = 08:45 + (-5) = 08:40; minutes from 08:35 to 08:40 = 5
    expect(result.etaNextStopMinutes).toBe(5);
    expect(result.passedStopIds).toEqual(["a"]);
  });

  it("computes zero delay when van is exactly on time", async () => {
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

    const result = await computeEta({ stops, now });

    expect(result.nextStopId).toBe("b");
    expect(result.delayMinutes).toBe(0);
    // ETA = 08:45 + 0 = 08:45; minutes from 08:40 to 08:45 = 5
    expect(result.etaNextStopMinutes).toBe(5);
    expect(result.passedStopIds).toEqual(["a"]);
  });

  describe("time-aware filtering", () => {
    it("picks the correct future stop when tracking starts mid-day", async () => {
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

      const result = await computeEta({ stops, now });

      expect(result.nextStopId).toBe("stop-2240");
      expect(result.etaNextStopMinutes).toBeGreaterThan(0);
      expect(result.passedStopIds).toEqual(["stop-2200"]);
    });

    it("returns null ETA when all pending stops are in the past", async () => {
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

      const result = await computeEta({ stops, now });

      expect(result.nextStopId).toBeNull();
      expect(result.etaNextStopMinutes).toBeNull();
      expect(result.etaNextStopISO).toBeNull();
      expect(result.passedStopIds).toEqual(["stop-2200", "stop-2220"]);
    });

    it("does not regress when all pending stops are in the future", async () => {
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

      const result = await computeEta({ stops, now });

      expect(result.nextStopId).toBe("a");
      expect(result.etaNextStopMinutes).toBe(10);
    });

    it("still counts passed stops correctly with time-aware filter", async () => {
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

      const result = await computeEta({ stops, now });

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

    it("uses GPS when van is moving + fresh location + stop has coords", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition();
      const stops = makeStops();

      const result = await computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("gps");
      expect(result.nextStopId).toBe("b");
      expect(result.etaNextStopMinutes).toBeGreaterThan(0);
      expect(result.etaNextStopISO).not.toBeNull();
    });

    it("falls back when speed = 0", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({ speedMps: 0 });
      const stops = makeStops();

      const result = await computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("schedule");
    });

    it("falls back when speed < MIN_SPEED_MPS", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({ speedMps: 0.5 });
      const stops = makeStops();

      const result = await computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("schedule");
    });

    it("falls back when location is stale (>10 min)", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({
        locationUpdatedAt: DateTime.fromObject(
          { hour: 8, minute: 20 },
          { zone: TZ },
        ), // 22 minutes ago
      });
      const stops = makeStops();

      const result = await computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("schedule");
    });

    it("falls back when stop has no coords", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition();
      const stops = makeStops({ stopLat: null, stopLng: null });

      const result = await computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("schedule");
    });

    it("falls back when vanPosition is null", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const stops = makeStops();

      const result = await computeEta({ stops, now, vanPosition: null });

      expect(result.etaSource).toBe("schedule");
    });

    it("returns ~0 min ETA when van is at the stop", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({
        lat: STOP_LAT,
        lng: STOP_LNG,
      });
      const stops = makeStops();

      const result = await computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("gps");
      expect(result.etaNextStopMinutes).toBe(0);
    });

    it("falls back when locationUpdatedAt is in the future (clock skew)", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({
        locationUpdatedAt: DateTime.fromObject(
          { hour: 8, minute: 50 },
          { zone: TZ },
        ), // 8 minutes in the future
      });
      const stops = makeStops();

      const result = await computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("schedule");
    });

    it("backward compat: existing tests work with vanPosition not provided", async () => {
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

      const result = await computeEta({ stops, now });

      expect(result.etaSource).toBe("schedule");
      expect(result.nextStopId).toBe("b");
      expect(result.delayMinutes).toBe(5);
      expect(result.etaNextStopMinutes).toBe(8);
    });

    it("uses OSRM road distance when osrmBaseUrl is provided and OSRM responds", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition();
      const stops = makeStops();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: "Ok",
          routes: [{ distance: 8500, duration: 600 }],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await computeEta({
        stops,
        now,
        vanPosition,
        osrmBaseUrl: "http://localhost:5000",
      });

      expect(result.etaSource).toBe("gps_osrm");
      expect(result.nextStopId).toBe("b");
      expect(result.etaNextStopMinutes).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/route/v1/driving/");

      vi.unstubAllGlobals();
    });

    it("falls back to haversine when OSRM fails", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition();
      const stops = makeStops();

      const mockFetch = vi.fn().mockRejectedValue(new Error("connection refused"));
      vi.stubGlobal("fetch", mockFetch);

      const result = await computeEta({
        stops,
        now,
        vanPosition,
        osrmBaseUrl: "http://localhost:5000",
      });

      expect(result.etaSource).toBe("gps");
      expect(result.nextStopId).toBe("b");
      expect(result.etaNextStopMinutes).toBeGreaterThan(0);

      vi.unstubAllGlobals();
    });

    it("falls back to haversine when OSRM returns non-Ok", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition();
      const stops = makeStops();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: "NoRoute", routes: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await computeEta({
        stops,
        now,
        vanPosition,
        osrmBaseUrl: "http://localhost:5000",
      });

      expect(result.etaSource).toBe("gps");
      expect(result.nextStopId).toBe("b");

      vi.unstubAllGlobals();
    });

    it("uses OSRM duration instead of distance/speed for base ETA", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({ speedMps: 10 });
      const stops = makeStops();

      // OSRM returns 180s (3 min) duration but 8500m distance
      // distance/speed would give ~8500/10/60 ≈ 14 min, but OSRM duration gives 3 min
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: "Ok",
          routes: [{ distance: 8500, duration: 180 }],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await computeEta({
        stops,
        now,
        vanPosition,
        osrmBaseUrl: "http://localhost:5000",
      });

      expect(result.etaSource).toBe("gps_osrm");
      // 180s = 3 min * timeFactor(1.4 at hour 8) = 4.2 min → ceil = 5
      expect(result.etaNextStopMinutes).toBe(5);

      vi.unstubAllGlobals();
    });

    it("OSRM duration is speed-independent", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const stops = makeStops();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: "Ok",
          routes: [{ distance: 8500, duration: 180 }],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const resultSlow = await computeEta({
        stops,
        now,
        vanPosition: makeVanPosition({ speedMps: 5 }),
        osrmBaseUrl: "http://localhost:5000",
      });

      const resultFast = await computeEta({
        stops,
        now,
        vanPosition: makeVanPosition({ speedMps: 15 }),
        osrmBaseUrl: "http://localhost:5000",
      });

      expect(resultSlow.etaNextStopMinutes).toBe(resultFast.etaNextStopMinutes);

      vi.unstubAllGlobals();
    });

    it("uses GPS via proximity fallback when speed=0 and stop is near", async () => {
      // Close stop: ~200m from van
      const CLOSE_STOP_LAT = -12.9720;
      const CLOSE_STOP_LNG = -38.5110;

      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({ speedMps: 0 });
      const stops = makeStops({ stopLat: CLOSE_STOP_LAT, stopLng: CLOSE_STOP_LNG });

      const result = await computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("gps");
      expect(result.etaNextStopMinutes).toBeLessThanOrEqual(3);
    });

    it("falls back to schedule when speed=0 and stop is far", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({ speedMps: 0 });
      const stops = makeStops(); // default STOP_LAT/LNG ~6.6km away

      const result = await computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("schedule");
    });

    it("uses proximity fallback at ~500m boundary", async () => {
      // ~490m north of van (approx 0.0044 degrees latitude)
      const BOUNDARY_STOP_LAT = VAN_LAT + 0.0044;
      const BOUNDARY_STOP_LNG = VAN_LNG;

      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({ speedMps: 0 });
      const stops = makeStops({ stopLat: BOUNDARY_STOP_LAT, stopLng: BOUNDARY_STOP_LNG });

      const result = await computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("gps");
    });

    it("uses GPS ETA for next pending occurrence after repeated stop partial progress", async () => {
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

      const result = await computeEta({ stops, now, vanPosition });

      expect(result.etaSource).toBe("gps");
      expect(result.nextStopId).toBe("caab-0900");
      expect(result.etaNextStopMinutes).toBeGreaterThan(0);
    });

    describe("smoothed speed", () => {
      it("computeSmoothedSpeed returns mean of non-zero values", () => {
        expect(computeSmoothedSpeed([5, 3, 7, 0, 4, 6, 0, 5, 3, 4])).toBeCloseTo(4.625);
      });

      it("brief speed drop does not cause ETA spike > 50%", async () => {
        const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
        const vanPosition = makeVanPosition({ speedMps: 10 });
        const stops = makeStops();

        const resultWithDip = await computeEta({
          stops,
          now,
          vanPosition,
          recentSpeeds: [10, 10, 10, 10, 2, 10, 10, 10, 10, 10],
        });

        const resultSteady = await computeEta({
          stops,
          now,
          vanPosition,
          recentSpeeds: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        });

        const ratio = resultWithDip.etaNextStopMinutes! / resultSteady.etaNextStopMinutes!;
        expect(ratio).toBeLessThanOrEqual(1.5);
      });

      it("all speeds zero within 500m uses proximity fallback", async () => {
        const CLOSE_STOP_LAT = -12.9720;
        const CLOSE_STOP_LNG = -38.5110;

        const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
        const vanPosition = makeVanPosition({ speedMps: 0 });
        const stops = makeStops({ stopLat: CLOSE_STOP_LAT, stopLng: CLOSE_STOP_LNG });

        const result = await computeEta({
          stops,
          now,
          vanPosition,
          recentSpeeds: [0, 0, 0, 0, 0],
        });

        expect(result.etaSource).toBe("gps");
      });

      it("computeSmoothedSpeed handles partial window (2 readings)", () => {
        expect(computeSmoothedSpeed([8, 4])).toBeCloseTo(6);
      });
    });
  });
});
