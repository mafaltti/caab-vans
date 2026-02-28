"use client";

import Link from "next/link";
import { RouteStatusBadge } from "./route-status-badge";
import { Bus, ChevronRight, MapPin, Clock } from "lucide-react";
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
        className={`group relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
          route.isRunning ? "border-l-4 border-l-emerald-500" : ""
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
              route.isRunning ? "bg-blue-50 text-blue-600" : "bg-zinc-100 text-zinc-400"
            }`}
          >
            <Bus className="size-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-zinc-900">
                {route.name}
              </h2>
              <RouteStatusBadge isRunning={route.isRunning} />
            </div>
            {progressText && (
              <p className="mt-0.5 text-xs text-zinc-500">{progressText}</p>
            )}
          </div>

          <ChevronRight className="mt-0.5 size-5 shrink-0 text-zinc-300 transition-colors group-hover:text-blue-500" />
        </div>

        {route.nextStop && (
          <div className="mt-3 rounded-xl bg-zinc-50 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <MapPin className="size-3.5 shrink-0 text-zinc-400" />
              <span className="truncate text-sm text-zinc-700">
                {route.nextStop.stopName}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1 text-sm text-zinc-500">
                <Clock className="size-3.5" />
                <span className="font-mono">{route.nextStop.time}</span>
              </span>
            </div>
          </div>
        )}
      </motion.div>
    </Link>
  );
}
