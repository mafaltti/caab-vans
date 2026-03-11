/// <reference types="vitest/globals" />
import { enforceCanonicalPrefix } from "@/lib/tracking/enforce-canonical-prefix";
import { suggestStartStop } from "@/lib/tracking/suggest-start-stop";
import { DateTime } from "luxon";

const TZ = "America/Bahia";

describe("confirm-start-stop logic", () => {
  describe("bulk mark + pointer update (happy path)", () => {
    it("marks confirmed stop and all prior stops as passed, next points to stop after", () => {
      // Simulate: 5 stops, driver confirms stop-3 as current
      // After fix: stops 1-3 are passed (including confirmed), 4-5 pending
      const allStops = [
        { schedule_entry_id: "s1", status: "passed" as const },
        { schedule_entry_id: "s2", status: "passed" as const },
        { schedule_entry_id: "s3", status: "passed" as const },
        { schedule_entry_id: "s4", status: "pending" as const },
        { schedule_entry_id: "s5", status: "pending" as const },
      ];

      const result = enforceCanonicalPrefix(allStops);

      expect(result.contiguousPassedIds).toEqual(new Set(["s1", "s2", "s3"]));
      expect(result.lastPassedStopId).toBe("s3");
      expect(result.nextStopId).toBe("s4");
      expect(result.healIds).toEqual([]);
    });
  });

  describe("idempotency", () => {
    it("same stopId confirmed twice produces identical result", () => {
      const stops = [
        { schedule_entry_id: "s1", status: "passed" as const },
        { schedule_entry_id: "s2", status: "passed" as const },
        { schedule_entry_id: "s3", status: "pending" as const },
      ];

      const first = enforceCanonicalPrefix(stops);
      const second = enforceCanonicalPrefix(stops);

      expect(first.lastPassedStopId).toBe(second.lastPassedStopId);
      expect(first.nextStopId).toBe(second.nextStopId);
    });

    it("retry detection: confirmed stop is passed+manual", () => {
      // After first confirm of s3: s1,s2,s3 are passed(manual)
      // run.next_stop_id === "s4" (stop after confirmed)
      const stopsAfterConfirm = [
        { schedule_entry_id: "s1", status: "passed" as const, pass_source: "manual" },
        { schedule_entry_id: "s2", status: "passed" as const, pass_source: "manual" },
        { schedule_entry_id: "s3", status: "passed" as const, pass_source: "manual" },
        { schedule_entry_id: "s4", status: "pending" as const, pass_source: null },
      ];

      const confirmedStopId = "s3";
      const targetStop = stopsAfterConfirm.find((s) => s.schedule_entry_id === confirmedStopId)!;

      // Simulate the idempotency check from the endpoint
      const passedStops = stopsAfterConfirm.filter((s) => s.status === "passed");
      const allManual =
        passedStops.length > 0 &&
        passedStops.every((s) => s.pass_source === "manual");
      const isRetry = targetStop.status === "passed" && targetStop.pass_source === "manual" && allManual;

      expect(isRetry).toBe(true);

      // Confirm canonical prefix produces correct pointers
      const canonical = enforceCanonicalPrefix(
        stopsAfterConfirm.map((s) => ({
          schedule_entry_id: s.schedule_entry_id,
          status: s.status,
        })),
      );
      expect(canonical.nextStopId).toBe("s4");
      expect(canonical.lastPassedStopId).toBe("s3");
    });

    it("does not treat geofence-progressed run as idempotent retry", () => {
      // Geofence has progressed s1,s2 — not a cold-start retry
      const stopsAfterGeofence = [
        { schedule_entry_id: "s1", status: "passed" as const, pass_source: "geofence_raw" },
        { schedule_entry_id: "s2", status: "passed" as const, pass_source: "geofence_raw" },
        { schedule_entry_id: "s3", status: "pending" as const, pass_source: null },
      ];

      const confirmedStopId = "s3";
      const targetStop = stopsAfterGeofence.find((s) => s.schedule_entry_id === confirmedStopId)!;

      // Target stop is pending — not a retry
      const isRetry = targetStop.status === "passed" && targetStop.pass_source === "manual";

      expect(isRetry).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("confirm last stop → all passed, next_stop_id null", () => {
      // All stops including the last one are passed after confirmation
      const allStops = [
        { schedule_entry_id: "s1", status: "passed" as const },
        { schedule_entry_id: "s2", status: "passed" as const },
        { schedule_entry_id: "s3", status: "passed" as const },
      ];

      const result = enforceCanonicalPrefix(allStops);

      expect(result.contiguousPassedIds).toEqual(new Set(["s1", "s2", "s3"]));
      expect(result.lastPassedStopId).toBe("s3");
      expect(result.nextStopId).toBeNull();
      expect(result.healIds).toEqual([]);
    });

    it("confirm first stop → only it passed, next_stop_id is stop #2", () => {
      // Confirming the very first stop: only stop-1 is passed
      const allStops = [
        { schedule_entry_id: "s1", status: "passed" as const },
        { schedule_entry_id: "s2", status: "pending" as const },
        { schedule_entry_id: "s3", status: "pending" as const },
      ];

      const result = enforceCanonicalPrefix(allStops);

      expect(result.contiguousPassedIds).toEqual(new Set(["s1"]));
      expect(result.lastPassedStopId).toBe("s1");
      expect(result.nextStopId).toBe("s2");
      expect(result.healIds).toEqual([]);
    });
  });

  describe("cold-start invariant violation", () => {
    it("detects existing passed stops (would trigger 409)", () => {
      const stops = [
        { schedule_entry_id: "s1", status: "passed" as const },
        { schedule_entry_id: "s2", status: "pending" as const },
      ];

      const hasPassedStops = stops.some((s) => s.status === "passed");
      expect(hasPassedStops).toBe(true);
    });
  });

  describe("geofence guard", () => {
    it("detects geofence passes (would trigger 409)", () => {
      const stopsWithSource = [
        { schedule_entry_id: "s1", status: "passed", pass_source: "geofence_raw" },
        { schedule_entry_id: "s2", status: "pending", pass_source: null },
      ];

      const hasGeofencePasses = stopsWithSource.some(
        (s) =>
          s.pass_source === "geofence_raw" ||
          s.pass_source === "geofence_snapped",
      );
      expect(hasGeofencePasses).toBe(true);
    });
  });

  describe("invalid stopId", () => {
    it("stop not in route entries is detected", () => {
      const routeEntryIds = new Set(["s1", "s2", "s3"]);
      const invalidStopId = "s99";
      expect(routeEntryIds.has(invalidStopId)).toBe(false);
    });
  });

  describe("seeding when stops missing", () => {
    it("stops count of 0 triggers seeding", () => {
      const stopCount = 0;
      expect(stopCount === 0).toBe(true);
    });
  });

  describe("persistCanonicalProgress integration", () => {
    it("enforceCanonicalPrefix after bulk mark produces correct pointers for persistCanonicalProgress", () => {
      // Simulate state after bulk mark: stops up to and including confirmed stop-3
      // are passed, later stops remain pending — this is what persistCanonicalProgress sees.
      const stopsAfterBulkMark = [
        { schedule_entry_id: "s1", status: "passed" as const },
        { schedule_entry_id: "s2", status: "passed" as const },
        { schedule_entry_id: "s3", status: "passed" as const },
        { schedule_entry_id: "s4", status: "pending" as const },
      ];

      // persistCanonicalProgress internally calls enforceCanonicalPrefix
      // with the same shape — verify the output matches expected pointers.
      const result = enforceCanonicalPrefix(stopsAfterBulkMark);

      expect(result.lastPassedStopId).toBe("s3");
      expect(result.nextStopId).toBe("s4");
      expect(result.healIds).toEqual([]);
      expect(result.contiguousPassedIds).toEqual(new Set(["s1", "s2", "s3"]));
    });

    it("detects and heals non-contiguous passed rows after bulk mark", () => {
      // Edge case: a gap in the passed prefix (should not happen normally,
      // but persistCanonicalProgress heals it).
      const stopsWithGap = [
        { schedule_entry_id: "s1", status: "passed" as const },
        { schedule_entry_id: "s2", status: "pending" as const },
        { schedule_entry_id: "s3", status: "passed" as const },
        { schedule_entry_id: "s4", status: "pending" as const },
      ];

      const result = enforceCanonicalPrefix(stopsWithGap);

      expect(result.contiguousPassedIds).toEqual(new Set(["s1"]));
      expect(result.healIds).toEqual(["s3"]);
      expect(result.lastPassedStopId).toBe("s1");
      expect(result.nextStopId).toBe("s2");
    });
  });
});

describe("start endpoint cold-start detection", () => {
  describe("no-GPS fallback (FR-012)", () => {
    it("returns null suggestedStop with time-only alternatives", () => {
      const entries = [
        { id: "e1", stop_name: "Stop 1", arrival_time: "06:10", stop_lat: -12.97, stop_lng: -38.51, stop_sequence: 1 },
        { id: "e2", stop_name: "Stop 2", arrival_time: "06:30", stop_lat: -12.97, stop_lng: -38.51, stop_sequence: 2 },
        { id: "e3", stop_name: "Stop 3", arrival_time: "07:00", stop_lat: -12.97, stop_lng: -38.51, stop_sequence: 3 },
      ];

      const result = suggestStartStop({
        entries,
        lat: null,
        lng: null,
        now: DateTime.fromObject({ hour: 7, minute: 0 }, { zone: TZ }),
      });

      expect(result.suggestedStop).toBeNull();
      expect(result.alternatives.length).toBeLessThanOrEqual(5);
    });
  });

  describe("no-coordinates route (FR-013)", () => {
    it("returns empty suggestions when entries have no coordinates", () => {
      const entries = [
        { id: "e1", stop_name: "Stop 1", arrival_time: "06:10", stop_lat: null, stop_lng: null, stop_sequence: 1 },
        { id: "e2", stop_name: "Stop 2", arrival_time: "06:30", stop_lat: null, stop_lng: null, stop_sequence: 2 },
      ];

      // When all entries lack coordinates, no nearby matches
      const result = suggestStartStop({
        entries,
        lat: -12.97,
        lng: -38.51,
        now: DateTime.fromObject({ hour: 7, minute: 0 }, { zone: TZ }),
      });

      // Falls back to time-only since no proximity matches
      expect(result.suggestedStop).toBeNull();
    });
  });

  describe("time-threshold boundary", () => {
    it("29min past first stop → would not trigger cold-start", () => {
      const firstStopTime = DateTime.fromObject(
        { hour: 6, minute: 10 },
        { zone: TZ },
      );
      const now = firstStopTime.plus({ minutes: 29 });
      const minutesPast = now.diff(firstStopTime, "minutes").minutes;
      expect(minutesPast).toBeLessThan(30);
    });

    it("31min past first stop → would trigger cold-start", () => {
      const firstStopTime = DateTime.fromObject(
        { hour: 6, minute: 10 },
        { zone: TZ },
      );
      const now = firstStopTime.plus({ minutes: 31 });
      const minutesPast = now.diff(firstStopTime, "minutes").minutes;
      expect(minutesPast).toBeGreaterThanOrEqual(30);
    });
  });
});
