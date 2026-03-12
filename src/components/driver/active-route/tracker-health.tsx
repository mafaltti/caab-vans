"use client";

import { Wifi, WifiOff, Battery, BatteryLow, BatteryWarning, Signal } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type TrackerHealthProps = {
  trackerHealth: {
    lastPingAt: string | null;
    minutesSinceLastPing: number | null;
    batteryLevel: number | null;
    networkType: string | null;
    bufferSize: number | null;
    failureCount: number | null;
    isStale: boolean;
    isLowBattery: boolean;
  } | null;
};

function BatteryIcon({ level, isLow }: { level: number | null; isLow: boolean }) {
  if (isLow) return <BatteryWarning className="size-4 text-red-600" />;
  if (level !== null && level < 0.5) return <BatteryLow className="size-4 text-amber-600" />;
  return <Battery className="size-4 text-zinc-500" />;
}

function formatBattery(level: number): string {
  return `${Math.round(level * 100)}%`;
}

function ConnectionIcon({ isStale }: { isStale: boolean }) {
  if (isStale) return <WifiOff className="size-4 text-amber-600" />;
  return <Wifi className="size-4 text-green-600" />;
}

function statusLabel(health: NonNullable<TrackerHealthProps["trackerHealth"]>): {
  text: string;
  className: string;
} {
  if (health.isLowBattery && health.batteryLevel !== null) {
    return {
      text: `Bateria baixa (${formatBattery(health.batteryLevel)})`,
      className: "bg-red-100 text-red-800 hover:bg-red-100",
    };
  }
  if (health.isStale && health.minutesSinceLastPing !== null) {
    return {
      text: `Sem sinal há ${health.minutesSinceLastPing} min`,
      className: "bg-amber-100 text-amber-800 hover:bg-amber-100",
    };
  }
  return {
    text: "Rastreador OK",
    className: "bg-green-100 text-green-800 hover:bg-green-100",
  };
}

export function TrackerHealth({ trackerHealth }: TrackerHealthProps) {
  if (!trackerHealth) return null;

  const status = statusLabel(trackerHealth);

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Signal className="size-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-700">Rastreador</span>
        </div>
        <Badge className={status.className}>{status.text}</Badge>
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <ConnectionIcon isStale={trackerHealth.isStale} />
          {trackerHealth.networkType ?? "—"}
        </span>

        {trackerHealth.batteryLevel !== null && (
          <span className="flex items-center gap-1">
            <BatteryIcon level={trackerHealth.batteryLevel} isLow={trackerHealth.isLowBattery} />
            {formatBattery(trackerHealth.batteryLevel)}
          </span>
        )}

        {trackerHealth.minutesSinceLastPing !== null && (
          <span className="text-zinc-400">
            {trackerHealth.minutesSinceLastPing === 0
              ? "agora"
              : `${trackerHealth.minutesSinceLastPing} min atrás`}
          </span>
        )}
      </div>
    </div>
  );
}
