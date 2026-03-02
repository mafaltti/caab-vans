"use client";

import { Navigation, Clock, MapPin, AlertTriangle } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import type { NextStop, RunStatus, ScheduleStatus } from "@/types";

type HeroCardProps = {
  nextStop: NextStop | null;
  scheduleStatus: ScheduleStatus;
  locationUrl: string | null;
  locationUpdatedAt: string | null;
  isLocationOutdated: boolean;
  isRunning: boolean;
  etaMinutes?: number | null;
  etaISO?: string | null;
  runStatus?: RunStatus;
};

function formatTimestamp(isoDate: string): string {
  return new Date(isoDate).toLocaleString("pt-BR", {
    timeZone: "America/Bahia",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HeroCard({
  nextStop,
  scheduleStatus,
  locationUrl,
  locationUpdatedAt,
  isLocationOutdated,
  isRunning,
  etaMinutes,
  etaISO,
  runStatus,
}: HeroCardProps) {
  const prefersReducedMotion = useReducedMotion();

  if (runStatus === "completed") {
    return (
      <div className="rounded-3xl bg-emerald-50 p-6 text-center">
        <p className="text-sm font-medium text-emerald-600">
          Rota encerrada por hoje
        </p>
      </div>
    );
  }

  if (runStatus === "waiting") {
    return (
      <div className="rounded-3xl bg-amber-50 p-6 text-center">
        <Clock className="mx-auto mb-2 size-6 text-amber-500" />
        <p className="text-sm font-medium text-amber-600">
          Aguardando início da rota
        </p>
      </div>
    );
  }

  if (scheduleStatus === "ended") {
    return (
      <div className="rounded-3xl bg-zinc-200 p-6 text-center">
        <p className="text-sm font-medium text-zinc-500">
          Programação encerrada por hoje
        </p>
      </div>
    );
  }

  if (!isRunning) {
    return (
      <div className="rounded-3xl bg-zinc-200 p-6 text-center">
        <p className="text-sm font-medium text-zinc-500">
          Fora de operação
        </p>
      </div>
    );
  }

  if (!nextStop) {
    return (
      <div className="rounded-3xl bg-zinc-200 p-6 text-center">
        <p className="text-sm font-medium text-zinc-500">
          Nenhum horário disponível
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white shadow-lg">
      {/* Decorative blur circle */}
      <div className="absolute -right-8 -top-8 size-32 rounded-full bg-white/10 blur-2xl" />

      <div className="relative space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-200">
          <Navigation
            className={
              prefersReducedMotion ? "size-4" : "size-4 animate-bounce"
            }
          />
          <span>Próxima parada</span>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white">{nextStop.stopName}</h2>
          <div className="mt-1 flex items-center gap-1.5 text-blue-100">
            <Clock className="size-4" />
            <span className="font-mono text-lg">{nextStop.time}</span>
          </div>
        </div>

        {isRunning && etaMinutes != null && etaISO && (
          <div className="flex items-center gap-1.5 text-blue-100">
            <Clock className="size-3.5" />
            <span className="text-sm">
              Chegada estimada:{" "}
              {new Date(etaISO).toLocaleString("pt-BR", {
                timeZone: "America/Bahia",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              (~{etaMinutes} min)
            </span>
          </div>
        )}

        {isRunning && locationUrl && (
          <Button
            asChild
            className="w-full bg-white text-blue-700 hover:bg-blue-50 font-semibold py-6 rounded-xl shadow-sm"
          >
            <a
              href={locationUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                try {
                  const payload = JSON.stringify({
                    event: "open_location_link_clicked",
                    timestamp: new Date().toISOString(),
                  });
                  if (navigator.sendBeacon) {
                    navigator.sendBeacon(
                      "/api/track",
                      new Blob([payload], { type: "application/json" }),
                    );
                  }
                } catch {
                  // tracking is best-effort
                }
              }}
            >
              <MapPin className="size-4" />
              Abrir localização ao vivo
            </a>
          </Button>
        )}

        {(locationUpdatedAt || isLocationOutdated) && (
          <p className="mt-3 text-center text-xs text-blue-200 opacity-80">
            {locationUpdatedAt && (
              <>Atualizado: {formatTimestamp(locationUpdatedAt)}</>
            )}
            {locationUpdatedAt && isLocationOutdated && " "}
            {isLocationOutdated && (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <AlertTriangle className="size-3" />
                Desatualizado
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
