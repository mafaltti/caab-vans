import { Badge } from "@/components/ui/badge";

type RouteStatusBadgeProps = {
  isRunning: boolean;
};

export function RouteStatusBadge({ isRunning }: RouteStatusBadgeProps) {
  return (
    <Badge
      className={
        isRunning
          ? "min-h-[44px] bg-green-600 px-3 text-sm text-white hover:bg-green-600"
          : "min-h-[44px] bg-zinc-600 px-3 text-sm text-white hover:bg-zinc-600"
      }
    >
      {isRunning ? "Em operação" : "Fora de operação"}
    </Badge>
  );
}
