"use client";

import { Navigation, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type NextStopHeroProps = {
  stopName: string | null;
  arrivalTime: string | null;
  etaMinutes: number | null;
  etaStatus: "estimated" | "overdue" | "none";
};

export function NextStopHero({
  stopName,
  arrivalTime,
  etaMinutes,
  etaStatus,
}: NextStopHeroProps) {
  if (!stopName) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8">
          <CheckCircle2 className="size-10 text-green-500" />
          <p className="text-lg font-semibold text-green-700">
            Rota concluída
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Navigation className="size-4" />
          <span>Próxima parada</span>
        </div>

        <h2 className="text-xl font-bold">{stopName}</h2>

        <div className="flex items-center gap-3">
          {arrivalTime && (
            <div className="flex items-center gap-1.5 text-sm text-zinc-500">
              <Clock className="size-3.5" />
              <span className="font-mono">{arrivalTime}</span>
            </div>
          )}

          {etaStatus === "estimated" && etaMinutes != null && (
            <span className="text-sm text-blue-600 font-medium">
              ETA ~{etaMinutes} min
            </span>
          )}

          {etaStatus === "overdue" && (
            <span className="text-sm font-medium text-red-600">Atrasado</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
