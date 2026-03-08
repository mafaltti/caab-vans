/// <reference types="vitest/globals" />
import { DateTime } from "luxon";
import {
  deriveTrackingStatus,
  TRACKING_LIVE_THRESHOLD_MINUTES,
  TRACKING_STALE_THRESHOLD_MINUTES,
} from "@/lib/tracking/tracking-status";

const TIMEZONE = "America/Bahia";

function makeNow(): DateTime {
  return DateTime.fromISO("2026-03-07T10:00:00", { zone: TIMEZONE });
}

function fixAtMinutesAgo(minutes: number): string {
  return makeNow().minus({ minutes }).toISO()!;
}

describe("deriveTrackingStatus", () => {
  it("returns 'live' when age < 10 min", () => {
    const result = deriveTrackingStatus(fixAtMinutesAgo(5), makeNow());
    expect(result).toBe("live");
  });

  it("returns 'live' when age is 0 min", () => {
    const result = deriveTrackingStatus(fixAtMinutesAgo(0), makeNow());
    expect(result).toBe("live");
  });

  it("returns 'stale' when age is between 10 and 60 min", () => {
    const result = deriveTrackingStatus(fixAtMinutesAgo(30), makeNow());
    expect(result).toBe("stale");
  });

  it("returns 'missing' when age >= 60 min", () => {
    const result = deriveTrackingStatus(fixAtMinutesAgo(90), makeNow());
    expect(result).toBe("missing");
  });

  it("returns 'missing' when lastGpsFixAt is null", () => {
    const result = deriveTrackingStatus(null, makeNow());
    expect(result).toBe("missing");
  });

  it("boundary: exactly 10 min returns 'stale'", () => {
    const result = deriveTrackingStatus(
      fixAtMinutesAgo(TRACKING_LIVE_THRESHOLD_MINUTES),
      makeNow(),
    );
    expect(result).toBe("stale");
  });

  it("boundary: exactly 60 min returns 'missing'", () => {
    const result = deriveTrackingStatus(
      fixAtMinutesAgo(TRACKING_STALE_THRESHOLD_MINUTES),
      makeNow(),
    );
    expect(result).toBe("missing");
  });

  it("future timestamp (negative age) returns 'missing'", () => {
    const futureFix = makeNow().plus({ minutes: 5 }).toISO()!;
    const result = deriveTrackingStatus(futureFix, makeNow());
    expect(result).toBe("missing");
  });

  it("returns 'stale' just before 60 min boundary", () => {
    const result = deriveTrackingStatus(fixAtMinutesAgo(59), makeNow());
    expect(result).toBe("stale");
  });

  it("returns 'live' just before 10 min boundary", () => {
    const result = deriveTrackingStatus(fixAtMinutesAgo(9), makeNow());
    expect(result).toBe("live");
  });
});
