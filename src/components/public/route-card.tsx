import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { RouteStatusBadge } from "./route-status-badge";
import { ChevronRight } from "lucide-react";
import type { RouteWithStatus } from "@/types";

type RouteCardProps = {
  route: RouteWithStatus;
};

export function RouteCard({ route }: RouteCardProps) {
  const nextStopText = route.nextStop
    ? `${route.nextStop.stopName} — ${route.nextStop.time}`
    : route.scheduleStatus === "ended"
      ? "Programação encerrada"
      : "Sem horários";

  return (
    <Link href={`/routes/${route.id}`} className="block min-h-[44px]">
      <Card className="transition-colors hover:bg-zinc-50 active:bg-zinc-100">
        <CardContent className="flex items-center gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-zinc-900">
                {route.name}
              </h2>
              <RouteStatusBadge isRunning={route.isRunning} />
            </div>
            <p className="truncate text-sm text-zinc-500">{nextStopText}</p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-zinc-400" />
        </CardContent>
      </Card>
    </Link>
  );
}
