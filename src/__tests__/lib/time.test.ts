/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import { getNextStop, isWithinScheduleWindow } from "@/lib/time";

const TZ = "America/Bahia";

// Mock nowBahia so parseTime (called internally) uses a deterministic date.
// The hour/minute don't matter — parseTime overwrites them via .set().
vi.mock("@/lib/time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/time")>();
  return {
    ...actual,
    nowBahia: () =>
      DateTime.fromObject(
        { year: 2026, month: 3, day: 13, hour: 12, minute: 0 },
        { zone: "America/Bahia" },
      ),
  };
});

function makeNow(hour: number, minute: number): DateTime {
  return DateTime.fromObject(
    { year: 2026, month: 3, day: 13, hour, minute },
    { zone: TZ },
  );
}

// ---------- getNextStop ----------

describe("getNextStop", () => {
  // Entries with distinct arrival (time) and departure (departureTime).
  // 15-minute dwell at each stop.
  const ENTRIES = [
    { stopName: "Stop A", time: "08:30", departureTime: "08:45", stopSequence: 1 },
    { stopName: "Stop B", time: "09:00", departureTime: "09:15", stopSequence: 2 },
    { stopName: "Stop C", time: "09:30", departureTime: "09:45", stopSequence: 3 },
  ];

  it("returns Stop C at 09:05 — Stop B arrival (09:00) is past", () => {
    // Key: old buggy code would use departureTime (09:15 >= 09:05) and return
    // Stop B. The fix uses time (arrival), so 09:00 < 09:05 → skip to Stop C.
    const result = getNextStop(ENTRIES, makeNow(9, 5));
    expect(result).toEqual(ENTRIES[2]);
  });

  it("returns Stop B at 08:55 — arrival 09:00 >= 08:55", () => {
    const result = getNextStop(ENTRIES, makeNow(8, 55));
    expect(result).toEqual(ENTRIES[1]);
  });

  it("returns Stop C at 09:30 — boundary inclusive (09:30 >= 09:30)", () => {
    const result = getNextStop(ENTRIES, makeNow(9, 30));
    expect(result).toEqual(ENTRIES[2]);
  });

  it("returns null at 09:45 — all arrival times are past", () => {
    const result = getNextStop(ENTRIES, makeNow(9, 45));
    expect(result).toBeNull();
  });

  it("returns Stop A at 08:00 — before any arrival", () => {
    const result = getNextStop(ENTRIES, makeNow(8, 0));
    expect(result).toEqual(ENTRIES[0]);
  });

  it("returns null for empty entries", () => {
    const result = getNextStop([], makeNow(9, 0));
    expect(result).toBeNull();
  });

  it("sorts by stopSequence, not input order", () => {
    const shuffled = [ENTRIES[2], ENTRIES[0], ENTRIES[1]];
    const result = getNextStop(shuffled, makeNow(8, 55));
    expect(result).toEqual(ENTRIES[1]);
  });
});

// ---------- isWithinScheduleWindow ----------

describe("isWithinScheduleWindow", () => {
  // Window is [first.departure_time, last.departure_time] = [08:30, 17:30]
  const ENTRIES = [
    { arrival_time: "08:30", departure_time: "08:30", stop_sequence: 1 },
    { arrival_time: "09:00", departure_time: "09:15", stop_sequence: 2 },
    { arrival_time: "17:00", departure_time: "17:30", stop_sequence: 3 },
  ];

  it("returns true at 17:10 — between last arrival and last departure", () => {
    expect(isWithinScheduleWindow(ENTRIES, makeNow(17, 10))).toBe(true);
  });

  it("returns false at 17:35 — past last departure", () => {
    expect(isWithinScheduleWindow(ENTRIES, makeNow(17, 35))).toBe(false);
  });

  it("returns false at 08:29 — before first departure", () => {
    expect(isWithinScheduleWindow(ENTRIES, makeNow(8, 29))).toBe(false);
  });

  it("returns true at 08:30 — boundary inclusive (first departure)", () => {
    expect(isWithinScheduleWindow(ENTRIES, makeNow(8, 30))).toBe(true);
  });

  it("returns true at 17:30 — boundary inclusive (last departure)", () => {
    expect(isWithinScheduleWindow(ENTRIES, makeNow(17, 30))).toBe(true);
  });

  it("returns false for empty entries", () => {
    expect(isWithinScheduleWindow([], makeNow(12, 0))).toBe(false);
  });

  describe("single-stop route", () => {
    // Window collapses to [08:00, 08:00] since first === last
    const SINGLE = [
      { arrival_time: "08:00", departure_time: "08:00", stop_sequence: 1 },
    ];

    it("returns true at exactly the departure time", () => {
      expect(isWithinScheduleWindow(SINGLE, makeNow(8, 0))).toBe(true);
    });

    it("returns false one minute after", () => {
      expect(isWithinScheduleWindow(SINGLE, makeNow(8, 1))).toBe(false);
    });
  });

  it("sorts by stop_sequence, not input order", () => {
    const shuffled = [ENTRIES[2], ENTRIES[0], ENTRIES[1]];
    expect(isWithinScheduleWindow(shuffled, makeNow(12, 0))).toBe(true);
  });
});
