"use client";

import Link from "next/link";
import { RouteStatusBadge } from "./route-status-badge";
import { AlertTriangle, Bus, ChevronRight, Clock, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { motion, useReducedMotion } from "motion/react";
import type { RouteWithStatus } from "@/types";

type RouteCardProps = {
  route: RouteWithStatus;
};

export function RouteCard({ route }: RouteCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const progressText =
    route.currentStopIndex !== null && route.totalStops > 0
      ? `Parada ${route.currentStopIndex + 1} de ${route.totalStops}`
      : route.scheduleStatus === "ended"
        ? "Programação encerrada"
        : route.totalStops > 0
          ? `${route.totalStops} paradas`
          : null;

  return (
    <Link href={`/routes/${route.id}`} className="block">
      <motion.div
        whileHover={prefersReducedMotion ? undefined : { scale: 0.98 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
      >
        <Card className="group relative overflow-hidden rounded-2xl p-0 gap-0 shadow-sm border-zinc-100 hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                    route.isRunning ? "bg-blue-50 text-blue-600" : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  <Bus className="size-5" />
                </div>

                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-zinc-900">
                    {route.name}
                  </h2>
                  {progressText && (
                    <p className="mt-0.5 text-xs text-zinc-500">{progressText}</p>
                  )}
                </div>
              </div>

              <RouteStatusBadge isRunning={route.isRunning} runStatus={route.progress?.runStatus} scheduleStatus={route.scheduleStatus} />
            </div>

            {route.progress?.isDetourActive && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5">
                <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                <span className="text-xs text-amber-700">Rota em desvio</span>
              </div>
            )}

            {route.nextStop && (
              <div className="mt-3 rounded-xl bg-zinc-50 px-3 py-2.5 group-hover:bg-blue-50/50 transition-colors">
                {route.nextStopMode === "last_known" && (
                  <p className="text-xs text-zinc-500 mb-1">Última posição</p>
                )}
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5 shrink-0 text-zinc-400" />
                  <span className="truncate text-sm text-zinc-700">
                    {route.nextStop.stopName}
                  </span>
                  <span className="ml-auto shrink-0 text-sm font-medium text-zinc-900">
                    {route.nextStop.arrivalTime}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-zinc-300 transition-colors group-hover:text-blue-500" />
                </div>
                {route.nextStopMode !== "last_known" && route.progress?.etaNextStopMinutes != null && route.nextStop?.id === route.progress.nextStopId && (
                  <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                    <Clock className="size-3 text-blue-600" />
                    <span className="text-xs text-blue-600 font-medium">
                      ETA: ~{route.progress.etaNextStopMinutes} min
                    </span>
                  </div>
                )}
                {route.nextStopMode !== "last_known" && route.progress?.etaStatus === "overdue" && route.nextStop?.id === route.progress.nextStopId && (
                  <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                    <Clock className="size-3 text-amber-600" />
                    <span className="text-xs text-amber-600 font-medium">
                      Atrasado
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </Link>
  );
}
