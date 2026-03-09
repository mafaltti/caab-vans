/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import { computeEta, computeSmoothedSpeed } from "@/lib/tracking/eta";
import type { VanPosition } from "@/lib/tracking/eta";
import { getTimeFactor, REFERENCE_SPEED_MPS } from "@/lib/tracking/time-factors";

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

    it("falls back to first pending by route order when all pending stops are overdue", async () => {
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

      // Route-order fallback: first pending stop by schedule order
      expect(result.nextStopId).toBe("caab-0000");
      expect(result.etaSource).toBe("schedule");
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
    // Van position: ~12.9714 S, 38.5124 W (Pituba)
    // Stop position: ~12.9814 S, 38.4524 W (Itapua) — ~6.6 km apart
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
        lastGpsFixAt: DateTime.fromObject(
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
        lastGpsFixAt: DateTime.fromObject(
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

    it("falls back when lastGpsFixAt is in the future (clock skew)", async () => {
      const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({
        lastGpsFixAt: DateTime.fromObject(
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
      // Use a known weekday (Monday) so timeFactor is deterministic (1.4 at hour 8)
      const now = DateTime.fromObject({ year: 2026, month: 3, day: 2, hour: 8, minute: 42 }, { zone: TZ });
      const vanPosition = makeVanPosition({
        speedMps: 10,
        lastGpsFixAt: DateTime.fromObject({ year: 2026, month: 3, day: 2, hour: 8, minute: 40 }, { zone: TZ }),
      });
      const stops = makeStops();

      // OSRM returns 180s (3 min) duration but 8500m distance
      // distance/speed would give ~8500/10/60 ~ 14 min, but OSRM duration gives 3 min
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
      // 180s = 3 min * timeFactor(1.4 at hour 8 weekday) = 4.2 min -> ceil = 5
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
        lastGpsFixAt: DateTime.fromObject(
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
      it("computeSmoothedSpeed returns median of non-zero values", () => {
        // [3,4,4,5,5,5,6,7] sorted non-zero, median of 8 = avg(5,5) = 5
        expect(computeSmoothedSpeed([5, 3, 7, 0, 4, 6, 0, 5, 3, 4])).toBeCloseTo(4.5);
      });

      it("computeSmoothedSpeed resists GPS spike", () => {
        // [4,5,5,5,5,5,6,6,6,40] sorted non-zero, median of 10 = avg(5,6) = 5.5
        expect(computeSmoothedSpeed([5, 6, 5, 40, 6, 5, 4, 6, 5, 6])).toBeCloseTo(5.5);
      });

      it("brief speed drop does not cause ETA spike > 50%", async () => {
        const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
        const vanPosition = makeVanPosition({ speedMps: 10 });
        const stops = makeStops();

        const recentSpeedsWithDip = [10, 10, 10, 10, 2, 10, 10, 10, 10, 10].map(
          (s, i) => ({ speedMps: s, deviceTs: now.minus({ seconds: i * 15 }).toISO()! }),
        );
        const recentSpeedsSteady = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10].map(
          (s, i) => ({ speedMps: s, deviceTs: now.minus({ seconds: i * 15 }).toISO()! }),
        );

        const resultWithDip = await computeEta({
          stops,
          now,
          vanPosition,
          recentSpeeds: recentSpeedsWithDip,
        });

        const resultSteady = await computeEta({
          stops,
          now,
          vanPosition,
          recentSpeeds: recentSpeedsSteady,
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

        const recentSpeeds = [0, 0, 0, 0, 0].map(
          (s, i) => ({ speedMps: s, deviceTs: now.minus({ seconds: i * 15 }).toISO()! }),
        );

        const result = await computeEta({
          stops,
          now,
          vanPosition,
          recentSpeeds,
        });

        expect(result.etaSource).toBe("gps");
      });

      it("computeSmoothedSpeed handles partial window (2 readings)", () => {
        // [4, 8] sorted, median of 2 = avg(4, 8) = 6
        expect(computeSmoothedSpeed([8, 4])).toBeCloseTo(6);
      });

      it("speed=0 with non-zero recentSpeeds and far stop falls back to schedule without hysteresis", async () => {
        const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
        const vanPosition = makeVanPosition({ speedMps: 0 });
        const stops = makeStops(); // default ~6.6km away

        // All pings are old (>60s ago) so hysteresis does not activate
        const recentSpeeds = [10, 10, 10, 10, 10].map(
          (s, i) => ({ speedMps: s, deviceTs: now.minus({ seconds: 120 + i * 15 }).toISO()! }),
        );

        const result = await computeEta({
          stops,
          now,
          vanPosition,
          recentSpeeds,
        });

        expect(result.etaSource).toBe("schedule");
      });
    });

    describe("hysteresis", () => {
      it("keeps GPS ETA when van stops briefly at traffic light (recent pings within 60s)", async () => {
        const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
        const vanPosition = makeVanPosition({ speedMps: 0 }); // currently stopped
        const stops = makeStops(); // default ~6.6km away (> 500m)

        // Recent pings: some within 60s had speed >= 1.0
        const recentSpeeds = [
          { speedMps: 0, deviceTs: now.minus({ seconds: 5 }).toISO()! },
          { speedMps: 0, deviceTs: now.minus({ seconds: 15 }).toISO()! },
          { speedMps: 8, deviceTs: now.minus({ seconds: 30 }).toISO()! },
          { speedMps: 10, deviceTs: now.minus({ seconds: 45 }).toISO()! },
          { speedMps: 10, deviceTs: now.minus({ seconds: 55 }).toISO()! },
        ];

        const result = await computeEta({
          stops,
          now,
          vanPosition,
          recentSpeeds,
        });

        expect(result.etaSource).toBe("gps");
      });

      it("falls back to schedule when all recent pings are older than 60s", async () => {
        const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
        const vanPosition = makeVanPosition({ speedMps: 0 });
        const stops = makeStops(); // > 500m away

        // All pings older than 60s
        const recentSpeeds = [
          { speedMps: 10, deviceTs: now.minus({ seconds: 70 }).toISO()! },
          { speedMps: 10, deviceTs: now.minus({ seconds: 80 }).toISO()! },
          { speedMps: 10, deviceTs: now.minus({ seconds: 90 }).toISO()! },
        ];

        const result = await computeEta({
          stops,
          now,
          vanPosition,
          recentSpeeds,
        });

        expect(result.etaSource).toBe("schedule");
      });

      it("uses FALLBACK_SPEED when hysteresis is active and van is stopped", async () => {
        const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
        const vanPosition = makeVanPosition({ speedMps: 0 });
        const stops = makeStops();

        const recentSpeeds = [
          { speedMps: 0, deviceTs: now.minus({ seconds: 5 }).toISO()! },
          { speedMps: 5, deviceTs: now.minus({ seconds: 30 }).toISO()! },
        ];

        const result = await computeEta({
          stops,
          now,
          vanPosition,
          recentSpeeds,
        });

        // Should use GPS with fallback speed, not schedule
        expect(result.etaSource).toBe("gps");
        expect(result.etaNextStopMinutes).toBeGreaterThan(0);
      });
    });

    describe("direction detection", () => {
      it("falls back to schedule when van heads away from stop (haversine path)", async () => {
        const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
        // Stop is roughly east of van; heading 270 = west (opposite)
        const vanPosition = makeVanPosition({ headingDeg: 270 });
        const stops = makeStops();

        // No OSRM so haversine path is used
        const result = await computeEta({ stops, now, vanPosition });

        expect(result.etaSource).toBe("schedule");
      });

      it("uses GPS when van heads toward stop (haversine path)", async () => {
        const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
        // Stop is roughly east of van; heading ~90 = east (toward)
        const vanPosition = makeVanPosition({ headingDeg: 90 });
        const stops = makeStops();

        const result = await computeEta({ stops, now, vanPosition });

        expect(result.etaSource).toBe("gps");
      });

      it("direction check is skipped when OSRM is available", async () => {
        const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
        // Heading away, but OSRM is available — should still use OSRM
        const vanPosition = makeVanPosition({ headingDeg: 270 });
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

        vi.unstubAllGlobals();
      });

      it("direction check is skipped when headingDeg is null", async () => {
        const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
        const vanPosition = makeVanPosition({ headingDeg: null });
        const stops = makeStops();

        const result = await computeEta({ stops, now, vanPosition });

        expect(result.etaSource).toBe("gps");
      });
    });
  });
});

describe("getTimeFactor", () => {
  it("returns historical factor only when recentRuns has 1 or 2 entries", () => {
    const oneRun = [{ actualMinutes: 5, predictedMinutes: 4 }];
    const twoRuns = [
      { actualMinutes: 5, predictedMinutes: 4 },
      { actualMinutes: 6, predictedMinutes: 5 },
    ];

    // Hour 8, weekday (day 1=Monday) — historical factor is 1.4
    const resultOne = getTimeFactor(8, 1, undefined, oneRun);
    const resultTwo = getTimeFactor(8, 1, undefined, twoRuns);
    const resultNone = getTimeFactor(8, 1, undefined, undefined);

    // With <3 runs, should return the same as no runs (historical only)
    expect(resultOne).toBe(resultNone);
    expect(resultTwo).toBe(resultNone);
  });

  it("blends 70/30 when recentRuns has 3+ entries", () => {
    const threeRuns = [
      { actualMinutes: 5, predictedMinutes: 5 },
      { actualMinutes: 5, predictedMinutes: 5 },
      { actualMinutes: 5, predictedMinutes: 5 },
    ];

    // All ratios = 1.0, so recent factor = 1.0
    // historical for hour 8 weekday = 1.4
    // blended = 0.7 * 1.4 + 0.3 * 1.0 = 1.28
    const result = getTimeFactor(8, 1, undefined, threeRuns);
    expect(result).toBeCloseTo(1.28);
  });

  it("returns 0.95 for Sunday operating hours", () => {
    // Sunday = weekday 7
    const result = getTimeFactor(8, 7, undefined, undefined);
    expect(result).toBe(0.95);
  });
});

describe("segment-aware ETA fallback", () => {
  // GPS conditions NOT met: no vanPosition provided (stale/no GPS)
  // Segment fallback triggers when last passed stop has passedAt AND osrmDistanceM (distance to successor)

  it("uses segment calculation when GPS unavailable and last passed stop has osrmDistanceM", async () => {
    // Use a known weekday (Monday) so timeFactor is deterministic
    const now = DateTime.fromObject({ year: 2026, month: 3, day: 2, hour: 8, minute: 42 }, { zone: TZ });
    const timeFactor = getTimeFactor(8, 1, undefined, undefined); // 1.4 on weekday hour 8

    const passedAt = DateTime.fromObject(
      { year: 2026, month: 3, day: 2, hour: 8, minute: 35 },
      { zone: TZ },
    ).toISO()!;

    const osrmDistanceM = 5000; // 5 km from stop A to stop B
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt,
        osrmDistanceM, // distance from A to its successor (B)
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
    ];

    const result = await computeEta({ stops, now });

    expect(result.etaSource).toBe("segment");
    expect(result.nextStopId).toBe("b");
    expect(result.etaNextStopMinutes).toBeGreaterThan(0);
    expect(result.etaNextStopISO).not.toBeNull();

    // Verify the math: travelMinutes = (5000 / 8.3 / 60) * 1.4
    const expectedTravelMin = (osrmDistanceM / REFERENCE_SPEED_MPS / 60) * timeFactor;
    const expectedEta = DateTime.fromISO(passedAt).plus({ minutes: expectedTravelMin });
    const expectedMinutes = Math.max(0, Math.ceil(expectedEta.diff(now, "minutes").minutes));
    expect(result.etaNextStopMinutes).toBe(expectedMinutes);
  });

  it("falls through to schedule fallback when osrmDistanceM is null", async () => {
    const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
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
        osrmDistanceM: null,
      },
    ];

    const result = await computeEta({ stops, now });

    expect(result.etaSource).toBe("schedule");
  });

  it("falls through to schedule when osrmDistanceM is undefined (not set)", async () => {
    const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
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
        // osrmDistanceM not set at all
      },
    ];

    const result = await computeEta({ stops, now });

    expect(result.etaSource).toBe("schedule");
  });

  it("GPS ETA takes priority over segment fallback", async () => {
    const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
    const vanPosition: VanPosition = {
      lat: -12.9714,
      lng: -38.5124,
      speedMps: 10,
      lastGpsFixAt: DateTime.fromObject({ hour: 8, minute: 40 }, { zone: TZ }),
    };

    const stops = [
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
        osrmDistanceM: 5000,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
        stopLat: -12.9814,
        stopLng: -38.4524,
      },
    ];

    const result = await computeEta({ stops, now, vanPosition });

    // GPS branch should be used, not segment
    expect(result.etaSource).toBe("gps");
  });

  it("applies time factor to segment estimate", async () => {
    // Sunday hour 8 has timeFactor = 0.95
    const now = DateTime.fromObject({ year: 2026, month: 3, day: 1, hour: 8, minute: 42 }, { zone: TZ }); // Sunday
    const timeFactor = getTimeFactor(8, 7, undefined, undefined); // 0.95
    expect(timeFactor).toBe(0.95);

    const passedAt = DateTime.fromObject(
      { year: 2026, month: 3, day: 1, hour: 8, minute: 35 },
      { zone: TZ },
    ).toISO()!;

    const osrmDistanceM = 5000;
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt,
        osrmDistanceM,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
    ];

    const result = await computeEta({ stops, now });

    expect(result.etaSource).toBe("segment");

    // Verify time factor is applied: travelMinutes = (5000 / 8.3 / 60) * 0.95
    const expectedTravelMin = (osrmDistanceM / REFERENCE_SPEED_MPS / 60) * timeFactor;
    const expectedEta = DateTime.fromISO(passedAt).plus({ minutes: expectedTravelMin });
    const expectedMinutes = Math.max(0, Math.ceil(expectedEta.diff(now, "minutes").minutes));
    expect(result.etaNextStopMinutes).toBe(expectedMinutes);
  });

  it("computes delay from last passed stop schedule vs actual time", async () => {
    const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });

    // Van passed stop 'a' 5 minutes late (08:35 instead of 08:30)
    const passedAt = DateTime.fromObject(
      { hour: 8, minute: 35 },
      { zone: TZ },
    ).toISO()!;

    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt,
        osrmDistanceM: 3000,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
    ];

    const result = await computeEta({ stops, now });

    expect(result.etaSource).toBe("segment");
    expect(result.delayMinutes).toBe(5);
    expect(result.passedStopIds).toEqual(["a"]);
  });
});

describe("explicit targetStopId", () => {
  it("target is a valid pending stop → ETA computed for that stop", async () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
      {
        scheduleEntryId: "c",
        time: "09:00",
        status: "pending" as const,
        passedAt: null,
      },
    ];
    const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });

    const result = await computeEta({ stops, now, targetStopId: "b" });

    expect(result.nextStopId).toBe("b");
    expect(result.etaNextStopMinutes).toBeGreaterThan(0);
    expect(result.etaNextStopISO).not.toBeNull();
  });

  it("target is overdue but still pending → valid ETA returned", async () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
    ];
    // now is 09:00 — stop "b" at 08:45 is overdue; without targetStopId, route-order fallback picks it
    const now = DateTime.fromObject({ hour: 9, minute: 0 }, { zone: TZ });

    // Without target → route-order fallback picks first pending by schedule order
    const resultNoTarget = await computeEta({ stops, now });
    expect(resultNoTarget.nextStopId).toBe("b");

    // With target → overdue ETA for the overdue pending stop
    const result = await computeEta({ stops, now, targetStopId: "b" });
    expect(result.nextStopId).toBe("b");
    expect(result.etaStatus).toBe("overdue");
    expect(result.etaNextStopMinutes).toBeNull();
    expect(result.etaSource).toBe("schedule");
  });

  it("target differs from time-based selection → target wins", async () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "pending" as const,
        passedAt: null,
      },
      {
        scheduleEntryId: "b",
        time: "09:00",
        status: "pending" as const,
        passedAt: null,
      },
    ];
    // now is 08:25 — both are future; time-floor would pick "a" (earliest)
    const now = DateTime.fromObject({ hour: 8, minute: 25 }, { zone: TZ });

    const resultNoTarget = await computeEta({ stops, now });
    expect(resultNoTarget.nextStopId).toBe("a");

    // With target pointing to "b", it should return "b"
    const result = await computeEta({ stops, now, targetStopId: "b" });
    expect(result.nextStopId).toBe("b");
  });

  it("target not found in pending stops → null ETA returned", async () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 32 }, { zone: TZ }).toISO()!,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
    ];
    const now = DateTime.fromObject({ hour: 8, minute: 40 }, { zone: TZ });

    const result = await computeEta({ stops, now, targetStopId: "nonexistent" });

    expect(result.nextStopId).toBeNull();
    expect(result.etaNextStopMinutes).toBeNull();
    expect(result.etaNextStopISO).toBeNull();
    expect(result.etaSource).toBeNull();
    expect(result.passedStopIds).toEqual(["a"]);
  });

  it("target is provided but all stops are passed → null ETA returned", async () => {
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

    const result = await computeEta({ stops, now, targetStopId: "b" });

    expect(result.nextStopId).toBeNull();
    expect(result.etaNextStopMinutes).toBeNull();
    expect(result.etaNextStopISO).toBeNull();
    expect(result.etaSource).toBeNull();
    expect(result.passedStopIds).toEqual(["a", "b"]);
  });

  it("no target provided → legacy time-floor selection used (backward compat)", async () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
      {
        scheduleEntryId: "c",
        time: "09:00",
        status: "pending" as const,
        passedAt: null,
      },
    ];
    const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });

    // No targetStopId → time-floor picks "b" (first pending >= now)
    const result = await computeEta({ stops, now });

    expect(result.nextStopId).toBe("b");
    expect(result.etaSource).toBe("schedule");
    expect(result.delayMinutes).toBe(5);
  });

  it("stale GPS + explicit target → segment/schedule fallback still targets the explicit stop", async () => {
    const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
    const vanPosition: VanPosition = {
      lat: -12.9714,
      lng: -38.5124,
      speedMps: 10,
      // 20 minutes ago → stale, GPS branch skipped
      lastGpsFixAt: DateTime.fromObject({ hour: 8, minute: 22 }, { zone: TZ }),
    };

    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
        osrmDistanceM: 5000,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
        stopLat: -12.9814,
        stopLng: -38.4524,
      },
      {
        scheduleEntryId: "c",
        time: "09:00",
        status: "pending" as const,
        passedAt: null,
        stopLat: -12.9900,
        stopLng: -38.4400,
      },
    ];

    // Target "c" even though "b" is the next by time
    const result = await computeEta({ stops, now, vanPosition, targetStopId: "c" });

    expect(result.nextStopId).toBe("c");
    expect(result.etaNextStopMinutes).not.toBeNull();
    // GPS is stale, so should fall back to segment or schedule
    expect(["segment", "schedule"]).toContain(result.etaSource);
  });

  it("target stop with stop_group_id-like field → ETA computed normally", async () => {
    // stop_group_id is irrelevant at the ETA level — grouping has no effect on resolution.
    // This test verifies that a targetStopId still works for any stop regardless of grouping.
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
      {
        scheduleEntryId: "c",
        time: "09:00",
        status: "pending" as const,
        passedAt: null,
      },
    ];
    const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });

    const result = await computeEta({ stops, now, targetStopId: "c" });

    expect(result.nextStopId).toBe("c");
    expect(result.etaNextStopMinutes).toBeGreaterThan(0);
    expect(result.etaNextStopISO).not.toBeNull();
    expect(result.etaSource).toBe("schedule");
  });
});

describe("multi-segment distance accumulation", () => {
  it("T002: 2-stop gap uses cumulative segment distance", async () => {
    // stops: A (passed) → B (pending) → C (pending, target)
    // osrmDistanceM: A→B = 5000m, B→C = 5000m
    // Expected: total = 10000m, ETA based on cumulative distance
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
        osrmDistanceM: 5000,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
        osrmDistanceM: 5000,
      },
      {
        scheduleEntryId: "c",
        time: "09:00",
        status: "pending" as const,
        passedAt: null,
        osrmDistanceM: null,
      },
    ];
    const now = DateTime.fromObject({ hour: 8, minute: 36 }, { zone: TZ });

    // Target stop C (2-stop gap from A)
    const result = await computeEta({ stops, now, targetStopId: "c" });

    expect(result.nextStopId).toBe("c");
    expect(result.etaSource).toBe("segment");
    // Accumulated distance: A.osrmDistanceM (5000) + B.osrmDistanceM (5000) = 10000
    // travelMinutes = (10000 / REFERENCE_SPEED_MPS / 60) * timeFactor
    expect(result.etaNextStopMinutes).toBeGreaterThan(0);
  });

  it("T003: 3-stop gap uses cumulative segment distance", async () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
        osrmDistanceM: 1000,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
        osrmDistanceM: 1500,
      },
      {
        scheduleEntryId: "c",
        time: "09:00",
        status: "pending" as const,
        passedAt: null,
        osrmDistanceM: 800,
      },
      {
        scheduleEntryId: "d",
        time: "09:15",
        status: "pending" as const,
        passedAt: null,
        osrmDistanceM: null,
      },
    ];
    const now = DateTime.fromObject({ hour: 8, minute: 40 }, { zone: TZ });

    // Target stop D (3-stop gap from A)
    const result = await computeEta({ stops, now, targetStopId: "d" });

    expect(result.nextStopId).toBe("d");
    expect(result.etaSource).toBe("segment");
    // Accumulated: 1000 + 1500 + 800 = 3300m
    expect(result.etaNextStopMinutes).toBeGreaterThan(0);
  });

  it("T004: null osrmDistanceM in middle segment falls back to schedule ETA", async () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
        osrmDistanceM: 1000,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
        osrmDistanceM: null, // missing!
      },
      {
        scheduleEntryId: "c",
        time: "09:00",
        status: "pending" as const,
        passedAt: null,
        osrmDistanceM: 800,
      },
    ];
    const now = DateTime.fromObject({ hour: 8, minute: 40 }, { zone: TZ });

    const result = await computeEta({ stops, now, targetStopId: "c" });

    expect(result.nextStopId).toBe("c");
    // Should fall back to schedule because B has null osrmDistanceM
    expect(result.etaSource).toBe("schedule");
  });

  it("T005: single-stop gap (immediate successor) preserves existing behavior", async () => {
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
        osrmDistanceM: 5000,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
        osrmDistanceM: null,
      },
    ];
    const now = DateTime.fromObject({ hour: 8, minute: 36 }, { zone: TZ });

    // Target is immediate successor — only 1 segment needed (A.osrmDistanceM)
    const result = await computeEta({ stops, now, targetStopId: "b" });

    expect(result.nextStopId).toBe("b");
    expect(result.etaSource).toBe("segment");
    expect(result.etaNextStopMinutes).toBeGreaterThan(0);
  });
});

describe("route-order fallback (T016)", () => {
  it("time-floor yields no stops (all overdue), falls back to first pending by route order", async () => {
    // All pending stops are before the time floor (now = 10:00, stops at 08:45 and 09:00)
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
      {
        scheduleEntryId: "c",
        time: "09:00",
        status: "pending" as const,
        passedAt: null,
      },
    ];
    // now is 10:00 — both pending stops are before time floor
    const now = DateTime.fromObject({ hour: 10, minute: 0 }, { zone: TZ });

    const result = await computeEta({ stops, now });

    // Previously would return null; now falls back to first pending by route order
    expect(result.nextStopId).toBe("b");
    expect(result.etaSource).toBe("schedule");
    expect(result.passedStopIds).toEqual(["a"]);
  });
});

describe("etaStatus field", () => {
  // T018: overdue segment ETA
  it("returns etaStatus 'overdue' and null minutes for overdue segment ETA", async () => {
    // Setup: last stop passed long ago, segment predicts arrival in the past
    // Use stops with osrmDistanceM so segment branch is used
    const now = DateTime.fromObject({ hour: 14, minute: 0 }, { zone: TZ });
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:00",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 5 }, { zone: TZ }).toISO()!,
        stopLat: -12.96,
        stopLng: -38.52,
        osrmDistanceM: 5000,
      },
      {
        scheduleEntryId: "b",
        time: "08:30",
        status: "pending" as const,
        passedAt: null,
        stopLat: -12.97,
        stopLng: -38.51,
        osrmDistanceM: null,
      },
    ];

    const result = await computeEta({ stops, now });

    expect(result.etaStatus).toBe("overdue");
    expect(result.etaNextStopMinutes).toBeNull();
    expect(result.etaSource).toBe("segment");
    expect(result.nextStopId).toBe("b");
  });

  // T019: overdue schedule ETA
  it("returns etaStatus 'overdue' and null minutes for overdue schedule ETA", async () => {
    // Stop was due at 08:45, last passed at 08:35 (5 min delay), so predicted = 08:50
    // Now is 09:00, so predicted <= now => overdue
    const now = DateTime.fromObject({ hour: 9, minute: 0 }, { zone: TZ });
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
    ];

    const result = await computeEta({ stops, now });

    expect(result.etaStatus).toBe("overdue");
    expect(result.etaNextStopMinutes).toBeNull();
    expect(result.etaSource).toBe("schedule");
    expect(result.nextStopId).toBe("b");
  });

  // T020: GPS branch at stop returns 0 and "estimated"
  it("returns etaStatus 'estimated' and 0 minutes for GPS branch at stop", async () => {
    const STOP_LAT = -12.9814;
    const STOP_LNG = -38.4524;
    const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
    const vanPosition: VanPosition = {
      lat: STOP_LAT,
      lng: STOP_LNG,
      speedMps: 10,
      lastGpsFixAt: DateTime.fromObject({ hour: 8, minute: 40 }, { zone: TZ }),
    };
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
        stopLat: -12.96,
        stopLng: -38.52,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
        stopLat: STOP_LAT,
        stopLng: STOP_LNG,
      },
    ];

    const result = await computeEta({ stops, now, vanPosition });

    expect(result.etaStatus).toBe("estimated");
    expect(result.etaNextStopMinutes).toBe(0);
    expect(result.etaSource).toBe("gps");
  });

  // T021: valid future ETA returns "estimated"
  it("returns etaStatus 'estimated' for valid future schedule ETA", async () => {
    const now = DateTime.fromObject({ hour: 8, minute: 42 }, { zone: TZ });
    const stops = [
      {
        scheduleEntryId: "a",
        time: "08:30",
        status: "passed" as const,
        passedAt: DateTime.fromObject({ hour: 8, minute: 35 }, { zone: TZ }).toISO()!,
      },
      {
        scheduleEntryId: "b",
        time: "08:45",
        status: "pending" as const,
        passedAt: null,
      },
    ];

    const result = await computeEta({ stops, now });

    expect(result.etaStatus).toBe("estimated");
    expect(result.etaNextStopMinutes).toBeGreaterThan(0);
    expect(result.etaSource).toBe("schedule");
  });

  // T022: UI contract — overdue returns etaStatus "overdue" with null etaNextStopMinutes
  it("overdue ETA returns etaStatus 'overdue' with null etaNextStopMinutes (UI contract)", async () => {
    // stops: a passed 5 min late, b pending and already past scheduled time
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
    // now is 08:55 — predicted ETA was 08:50 (08:45 + 5min delay), which is in the past
    const now = DateTime.fromObject({ hour: 8, minute: 55 }, { zone: TZ });

    const result = await computeEta({ stops, now });

    expect(result.etaStatus).toBe("overdue");
    expect(result.etaNextStopMinutes).toBeNull();
    expect(result.nextStopId).toBe("b");
  });

  // T021b: no next stop returns "none"
  it("returns etaStatus 'none' when all stops are passed", async () => {
    const now = DateTime.fromObject({ hour: 9, minute: 0 }, { zone: TZ });
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

    const result = await computeEta({ stops, now });

    expect(result.etaStatus).toBe("none");
  });
});
