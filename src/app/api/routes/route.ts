import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  nowBahia,
  formatTime,
  isWithinScheduleWindow,
  getNextStop,
  isSameDay,
} from "@/lib/time";
import { DateTime } from "luxon";
import type { ScheduleStatus } from "@/types";

export async function GET() {
  const supabase = createServiceClient();
  const now = nowBahia();
  const currentTime = formatTime(now);

  const { data: routes, error } = await supabase
    .from("routes")
    .select(
      `
      id,
      name,
      van:vans!inner (
        id,
        location_url,
        location_updated_at
      ),
      schedule_entries (
        id,
        stop_name,
        time
      )
    `,
    )
    .order("name");

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch routes" } },
      { status: 500 },
    );
  }

  const result = (routes ?? []).map((route) => {
    const van = route.van as unknown as {
      id: string;
      location_url: string | null;
      location_updated_at: string | null;
    };
    const entries = (route.schedule_entries ?? []) as {
      id: string;
      stop_name: string;
      time: string;
    }[];

    const times = entries.map((e) => e.time);
    const entryMapped = entries.map((e) => ({
      stopName: e.stop_name,
      time: e.time,
    }));

    const isLocationUpdatedToday = van.location_updated_at
      ? isSameDay(DateTime.fromISO(van.location_updated_at))
      : false;

    const withinWindow = isWithinScheduleWindow(times, now);
    const isRunning = withinWindow && isLocationUpdatedToday;

    const nextStop = getNextStop(entryMapped, now);

    let scheduleStatus: ScheduleStatus = "not_started";
    if (times.length > 0) {
      const sorted = [...times].sort();
      const lastTime = sorted[sorted.length - 1];
      if (now.toFormat("HH:mm") > lastTime) {
        scheduleStatus = "ended";
      } else if (withinWindow) {
        scheduleStatus = "active";
      }
    }

    return {
      id: route.id,
      name: route.name,
      isRunning,
      nextStop: nextStop
        ? { stopName: nextStop.stopName, time: nextStop.time }
        : null,
      scheduleStatus,
      van: {
        id: van.id,
        locationUrl: van.location_url,
        locationUpdatedAt: van.location_updated_at,
        isLocationOutdated: !isLocationUpdatedToday,
      },
    };
  });

  return NextResponse.json({ routes: result, serverTime: currentTime });
}
