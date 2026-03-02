import type { RunStatus } from "@/types";

type RouteStatusBadgeProps = {
  isRunning: boolean;
  runStatus?: RunStatus;
};

export function RouteStatusBadge({ isRunning, runStatus }: RouteStatusBadgeProps) {
  if (runStatus === "idle") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide bg-amber-100 text-amber-700">
        Entre turnos
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${
        isRunning
          ? "bg-emerald-100 text-emerald-700"
          : "bg-zinc-100 text-zinc-600"
      }`}
    >
      {isRunning && (
        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
      )}
      {isRunning ? "Em operação" : "Fora de operação"}
    </span>
  );
}
