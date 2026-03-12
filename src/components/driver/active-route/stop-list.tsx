"use client";

import { CheckCircle2, Circle, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const REASON_LABELS: Record<string, string> = {
  road_closure: "Via interditada",
  no_passengers: "Sem passageiros",
  facility_closed: "Local fechado",
  vehicle_issue: "Problema no veículo",
  other: "Outro",
};

type StopEntry = {
  id: string;
  stopName: string;
  arrivalTime: string;
  departureTime: string;
  stopSequence: number;
  status: "pending" | "passed" | "skipped" | null;
  reasonCode: string | null;
  note: string | null;
};

type StopListProps = {
  schedule: StopEntry[];
  nextStopId: string | null;
};

function StopIcon({ status, isNext }: { status: StopEntry["status"]; isNext: boolean }) {
  if (status === "passed") {
    return <CheckCircle2 className="size-5 text-zinc-400" />;
  }
  if (status === "skipped") {
    return <SkipForward className="size-5 text-orange-500" />;
  }
  if (isNext) {
    return <Circle className="size-5 text-blue-600 fill-blue-100" />;
  }
  return <Circle className="size-5 text-zinc-300" />;
}

export function StopList({ schedule, nextStopId }: StopListProps) {
  if (schedule.length === 0) {
    return (
      <p className="text-sm text-zinc-500">Nenhuma parada disponível</p>
    );
  }

  return (
    <div className="overflow-y-auto">
      <ul className="relative space-y-0">
        {schedule.map((stop, index) => {
          const isNext = stop.id === nextStopId;
          const isPassed = stop.status === "passed";
          const isSkipped = stop.status === "skipped";

          return (
            <li
              key={stop.id}
              className={`flex items-start gap-3 py-2.5 ${
                index < schedule.length - 1 ? "border-b border-zinc-100" : ""
              } ${isNext ? "bg-blue-50 -mx-3 px-3 rounded-lg" : ""}`}
            >
              <div className="shrink-0 mt-0.5">
                <StopIcon status={stop.status} isNext={isNext} />
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm ${
                    isNext
                      ? "font-semibold text-blue-700"
                      : isPassed
                        ? "text-zinc-400 line-through"
                        : isSkipped
                          ? "text-orange-700"
                          : "text-zinc-700"
                  }`}
                >
                  {stop.stopName}
                </p>

                {isNext && (
                  <p className="text-xs text-blue-500">Próxima parada</p>
                )}

                {isSkipped && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
                      Pulada
                    </Badge>
                    {stop.reasonCode && (
                      <span className="text-xs text-orange-600">
                        {REASON_LABELS[stop.reasonCode] ?? stop.reasonCode}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <span
                className={`shrink-0 font-mono text-sm ${
                  isNext
                    ? "font-semibold text-blue-700"
                    : isPassed
                      ? "text-zinc-400"
                      : isSkipped
                        ? "text-orange-600"
                        : "text-zinc-700"
                }`}
              >
                {stop.arrivalTime}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
