type RouteStatusBadgeProps = {
  isRunning: boolean;
};

export function RouteStatusBadge({ isRunning }: RouteStatusBadgeProps) {
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
