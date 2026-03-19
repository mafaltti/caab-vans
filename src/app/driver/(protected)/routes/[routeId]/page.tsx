"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { NextStopHero } from "@/components/driver/active-route/next-stop-hero";
import { TrackerHealth } from "@/components/driver/active-route/tracker-health";
import { ExceptionDrawer } from "@/components/driver/active-route/exception-drawer";
import { ShiftTimer } from "@/components/driver/active-route/shift-timer";
import { ConnectionBanner } from "@/components/driver/active-route/connection-banner";
import { ScheduleTimeline } from "@/components/public/schedule-timeline";
import { fetchWithDriverAuth } from "@/lib/api/fetch-with-driver-auth";

type DriverRouteResponse = {
  route: {
    id: string;
    name: string;
    isRunning: boolean;
    trackingStatus: "live" | "stale" | "missing";
    isTrackingFresh: boolean;
    scheduleStatus: "active" | "ended" | "not_started";
    totalStops: number;
    currentStopIndex: number | null;
    progress: {
      serviceDate: string;
      runStatus: "waiting" | "in_progress" | "idle" | "completed";
      shiftStartedAt: string | null;
      nextStopId: string | null;
      passedStopIds: string[];
      skippedStopIds: string[];
      etaNextStopISO: string | null;
      etaNextStopMinutes: number | null;
      delayMinutes: number | null;
      etaSource: string | null;
      etaStatus: "estimated" | "overdue" | "none";
      hasSkippedStops: boolean;
      isDetourActive: boolean;
      detourReasonCode: string | null;
      detourNote: string | null;
    } | null;
    schedule: Array<{
      id: string;
      stopName: string;
      arrivalTime: string;
      departureTime: string;
      stopSequence: number;
      stopLat: number | null;
      stopLng: number | null;
      status: "pending" | "passed" | "skipped" | null;
      passedAt: string | null;
      reasonCode: string | null;
      note: string | null;
    }>;
    van: {
      id: string;
      lastLat: number | null;
      lastLng: number | null;
      lastGpsFixAt: string | null;
      isLocationOutdated: boolean;
    };
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
  serverTime: string;
};

const DETOUR_LABELS: Record<string, string> = {
  road_closure: "Via interditada",
  accident: "Acidente",
  construction: "Obra na via",
  flooding: "Alagamento",
  police_checkpoint: "Blitz policial",
  other: "Outro",
};

async function fetchDriverRoute(routeId: string, signal?: AbortSignal): Promise<DriverRouteResponse> {
  const res = await fetchWithDriverAuth(`/api/driver/routes/${routeId}`, { signal });
  if (!res.ok) {
    if (res.status === 403 || res.status === 404) {
      throw new Error("NOT_FOUND");
    }
    throw new Error("Failed to fetch route detail");
  }
  return res.json();
}

function formatDuration(startedAt: string): string {
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes} min`;
}

export default function ActiveRoutePage() {
  const params = useParams<{ routeId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showEndDialog, setShowEndDialog] = useState(false);
  const [endLoading, setEndLoading] = useState(false);
  const [endError, setEndError] = useState("");

  // T013: Stop advancement detection
  const previousNextStopId = useRef<string | null>(null);
  const [showStopAdvanced, setShowStopAdvanced] = useState(false);

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["driver-route", params.routeId],
    queryFn: ({ signal }) => fetchDriverRoute(params.routeId, signal),
    refetchInterval: 5_000,
    enabled: !!params.routeId,
  });

  const route = data?.route;

  // T013: Detect stop advancement
  useEffect(() => {
    const currentNextStopId = route?.progress?.nextStopId ?? null;
    if (
      previousNextStopId.current !== null &&
      currentNextStopId !== previousNextStopId.current
    ) {
      navigator.vibrate?.(200);
      setShowStopAdvanced(true);
      const timeout = setTimeout(() => setShowStopAdvanced(false), 3000);
      previousNextStopId.current = currentNextStopId;
      return () => clearTimeout(timeout);
    }
    previousNextStopId.current = currentNextStopId;
  }, [route?.progress?.nextStopId]);

  // Skip-stop mutation
  const skipMutation = useMutation({
    mutationFn: async (data: { stopId: string; reasonCode: string; note?: string }) => {
      const res = await fetchWithDriverAuth(`/api/routes/${params.routeId}/skip-stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "Erro ao pular parada");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-route", params.routeId] });
    },
  });

  // Detour mutation
  const detourMutation = useMutation({
    mutationFn: async (data: { action: "start" | "end"; reasonCode?: string; note?: string }) => {
      const res = await fetchWithDriverAuth(`/api/routes/${params.routeId}/detour`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "Erro no desvio");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-route", params.routeId] });
    },
  });

  // Redirect to route list if no active shift
  const shouldRedirect = !isLoading && route != null && !route.isRunning;
  useEffect(() => {
    if (shouldRedirect) {
      router.replace("/driver");
    }
  }, [shouldRedirect, router]);

  if (shouldRedirect) {
    return null;
  }

  async function handleEndShift() {
    setEndLoading(true);
    setEndError("");
    try {
      const res = await fetchWithDriverAuth(`/api/routes/${params.routeId}/end`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setEndError(data.error?.message ?? "Erro ao encerrar turno");
        return;
      }
      setShowEndDialog(false);
      router.replace("/driver");
    } catch (err) {
      setEndError(err instanceof Error ? err.message : "Erro ao encerrar turno");
    } finally {
      setEndLoading(false);
    }
  }

  // Find next stop data for hero
  const nextStopId = route?.progress?.nextStopId ?? null;
  const nextStopEntry = nextStopId ? route?.schedule.find((s) => s.id === nextStopId) : null;

  // T007: Progress indicator computation
  const passedCount = (route?.progress?.passedStopIds?.length ?? 0) + (route?.progress?.skippedStopIds?.length ?? 0);
  const totalStops = route?.schedule.length ?? 0;

  // T014: Shift-end summary computation
  const shiftStartedAt = route?.progress?.shiftStartedAt;
  const endSummaryPassed = shiftStartedAt
    ? route?.schedule.filter(
        (s) =>
          s.status === "passed" &&
          s.passedAt &&
          new Date(s.passedAt) >= new Date(shiftStartedAt),
      ).length ?? 0
    : 0;
  const endSummarySkipped = route?.schedule.filter((s) => s.status === "skipped").length ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 size-4" />
          Voltar
        </Button>
        <p className="text-sm text-red-600">
          {error?.message === "NOT_FOUND"
            ? "Rota não encontrada ou sem acesso"
            : "Erro ao carregar rota"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2">
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">{route.name}</h1>
            {/* T009: Shift timer */}
            {route.progress?.shiftStartedAt && (
              <ShiftTimer shiftStartedAt={route.progress.shiftStartedAt} />
            )}
          </div>
        </div>
        <ExceptionDrawer
          nextStopId={nextStopId}
          nextStopName={nextStopEntry?.stopName ?? null}
          nextStopLat={nextStopEntry?.stopLat ?? null}
          nextStopLng={nextStopEntry?.stopLng ?? null}
          isDetourActive={route.progress?.isDetourActive ?? false}
          onSkipStop={async (data) => { await skipMutation.mutateAsync(data); }}
          onDetourToggle={async (data) => { await detourMutation.mutateAsync(data); }}
          loading={skipMutation.isPending || detourMutation.isPending}
        />
      </div>

      {/* T011: Connection banner */}
      {route.progress?.runStatus === "in_progress" && (
        <ConnectionBanner dataUpdatedAt={dataUpdatedAt} />
      )}

      {/* T007: Progress indicator */}
      {route.progress?.runStatus === "in_progress" && (
        <div className="space-y-1">
          <p className="text-sm text-zinc-600">
            {passedCount} de {totalStops} paradas
          </p>
          <div className="h-1.5 w-full rounded-full bg-zinc-200">
            <div
              className="h-1.5 rounded-full bg-green-500"
              style={{ width: `${totalStops > 0 ? (passedCount / totalStops) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Detour banner */}
      {route.progress?.isDetourActive && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-200 text-amber-800 hover:bg-amber-200">Em desvio</Badge>
            {route.progress.detourReasonCode && (
              <span className="text-sm text-amber-700">
                {DETOUR_LABELS[route.progress.detourReasonCode] ?? route.progress.detourReasonCode}
              </span>
            )}
          </div>
          {route.progress.detourNote && (
            <p className="mt-1 text-xs text-amber-600">{route.progress.detourNote}</p>
          )}
        </div>
      )}

      {/* Next stop hero */}
      <NextStopHero
        stopName={nextStopEntry?.stopName ?? null}
        arrivalTime={nextStopEntry?.arrivalTime ?? null}
        etaMinutes={route.progress?.etaNextStopMinutes ?? null}
        delayMinutes={route.progress?.delayMinutes ?? null}
        etaStatus={route.progress?.etaStatus ?? "none"}
        highlighted={showStopAdvanced}
      />

      {/* Tracker health */}
      <TrackerHealth trackerHealth={route.trackerHealth} />

      {/* Stop list */}
      <ScheduleTimeline
        schedule={route.schedule}
        nextStopId={nextStopId}
        isRunning={route.isRunning}
        passedStopIds={route.progress?.passedStopIds}
        skippedStopIds={route.progress?.skippedStopIds}
        inferredNextStopId={route.progress?.nextStopId}
        etaMinutes={route.progress?.etaNextStopMinutes}
        etaStatus={route.progress?.etaStatus}
        serverTime={data?.serverTime}
        runStatus={route.progress?.runStatus}
      />

      {/* End shift button */}
      <Button
        variant="destructive"
        className="w-full"
        onClick={() => setShowEndDialog(true)}
      >
        <Square className="mr-2 size-4" />
        Encerrar Turno
      </Button>

      {/* End shift dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar turno</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja encerrar seu turno? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {/* T014: Shift-end summary */}
          {shiftStartedAt && (
            <div className="border-t pt-3 mt-3 space-y-1 text-sm text-zinc-600">
              <p>Duração: {formatDuration(shiftStartedAt)}</p>
              <p>Paradas realizadas: {endSummaryPassed}</p>
              <p>Paradas puladas: {endSummarySkipped}</p>
            </div>
          )}
          {endError && <p className="text-sm text-red-600">{endError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEndDialog(false)} disabled={endLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleEndShift} disabled={endLoading}>
              {endLoading ? "Encerrando..." : "Encerrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
