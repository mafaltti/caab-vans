"use client";

import { Clock, Navigation } from "lucide-react";

import { RouteProgressBar } from "./route-progress-bar";

interface RouteDetailPeekProps {
  nextStopName: string;
  scheduledTime: string;
  etaMinutes: number | null;
  totalStops: number;
  passedCount: number;
  firstStopLabel: string;
  lastStopLabel: string;
}

export function RouteDetailPeek({
  nextStopName,
  scheduledTime,
  etaMinutes,
  totalStops,
  passedCount,
  firstStopLabel,
  lastStopLabel,
}: RouteDetailPeekProps) {
  return (
    <div className="pb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[0.7rem] font-semibold uppercase tracking-wider text-blue-600">
            <Navigation className="size-3.5 animate-bounce" />
            Próxima parada
          </div>
          <p className="truncate text-xl font-bold text-zinc-900">
            {nextStopName}
          </p>
          <div className="mt-1 flex items-center gap-1 text-sm text-zinc-500">
            <Clock className="size-3.5" />
            Previsto: {scheduledTime}
          </div>
        </div>

        {etaMinutes != null && (
          <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-blue-50 px-3.5 py-2.5">
            <span className="text-[1.75rem] font-bold leading-none text-blue-600">
              {etaMinutes}
            </span>
            <span className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-blue-600">
              min
            </span>
          </div>
        )}
      </div>

      <div className="mt-3.5">
        <RouteProgressBar
          totalStops={totalStops}
          passedCount={passedCount}
          firstStopLabel={firstStopLabel}
          lastStopLabel={lastStopLabel}
        />
      </div>
    </div>
  );
}
