/// <reference types="vitest/globals" />
import { resolveNextStop } from "@/lib/tracking/eta";

const entries = [
  { id: "s1", stop_name: "Terminal A", time: "08:00:00" },
  { id: "s2", stop_name: "Centro", time: "08:15:00" },
  { id: "s3", stop_name: "Rodoviária", time: "08:30:00" },
];

const fmt = (t: string) => t.slice(0, 5);

describe("resolveNextStop", () => {
  it("resolves the tracked entry by ID and returns correct index", () => {
    const result = resolveNextStop(entries, "s2", fmt);

    expect(result).not.toBeNull();
    expect(result!.nextStop).toEqual({ stopName: "Centro", time: "08:15" });
    expect(result!.currentStopIndex).toBe(1);
    expect(result!.nextStopEntry).toBe(entries[1]);
  });

  it("resolves the first entry when it is the tracked stop", () => {
    const result = resolveNextStop(entries, "s1", fmt);

    expect(result).not.toBeNull();
    expect(result!.nextStop.stopName).toBe("Terminal A");
    expect(result!.currentStopIndex).toBe(0);
  });

  it("resolves the last entry when it is the tracked stop", () => {
    const result = resolveNextStop(entries, "s3", fmt);

    expect(result).not.toBeNull();
    expect(result!.nextStop.stopName).toBe("Rodoviária");
    expect(result!.currentStopIndex).toBe(2);
  });

  it("returns null when nextStopId does not match any entry", () => {
    const result = resolveNextStop(entries, "nonexistent", fmt);

    expect(result).toBeNull();
  });

  it("returns null for empty entries array", () => {
    const result = resolveNextStop([], "s1", fmt);

    expect(result).toBeNull();
  });

  it("applies the format function to the time value", () => {
    const customFmt = (t: string) => `T${t}`;
    const result = resolveNextStop(entries, "s2", customFmt);

    expect(result!.nextStop.time).toBe("T08:15:00");
  });
});
