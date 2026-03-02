/// <reference types="vitest/globals" />
import { deriveTimelineStops } from "@/components/public/schedule-timeline";

const schedule = [
  { id: "caab-0000", stopName: "CAAB", time: "00:00" },
  { id: "stop-0800", stopName: "Stop A", time: "08:00" },
  { id: "stop-1600", stopName: "Stop B", time: "16:00" },
  { id: "stop-2200", stopName: "Stop C", time: "22:00" },
  { id: "stop-2240", stopName: "Stop D", time: "22:40" },
];

describe("deriveTimelineStops", () => {
  it("classifies un-geofenced past-time stops as past (hybrid)", () => {
    const passedStopIds = ["stop-2200"];
    const inferredNextStopId = "stop-2240";
    const serverTime = "22:35";

    const result = deriveTimelineStops(
      schedule,
      null,
      true,
      passedStopIds,
      inferredNextStopId,
      serverTime,
    );

    // CAAB @ 00:00 and Stop A @ 08:00 and Stop B @ 16:00 are before serverTime -> past
    expect(result[0].status).toBe("past"); // 00:00 < 22:35
    expect(result[1].status).toBe("past"); // 08:00 < 22:35
    expect(result[2].status).toBe("past"); // 16:00 < 22:35
    // Stop C @ 22:00 is in passedStopIds -> past
    expect(result[3].status).toBe("past");
    // Stop D @ 22:40 is inferredNextStopId -> current
    expect(result[4].status).toBe("current");
  });

  it("classifies GPS-confirmed passed stops as past", () => {
    const passedStopIds = ["stop-2200", "stop-1600"];
    const inferredNextStopId = "stop-2240";
    const serverTime = "22:35";

    const result = deriveTimelineStops(
      schedule,
      null,
      true,
      passedStopIds,
      inferredNextStopId,
      serverTime,
    );

    expect(result[2].status).toBe("past"); // GPS confirmed
    expect(result[3].status).toBe("past"); // GPS confirmed
  });

  it("marks the correct stop as current when time >= serverTime", () => {
    const passedStopIds = ["stop-2200"];
    const inferredNextStopId = "stop-2240";
    const serverTime = "22:35";

    const result = deriveTimelineStops(
      schedule,
      null,
      true,
      passedStopIds,
      inferredNextStopId,
      serverTime,
    );

    const currentStops = result.filter((s) => s.status === "current");
    expect(currentStops).toHaveLength(1);
    expect(currentStops[0].id).toBe("stop-2240");
    expect(currentStops[0].time).toBe("22:40");
  });

  it("falls back to index-based classification when no GPS data", () => {
    const result = deriveTimelineStops(
      schedule,
      "stop-1600",
      true,
      undefined,
      undefined,
      undefined,
    );

    expect(result[0].status).toBe("past"); // before nextStopId index
    expect(result[1].status).toBe("past"); // before nextStopId index
    expect(result[2].status).toBe("current"); // nextStopId
    expect(result[3].status).toBe("future");
    expect(result[4].status).toBe("future");
  });

  it("returns all neutral when not running", () => {
    const result = deriveTimelineStops(
      schedule,
      null,
      false,
      ["stop-2200"],
      "stop-2240",
      "22:35",
    );

    for (const stop of result) {
      expect(stop.status).toBe("neutral");
    }
  });
});
