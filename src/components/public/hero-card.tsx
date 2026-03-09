"use client";

import { Navigation, Clock, AlertTriangle, MapPin } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { NextStop, RunStatus, ScheduleStatus } from "@/types";

type HeroCardProps = {
  nextStop: NextStop | null;
  scheduleStatus: ScheduleStatus;
  lastGpsFixAt: string | null;
  isLocationOutdated: boolean;
  isRunning: boolean;
  etaMinutes?: number | null;
  etaISO?: string | null;
  etaStatus?: "estimated" | "overdue" | "none";
  runStatus?: RunStatus;
  nextStopMode?: "live" | "last_known" | null;
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
  lastGpsFixAt,
  isLocationOutdated,
  isRunning,
  etaMinutes,
  etaISO,
  etaStatus,
  runStatus,
  nextStopMode,
}: HeroCardProps) {
  const prefersReducedMotion = useReducedMotion();

  // 1. Day completed — all shifts done, past schedule
  if (runStatus === "completed") {
    return (
      <div className="rounded-3xl bg-blue-50 p-6 text-center">
        <p className="text-sm font-medium text-blue-600">
          Rota encerrada por hoje
        </p>
      </div>
    );
  }

  // 1b. Last known position — not running but have a last-known stop
  if (!isRunning && nextStopMode === "last_known" && nextStop) {
    return (
      <div className="rounded-3xl bg-zinc-100 p-6 text-center">
        <MapPin className="mx-auto mb-2 size-6 text-zinc-400" />
        <p className="text-sm font-medium text-zinc-600">
          Última posição conhecida
        </p>
        <p className="mt-2 text-lg font-semibold text-zinc-800">
          {nextStop.stopName}
        </p>
        <p className="mt-1 text-sm text-zinc-400">às {nextStop.time}</p>
      </div>
    );
  }

  // 2. Active shift but GPS stale — show operating with warning
  if (runStatus === "in_progress" && !isRunning) {
    return (
      <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-center text-white shadow-lg">
        <Navigation className="mx-auto mb-2 size-6 text-blue-200" />
        <p className="text-sm font-medium">Em operação</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-300">
          <AlertTriangle className="size-3" />
          Localização desatualizada
        </p>
      </div>
    );
  }

  // 3. Waiting/idle — route_run exists but no active shift
  if (runStatus === "waiting" || (runStatus === "idle" && !isRunning)) {
    if (scheduleStatus === "ended") {
      return (
        <div className="rounded-3xl bg-zinc-200 p-6 text-center">
          <p className="text-sm font-medium text-zinc-500">
            Programação encerrada por hoje
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-3xl bg-amber-50 p-6 text-center">
        <Clock className="mx-auto mb-2 size-6 text-amber-500" />
        <p className="text-sm font-medium text-amber-600">
          Aguardando início da rota
        </p>
      </div>
    );
  }
  // Note: idle + isRunning falls through to blue card below

  // 4. Schedule ended, no route_run
  if (scheduleStatus === "ended") {
    return (
      <div className="rounded-3xl bg-zinc-200 p-6 text-center">
        <p className="text-sm font-medium text-zinc-500">
          Programação encerrada por hoje
        </p>
      </div>
    );
  }

  // 5. Not running — no route_run, schedule active or not started
  if (!isRunning) {
    if (scheduleStatus === "active") {
      return (
        <div className="rounded-3xl bg-amber-50 p-6 text-center">
          <Clock className="mx-auto mb-2 size-6 text-amber-500" />
          <p className="text-sm font-medium text-amber-600">
            Aguardando início da rota
          </p>
        </div>
      );
    }
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
        {isRunning && etaStatus === "overdue" && etaMinutes == null && (
          <div className="flex items-center gap-1.5 text-amber-300">
            <Clock className="size-3.5" />
            <span className="text-sm font-medium">Atrasado</span>
          </div>
        )}

        {(lastGpsFixAt || isLocationOutdated) && (
          <p className="mt-3 text-center text-xs text-blue-200 opacity-80">
            {lastGpsFixAt && (
              <>Atualizado: {formatTimestamp(lastGpsFixAt)}</>
            )}
            {lastGpsFixAt && isLocationOutdated && " "}
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
