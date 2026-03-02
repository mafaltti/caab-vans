/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import { computeEta } from "@/lib/tracking/eta";

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
});
