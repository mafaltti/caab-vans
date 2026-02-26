"use client";

import { useParams, useRouter } from "next/navigation";
import { useRouteDetail } from "@/lib/queries/use-route-detail";
import { RouteStatusBadge } from "@/components/public/route-status-badge";
import { NextStopDisplay } from "@/components/public/next-stop-display";
import { LocationLinkCta } from "@/components/public/location-link-cta";
import { ScheduleList } from "@/components/public/schedule-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function RouteDetailPage() {
  const params = useParams<{ routeId: string }>();
  const router = useRouter();
  const { data, isLoading, error, refetch } = useRouteDetail(params.routeId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="min-h-[44px]"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </Button>
        <div className="rounded-lg bg-red-50 p-4 text-center">
          <p className="text-sm text-red-700">
            Não foi possível carregar os detalhes da rota.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-2 min-h-[44px] text-sm font-medium text-red-600 underline"
          >
            Tentar novamente
          </button>
        </div>
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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="min-h-[44px]"
      >
        <ArrowLeft className="size-4" />
        Voltar
      </Button>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-zinc-900">{route.name}</h1>
        <RouteStatusBadge isRunning={route.isRunning} />
      </div>

      <NextStopDisplay
        nextStop={route.nextStop}
        scheduleStatus={route.scheduleStatus}
      />

      <LocationLinkCta
        locationUrl={route.van.locationUrl}
        locationUpdatedAt={route.van.locationUpdatedAt}
        isLocationOutdated={route.van.isLocationOutdated}
      />

      <ScheduleList schedule={route.schedule} nextStopId={nextStopId} />
    </div>
  );
}
