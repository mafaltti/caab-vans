"use client";

import { useParams, useRouter } from "next/navigation";
import { useRouteDetail } from "@/lib/queries/use-route-detail";
import { RouteStatusBadge } from "@/components/public/route-status-badge";
import { HeroCard } from "@/components/public/hero-card";
import { ScheduleTimeline } from "@/components/public/schedule-timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, AlertCircle } from "lucide-react";

export default function RouteDetailPage() {
  const params = useParams<{ routeId: string }>();
  const router = useRouter();
  const { data, isLoading, error, refetch } = useRouteDetail(params.routeId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-6 w-48" />
        {/* Hero card skeleton */}
        <Skeleton className="h-48 w-full rounded-3xl" />
        {/* Timeline skeleton */}
        <div className="space-y-3 rounded-3xl bg-white p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="flex min-h-[44px] items-center gap-1 text-sm font-medium text-zinc-600"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </button>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Não foi possível carregar os detalhes da rota.
            <button
              onClick={() => refetch()}
              className="mt-1 min-h-[44px] text-sm font-medium underline"
            >
              Tentar novamente
            </button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const route = data!.route;

  const nextStopId =
    route.nextStop && route.schedule
      ? (route.schedule.find(
          (s) =>
            s.stopName === route.nextStop!.stopName &&
            s.time === route.nextStop!.time,
        )?.id ?? null)
      : null;

  return (
    <div className="space-y-6">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 -mx-4 bg-zinc-50/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex min-h-[44px] items-center gap-1 text-sm font-medium text-zinc-600"
          >
            <ArrowLeft className="size-4" />
            Voltar
          </button>
          <h1 className="truncate text-lg font-bold text-zinc-900">
            {route.name}
          </h1>
          <RouteStatusBadge isRunning={route.isRunning} />
        </div>
      </div>

      <HeroCard
        nextStop={route.nextStop}
        scheduleStatus={route.scheduleStatus}
        locationUrl={route.van.locationUrl}
        locationUpdatedAt={route.van.locationUpdatedAt}
        isLocationOutdated={route.van.isLocationOutdated}
        isRunning={route.isRunning}
      />

      <ScheduleTimeline schedule={route.schedule} nextStopId={nextStopId} />
    </div>
  );
}
