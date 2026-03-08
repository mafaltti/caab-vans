"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import type { RunStatus, TimelineStop, TimelineStopStatus } from "@/types";

type ScheduleTimelineProps = {
  schedule: Array<{ id: string; stopName: string; time: string }>;
  nextStopId: string | null;
  isRunning: boolean;
  passedStopIds?: string[];
  inferredNextStopId?: string | null;
  etaMinutes?: number | null;
  serverTime?: string;
  runStatus?: RunStatus;
  nextStopMode?: "live" | "last_known" | null;
  variant?: "card" | "inline";
};

export function deriveTimelineStops(
  schedule: Array<{ id: string; stopName: string; time: string }>,
  nextStopId: string | null,
  isRunning: boolean,
  passedStopIds?: string[],
  inferredNextStopId?: string | null,
  serverTime?: string,
  runStatus?: RunStatus,
): TimelineStop[] {
  if (runStatus === "waiting") {
    return schedule.map((entry) => ({
      ...entry,
      status: "neutral" as TimelineStopStatus,
    }));
  }

  if (runStatus === "completed") {
    return schedule.map((entry) => ({
      ...entry,
      status: "past" as TimelineStopStatus,
    }));
  }

  if (passedStopIds && passedStopIds.length > 0) {
    const passedSet = new Set(passedStopIds);
    const currentIdx = inferredNextStopId
      ? schedule.findIndex((e) => e.id === inferredNextStopId)
      : -1;

    return schedule.map((entry, i) => {
      if (entry.id === inferredNextStopId) return { ...entry, status: "current" as TimelineStopStatus };
      if (passedSet.has(entry.id)) return { ...entry, status: "past" as TimelineStopStatus };
      if (currentIdx >= 0) {
        return { ...entry, status: i < currentIdx ? ("past" as TimelineStopStatus) : ("future" as TimelineStopStatus) };
      }
      // Fallback: no inferredNextStopId — use time-based
      return {
        ...entry,
        status: serverTime && entry.time < serverTime
          ? ("past" as TimelineStopStatus)
          : ("future" as TimelineStopStatus),
      };
    });
  }

  if (!isRunning) {
    return schedule.map((entry) => ({
      ...entry,
      status: "neutral" as TimelineStopStatus,
    }));
  }

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

function TimelineNode({ status, reducedMotion, isLastKnown }: { status: TimelineStopStatus; reducedMotion: boolean; isLastKnown?: boolean }) {
  if (status === "past") {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-zinc-100 border-2 border-white">
        <CheckCircle2 className="size-4 text-zinc-400" />
      </div>
    );
  }
  if (status === "current") {
    if (isLastKnown) {
      return (
        <div className="flex size-6 items-center justify-center rounded-full bg-zinc-100 border-2 border-zinc-400 shadow-sm shadow-zinc-200">
          <div className="size-3 rounded-full bg-zinc-400" />
        </div>
      );
    }
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-blue-100 border-2 border-blue-600 shadow-sm shadow-blue-200">
        <div className={`size-3 rounded-full bg-blue-600${reducedMotion ? "" : " animate-pulse"}`} />
      </div>
    );
  }
  return (
    <div className="size-6 rounded-full bg-white border-2 border-zinc-200 group-hover:border-blue-300 transition-colors" />
  );
}

export function ScheduleTimeline({
  schedule,
  nextStopId,
  isRunning,
  passedStopIds,
  inferredNextStopId,
  etaMinutes,
  serverTime,
  runStatus,
  nextStopMode,
  variant = "card",
}: ScheduleTimelineProps) {
  const prefersReducedMotion = useReducedMotion();
  const [showPast, setShowPast] = useState(false);
  const stops = deriveTimelineStops(schedule, nextStopId, isRunning, passedStopIds, inferredNextStopId, serverTime, runStatus);

  if (stops.length === 0) {
    return (
      <div className={variant === "card" ? "rounded-3xl bg-white p-6" : "pt-2"}>
        <p className="text-sm text-zinc-500">Nenhum horário disponível</p>
      </div>
    );
  }

  const allPast = runStatus === "completed";
  const pastStops = stops.filter((s) => s.status === "past");
  const visibleStops = showPast || allPast
    ? stops
    : stops.filter((s) => s.status !== "past");

  return (
    <div className={variant === "card" ? "rounded-3xl bg-white p-5 shadow-sm" : "pt-2"}>
      <div className={`flex items-center justify-between mb-4${variant === "inline" ? " sticky top-0 z-20 bg-white pb-2 -mx-5 px-5 pt-3 -mt-2" : ""}`}>
        <h3 className="text-lg font-bold text-zinc-900">Horários</h3>
        {!allPast && pastStops.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
            onClick={() => setShowPast(!showPast)}
          >
            <ChevronDown className={`size-4 transition-transform ${showPast ? "rotate-180" : ""}`} />
            {showPast
              ? "Ocultar paradas anteriores"
              : `Ver ${pastStops.length} parada${pastStops.length > 1 ? "s" : ""} anterior${pastStops.length > 1 ? "es" : ""}`}
          </Button>
        )}
      </div>

      <div className="relative">
        {/* Vertical connecting line */}
        {visibleStops.length > 1 && (
          <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-zinc-100" />
        )}

        <ul className="relative space-y-0">
          {visibleStops.map((stop, index) => (
            <li
              key={stop.id}
              className={`group flex items-start gap-3 py-2.5${
                index < visibleStops.length - 1
                  ? " border-b border-zinc-50"
                  : ""
              }`}
            >
              <div className="relative z-10 shrink-0">
                <TimelineNode status={stop.status} reducedMotion={!!prefersReducedMotion} isLastKnown={nextStopMode === "last_known"} />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm ${
                    stop.status === "current"
                      ? nextStopMode === "last_known" ? "font-semibold text-zinc-700" : "font-semibold text-blue-700"
                      : stop.status === "past"
                        ? "text-zinc-400"
                        : "text-zinc-700 group-hover:text-zinc-900 transition-colors"
                  }`}
                >
                  {stop.stopName}
                </p>
                {stop.status === "current" && (
                  <p className={`text-xs ${nextStopMode === "last_known" ? "text-zinc-500" : "text-blue-500"}`}>
                    {nextStopMode === "last_known" ? "Última posição" : "Próxima parada"}
                  </p>
                )}
                {stop.status === "current" && etaMinutes != null && (
                  <p className="text-xs text-blue-400">
                    ~{etaMinutes} min
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 font-mono text-sm ${
                  stop.status === "current"
                    ? nextStopMode === "last_known" ? "font-semibold text-zinc-700" : "font-semibold text-blue-700"
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
