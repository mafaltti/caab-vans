"use client";

import { Navigation, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type NextStopHeroProps = {
  stopName: string | null;
  arrivalTime: string | null;
  etaMinutes: number | null;
  delayMinutes: number | null;
  etaStatus: "estimated" | "overdue" | "none";
};

function DelayBadge({ delayMinutes }: { delayMinutes: number }) {
  if (delayMinutes > 0) {
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
        +{delayMinutes}min
      </Badge>
    );
  }
  if (delayMinutes < 0) {
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
        {delayMinutes}min
      </Badge>
    );
  }
  return null;
}

export function NextStopHero({
  stopName,
  arrivalTime,
  etaMinutes,
  delayMinutes,
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
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Navigation className="size-4" />
          <span>Próxima parada</span>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-bold">{stopName}</h2>

            {arrivalTime && (
              <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                <Clock className="size-3.5" />
                <span className="font-mono">{arrivalTime}</span>
              </div>
            )}

            {etaStatus === "estimated" && etaMinutes != null && (
              <p className="text-sm text-zinc-500">
                ETA ~{etaMinutes} min
              </p>
            )}

            {etaStatus === "overdue" && (
              <p className="text-sm font-medium text-red-600">Atrasado</p>
            )}
          </div>

          {delayMinutes != null && delayMinutes !== 0 && (
            <DelayBadge delayMinutes={delayMinutes} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
