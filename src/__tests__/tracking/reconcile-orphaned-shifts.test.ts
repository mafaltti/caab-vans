/// <reference types="vitest/globals" />
import { DateTime } from "luxon";

import { findOrphanedShifts, closeOrphanedShifts } from "../../../scripts/reconcile-orphaned-shifts";

const TZ = "America/Bahia";

function makeNow(hour: number, minute: number): DateTime {
  return DateTime.fromObject(
    { year: 2026, month: 3, day: 8, hour, minute },
    { zone: TZ },
  );
}

function createMockSupabase(openShifts: unknown[], closeError: unknown = null) {
  const closedIds: string[] = [];

  const mock = {
    from: vi.fn((table: string) => {
      if (table === "route_shifts") {
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              data: openShifts,
              error: null,
            }),
          }),
          update: vi.fn(() => ({
            in: vi.fn((_field: string, ids: string[]) => {
              if (closeError == null) {
                closedIds.push(...ids);
              }
              return { error: closeError };
            }),
          })),
        };
      }
      return { select: vi.fn() };
    }),
    _closedIds: closedIds,
  };

  return mock;
}

function makeOpenShift(opts: {
  shiftId?: string;
  startedAt: string;
  serviceDate: string;
  maxScheduleTime: string;
  progressUpdatedAt?: string | null;
  lastGpsFixAt?: string | null;
}) {
  return {
    id: opts.shiftId ?? "shift-1",
    started_at: opts.startedAt,
    route_runs: {
      id: "run-1",
      route_id: "route-1",
      service_date: opts.serviceDate,
      progress_updated_at: opts.progressUpdatedAt ?? null,
      routes: {
        id: "route-1",
        van_id: "van-1",
        schedule_entries: [{ stop_sequence: 1, arrival_time: opts.maxScheduleTime }],
        vans: { last_gps_fix_at: opts.lastGpsFixAt ?? null },
      },
    },
  };
}

describe("reconcile-orphaned-shifts", () => {
  // T036: orphaned shift closes when past end + inactivity thresholds met
  it("finds orphaned shift when past schedule + inactivity thresholds", async () => {
    const now = makeNow(20, 0); // 20:00
    const shift = makeOpenShift({
      startedAt: "2026-03-08T06:00:00-03:00",
      serviceDate: "2026-03-08",
      maxScheduleTime: "18:00", // scheduled end = 18:00, +90 min = 19:30, now 20:00 > 19:30
      lastGpsFixAt: "2026-03-08T19:00:00-03:00", // +30 min = 19:30, now 20:00 > 19:30
    });

    const mock = createMockSupabase([shift]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await findOrphanedShifts(mock as any, now);

    expect(result).toHaveLength(1);
    expect(result[0].shiftId).toBe("shift-1");
  });

  // T037: active route with fresh GPS is NOT auto-closed
  it("does not close shift with recent GPS activity", async () => {
    const now = makeNow(20, 0);
    const shift = makeOpenShift({
      startedAt: "2026-03-08T06:00:00-03:00",
      serviceDate: "2026-03-08",
      maxScheduleTime: "18:00", // past schedule
      lastGpsFixAt: "2026-03-08T19:45:00-03:00", // 15 min ago, within 30 min threshold
    });

    const mock = createMockSupabase([shift]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await findOrphanedShifts(mock as any, now);

    expect(result).toHaveLength(0);
  });

  // T038: route still within schedule window is NOT closed
  it("does not close shift still within schedule window", async () => {
    const now = makeNow(19, 0); // 19:00
    const shift = makeOpenShift({
      startedAt: "2026-03-08T06:00:00-03:00",
      serviceDate: "2026-03-08",
      maxScheduleTime: "18:00", // scheduled end = 18:00, +90 min = 19:30, now 19:00 < 19:30
      lastGpsFixAt: "2026-03-08T17:00:00-03:00", // inactive
    });

    const mock = createMockSupabase([shift]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await findOrphanedShifts(mock as any, now);

    expect(result).toHaveLength(0);
  });

  // T039: DRY_RUN=1 reports candidates without mutating
  it("closeOrphanedShifts updates shifts in database", async () => {
    const shifts = [{
      shiftId: "shift-1",
      runId: "run-1",
      routeId: "route-1",
      serviceDate: "2026-03-08",
      scheduledEnd: "2026-03-08T18:00:00-03:00",
      lastActivity: "2026-03-08T18:30:00-03:00",
    }];

    const mock = createMockSupabase([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await closeOrphanedShifts(mock as any, shifts);

    expect(count).toBe(1);
    expect(mock._closedIds).toContain("shift-1");
  });

  it("closeOrphanedShifts returns 0 for empty array", async () => {
    const mock = createMockSupabase([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await closeOrphanedShifts(mock as any, []);
    expect(count).toBe(0);
  });
});
