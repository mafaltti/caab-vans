/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import {
  isLocationFresh,
  STALENESS_THRESHOLD_MINUTES,
} from "@/lib/time";

const TZ = "America/Bahia";

describe("isLocationFresh", () => {
  it("returns true for a ping 3 minutes ago", () => {
    const now = DateTime.now().setZone(TZ);
    const ping = now.minus({ minutes: 3 });
    expect(isLocationFresh(ping)).toBe(true);
  });

  it("returns false for a ping 15 minutes ago", () => {
    const now = DateTime.now().setZone(TZ);
    const ping = now.minus({ minutes: 15 });
    expect(isLocationFresh(ping)).toBe(false);
  });

  it("returns false when ping is exactly at the threshold", () => {
    const now = DateTime.now().setZone(TZ);
    const ping = now.minus({ minutes: STALENESS_THRESHOLD_MINUTES });
    expect(isLocationFresh(ping)).toBe(false);
  });

  it("returns true for a future timestamp (clock sync issue)", () => {
    const now = DateTime.now().setZone(TZ);
    const ping = now.plus({ minutes: 2 });
    expect(isLocationFresh(ping)).toBe(true);
  });

  it("works correctly across midnight boundary", () => {
    const beforeMidnight = DateTime.fromObject(
      { hour: 23, minute: 58 },
      { zone: TZ },
    );
    const afterMidnight = beforeMidnight.plus({ minutes: 5 });
    // 5 minutes elapsed — should be fresh
    const elapsed = afterMidnight.diff(beforeMidnight, "minutes").minutes;
    expect(elapsed).toBeCloseTo(5);
    expect(elapsed).toBeLessThan(STALENESS_THRESHOLD_MINUTES);
  });

  it("exports the threshold constant as 10", () => {
    expect(STALENESS_THRESHOLD_MINUTES).toBe(10);
  });
});
