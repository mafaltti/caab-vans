import type { RunStatus, ScheduleStatus } from "@/types";

type RouteStatusBadgeProps = {
  isRunning: boolean;
  runStatus?: RunStatus;
  scheduleStatus?: ScheduleStatus;
};

type BadgeVariant = {
  label: string;
  className: string;
  pulse: boolean;
};

function resolveBadge(
  isRunning: boolean,
  runStatus?: RunStatus,
  scheduleStatus?: ScheduleStatus,
): BadgeVariant {
  // 1. Active shift → operating
  if (runStatus === "in_progress") {
    return { label: "Em operação", className: "bg-emerald-100 text-emerald-700", pulse: true };
  }
  // 2. Between shifts but van actively tracked → still operating for passengers
  if (runStatus === "idle" && isRunning) {
    return { label: "Em operação", className: "bg-emerald-100 text-emerald-700", pulse: true };
  }
  // 3. Route run exists but no active shift
  if (runStatus === "waiting" || runStatus === "idle") {
    if (scheduleStatus === "ended") {
      return { label: "Fora de operação", className: "bg-zinc-100 text-zinc-600", pulse: false };
    }
    return { label: "Aguardando início", className: "bg-amber-100 text-amber-700", pulse: false };
  }
  // 4. All shifts done, past schedule → completed for the day
  if (runStatus === "completed") {
    return { label: "Encerrada", className: "bg-emerald-50 text-emerald-600", pulse: false };
  }
  // 5. No route_run — use schedule window to decide
  if (scheduleStatus === "active") {
    return { label: "Aguardando início", className: "bg-amber-100 text-amber-700", pulse: false };
  }
  return { label: "Fora de operação", className: "bg-zinc-100 text-zinc-600", pulse: false };
}

export function RouteStatusBadge({ isRunning, runStatus, scheduleStatus }: RouteStatusBadgeProps) {
  const badge = resolveBadge(isRunning, runStatus, scheduleStatus);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${badge.className}`}
    >
      {badge.pulse && (
        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
      )}
      {badge.label}
    </span>
  );
}
