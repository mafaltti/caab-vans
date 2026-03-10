/// <reference types="vitest/globals" />
import {
  enforceCanonicalPrefix,
  type SortedStop,
} from "@/lib/tracking/enforce-canonical-prefix";

function makeStops(
  statuses: Array<"passed" | "pending">,
): SortedStop[] {
  return statuses.map((status, i) => ({
    schedule_entry_id: `stop-${i + 1}`,
    status,
  }));
}

describe("enforceCanonicalPrefix", () => {
  it("extracts contiguous passed prefix", () => {
    const stops = makeStops(["passed", "passed", "pending", "pending"]);
    const result = enforceCanonicalPrefix(stops);

    expect(result.contiguousPassedIds).toEqual(
      new Set(["stop-1", "stop-2"]),
    );
    expect(result.healIds).toEqual([]);
    expect(result.lastPassedStopId).toBe("stop-2");
    expect(result.nextStopId).toBe("stop-3");
  });

  it("identifies non-contiguous passed rows as heal IDs", () => {
    // passed, pending, passed, pending — gap at stop-2
    const stops = makeStops(["passed", "pending", "passed", "pending"]);
    const result = enforceCanonicalPrefix(stops);

    expect(result.contiguousPassedIds).toEqual(new Set(["stop-1"]));
    expect(result.healIds).toEqual(["stop-3"]);
    expect(result.lastPassedStopId).toBe("stop-1");
    expect(result.nextStopId).toBe("stop-2");
  });

  it("handles empty input", () => {
    const result = enforceCanonicalPrefix([]);

    expect(result.contiguousPassedIds).toEqual(new Set());
    expect(result.healIds).toEqual([]);
    expect(result.lastPassedStopId).toBeNull();
    expect(result.nextStopId).toBeNull();
  });

  it("handles all-passed stops", () => {
    const stops = makeStops(["passed", "passed", "passed"]);
    const result = enforceCanonicalPrefix(stops);

    expect(result.contiguousPassedIds).toEqual(
      new Set(["stop-1", "stop-2", "stop-3"]),
    );
    expect(result.healIds).toEqual([]);
    expect(result.lastPassedStopId).toBe("stop-3");
    expect(result.nextStopId).toBeNull();
  });

  it("handles all-pending stops", () => {
    const stops = makeStops(["pending", "pending", "pending"]);
    const result = enforceCanonicalPrefix(stops);

    expect(result.contiguousPassedIds).toEqual(new Set());
    expect(result.healIds).toEqual([]);
    expect(result.lastPassedStopId).toBeNull();
    expect(result.nextStopId).toBe("stop-1");
  });

  it("handles multiple non-contiguous passed rows", () => {
    // passed, pending, passed, passed, pending
    const stops: SortedStop[] = [
      { schedule_entry_id: "stop-1", status: "passed" },
      { schedule_entry_id: "stop-2", status: "pending" },
      { schedule_entry_id: "stop-3", status: "passed" },
      { schedule_entry_id: "stop-4", status: "passed" },
      { schedule_entry_id: "stop-5", status: "pending" },
    ];
    const result = enforceCanonicalPrefix(stops);

    expect(result.contiguousPassedIds).toEqual(new Set(["stop-1"]));
    expect(result.healIds).toEqual(["stop-3", "stop-4"]);
    expect(result.lastPassedStopId).toBe("stop-1");
    expect(result.nextStopId).toBe("stop-2");
  });

  it("derives pointers correctly with single passed stop", () => {
    const stops = makeStops(["passed", "pending"]);
    const result = enforceCanonicalPrefix(stops);

    expect(result.lastPassedStopId).toBe("stop-1");
    expect(result.nextStopId).toBe("stop-2");
  });
});
