"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import type { TimelineStop, TimelineStopStatus } from "@/types";

type ScheduleTimelineProps = {
  schedule: Array<{ id: string; stopName: string; time: string }>;
  nextStopId: string | null;
};

function deriveTimelineStops(
  schedule: Array<{ id: string; stopName: string; time: string }>,
  nextStopId: string | null,
): TimelineStop[] {
  if (!nextStopId) {
    return schedule.map((entry) => ({
      ...entry,
      status: "past" as TimelineStopStatus,
    }));
  }

  const nextIndex = schedule.findIndex((e) => e.id === nextStopId);
  if (nextIndex === -1) {
    return schedule.map((entry) => ({
      ...entry,
      status: "future" as TimelineStopStatus,
    }));
  }

  return schedule.map((entry, i) => ({
    ...entry,
    status:
      i < nextIndex
        ? ("past" as TimelineStopStatus)
        : i === nextIndex
          ? ("current" as TimelineStopStatus)
          : ("future" as TimelineStopStatus),
  }));
}

function TimelineNode({ status }: { status: TimelineStopStatus }) {
  if (status === "past") {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-zinc-200">
        <CheckCircle2 className="size-4 text-zinc-400" />
      </div>
    );
  }
  if (status === "current") {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-blue-100">
        <div className="size-3 animate-pulse rounded-full bg-blue-600" />
      </div>
    );
  }
  return (
    <div className="flex size-6 items-center justify-center">
      <div className="size-3 rounded-full border-2 border-zinc-300" />
    </div>
  );
}

export function ScheduleTimeline({
  schedule,
  nextStopId,
}: ScheduleTimelineProps) {
  const [showPast, setShowPast] = useState(false);
  const stops = deriveTimelineStops(schedule, nextStopId);

  if (stops.length === 0) {
    return (
      <div className="rounded-3xl bg-white p-6">
        <p className="text-sm text-zinc-500">Nenhum horário disponível</p>
      </div>
    );
  }

  const pastStops = stops.filter((s) => s.status === "past");
  const visibleStops = showPast
    ? stops
    : stops.filter((s) => s.status !== "past");

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-medium text-zinc-500">Horários</h3>

      {!showPast && pastStops.length > 0 && (
        <button
          onClick={() => setShowPast(true)}
          className="mb-3 flex min-h-[44px] items-center gap-2 text-sm font-medium text-blue-600"
        >
          <ChevronDown className="size-4" />
          Ver {pastStops.length} parada{pastStops.length > 1 ? "s" : ""}{" "}
          anterior{pastStops.length > 1 ? "es" : ""}
        </button>
      )}

      <div className="relative">
        {/* Vertical connecting line */}
        {visibleStops.length > 1 && (
          <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-zinc-200" />
        )}

        <ul className="relative space-y-0">
          {visibleStops.map((stop) => (
            <li key={stop.id} className="flex items-start gap-3 py-2.5">
              <div className="relative z-10 shrink-0">
                <TimelineNode status={stop.status} />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm ${
                    stop.status === "current"
                      ? "font-semibold text-blue-700"
                      : stop.status === "past"
                        ? "text-zinc-400"
                        : "text-zinc-700"
                  }`}
                >
                  {stop.stopName}
                </p>
                {stop.status === "current" && (
                  <p className="text-xs text-blue-500">
                    Parada atual / Próxima
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 font-mono text-sm ${
                  stop.status === "current"
                    ? "font-semibold text-blue-700"
                    : stop.status === "past"
                      ? "text-zinc-400"
                      : "text-zinc-700"
                }`}
              >
                {stop.time}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
