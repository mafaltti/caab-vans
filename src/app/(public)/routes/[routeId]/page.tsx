"use client";

import { Component, type ReactNode, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useRouteDetail } from "@/lib/queries/use-route-detail";
import { RouteStatusBadge } from "@/components/public/route-status-badge";
import { HeroCard } from "@/components/public/hero-card";
import { ScheduleTimeline } from "@/components/public/schedule-timeline";
import { RouteDetailPeek } from "@/components/public/route-detail-peek";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";

const VanTrackingMap = dynamic(
  () =>
    import("@/components/public/van-tracking-map").then(
      (mod) => mod.VanTrackingMap,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[250px] w-full rounded-2xl bg-slate-100 animate-pulse" />
    ),
  },
);

const RouteDetailSheet = dynamic(
  () =>
    import("@/components/public/route-detail-sheet").then(
      (mod) => mod.RouteDetailSheet,
    ),
  { ssr: false },
);

class MapErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

type SnapPoint = number | string;

const PEEK_PADDING = { top: 80, bottom: 220, left: 40, right: 40 };

function getSheetPadding(snap: SnapPoint | null, innerHeight: number) {
  if (snap === 0.55) return { top: 80, bottom: Math.round(innerHeight * 0.55), left: 40, right: 40 };
  if (snap === 0.92) return { top: 80, bottom: Math.round(innerHeight * 0.85), left: 40, right: 40 };
  return PEEK_PADDING;
}

function getRecenterOffset(snap: SnapPoint | null, innerHeight: number): number | undefined {
  if (snap === 0.92) return -9999; // push off-screen at full
  if (snap === 0.55) return Math.round(innerHeight * 0.55) + 16;
  return 216; // peek: 200px sheet + 16px spacing
}

export default function RouteDetailPage() {
  const params = useParams<{ routeId: string }>();
  const router = useRouter();
  const { data, isLoading, error, refetch } = useRouteDetail(params.routeId);

  const route = data?.route;

  const nextStopId = route?.progress?.nextStopId
    ?? (route?.nextStop && route?.schedule
      ? (route.schedule.find(
          (s) =>
            s.stopName === route.nextStop!.stopName &&
            s.time === route.nextStop!.time,
        )?.id ?? null)
      : null);

  // Show bottom sheet layout when route is running with GPS coordinates.
  // lastLat/lastLng persist in the database once set, so this stays true even
  // when GPS signal is temporarily lost (isLocationOutdated handles the stale display).
  const useBottomSheet = route?.isRunning === true && route.van.lastLat != null && route.van.lastLng != null;

  // Sheet snap point state
  const [activeSnapPoint, setActiveSnapPoint] = useState<SnapPoint | null>(0.25);
  const [windowHeight, setWindowHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 0,
  );

  useEffect(() => {
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const fitBoundsPadding = getSheetPadding(activeSnapPoint, windowHeight);
  const recenterOffset = getRecenterOffset(activeSnapPoint, windowHeight);

  // Map stop data (shared between card and sheet mode)
  const mapStops = route?.schedule
    .filter((s) => s.stopLat != null && s.stopLng != null)
    .map((s) => ({
      id: s.id,
      stopName: s.stopName,
      stopLat: s.stopLat!,
      stopLng: s.stopLng!,
    })) ?? [];

  // Progress data for peek section
  const passedStopIds = route?.progress?.passedStopIds ?? [];
  const passedCount = passedStopIds.length;
  const totalStops = route?.schedule.length ?? 0;
  const firstStop = route?.schedule[0];
  const lastStop = route?.schedule[route.schedule.length - 1];
  const firstStopLabel = firstStop ? `${firstStop.stopName} · ${firstStop.time}` : "";
  const lastStopLabel = lastStop ? `${lastStop.stopName} · ${lastStop.time}` : "";
  const etaMinutes = route?.nextStop?.id === route?.progress?.nextStopId
    ? (route?.progress?.etaNextStopMinutes ?? null)
    : null;

  return (
    <>
      {/* Fixed header — z-[60] to stay above sheet (z-50) and BottomNav (z-50) */}
      <div className="fixed top-[env(safe-area-inset-top,0px)] left-0 right-0 z-[60] border-b border-zinc-200/50 bg-zinc-50/90 backdrop-blur-md">
        <div className="mx-auto max-w-lg px-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Skeleton className="mr-2 size-6 rounded-full" />
                <Skeleton className="h-7 w-48" />
              </div>
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.back()}
                  aria-label="Voltar"
                  className="rounded-full hover:bg-zinc-200/50 text-zinc-700 -ml-2 mr-2"
                >
                  <ArrowLeft size={24} />
                </Button>
                <h1 className="min-w-0 truncate text-2xl font-bold text-zinc-900">
                  {route?.name}
                </h1>
              </div>
              {route && <RouteStatusBadge isRunning={route.isRunning} runStatus={route.progress?.runStatus} scheduleStatus={route.scheduleStatus} />}
            </div>
          )}
        </div>
      </div>

      {!useBottomSheet && (
        <div className="h-[calc(3.5rem+env(safe-area-inset-top,0px))]" aria-hidden="true" />
      )}

      {isLoading ? (
        <div className="space-y-4 pt-6">
          <Skeleton className="h-48 w-full rounded-3xl" />
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
      ) : error ? (
        <div className="space-y-4 pt-6">
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
      ) : useBottomSheet ? (
        /* ===== SHEET LAYOUT: fullscreen map + bottom sheet ===== */
        <div className="fixed inset-0 z-40 h-dvh">
          <MapErrorBoundary>
            <VanTrackingMap
              vanLat={route!.van.lastLat!}
              vanLng={route!.van.lastLng!}
              isLocationOutdated={route!.van.isLocationOutdated}
              stops={mapStops}
              nextStopId={route!.progress?.nextStopId ?? null}
              passedStopIds={passedStopIds}
              className="absolute inset-0"
              fitBoundsPadding={fitBoundsPadding}
              recenterBottomOffset={recenterOffset}
            />
          </MapErrorBoundary>

          <RouteDetailSheet
            activeSnapPoint={activeSnapPoint}
            setActiveSnapPoint={setActiveSnapPoint}
            peek={
              route!.nextStop ? (
                <RouteDetailPeek
                  nextStopName={route!.nextStop.stopName}
                  scheduledTime={route!.nextStop.time}
                  etaMinutes={etaMinutes}
                  totalStops={totalStops}
                  passedCount={passedCount}
                  firstStopLabel={firstStopLabel}
                  lastStopLabel={lastStopLabel}
                />
              ) : null
            }
          >
            <ScheduleTimeline
              schedule={route!.schedule}
              nextStopId={nextStopId}
              isRunning={route!.isRunning}
              passedStopIds={route!.progress?.passedStopIds}
              inferredNextStopId={route!.progress?.nextStopId}
              etaMinutes={route!.progress?.etaNextStopMinutes}
              serverTime={data?.serverTime}
              runStatus={route!.progress?.runStatus}
              variant="inline"
            />
          </RouteDetailSheet>
        </div>
      ) : (
        /* ===== CARD LAYOUT: existing layout (non-running routes) ===== */
        <div className="space-y-6 pt-6">
          <HeroCard
            nextStop={route!.nextStop}
            scheduleStatus={route!.scheduleStatus}
            locationUpdatedAt={route!.van.locationUpdatedAt}
            isLocationOutdated={route!.van.isLocationOutdated}
            isRunning={route!.isRunning}
            etaMinutes={route!.nextStop?.id === route!.progress?.nextStopId ? route!.progress?.etaNextStopMinutes : undefined}
            etaISO={route!.nextStop?.id === route!.progress?.nextStopId ? route!.progress?.etaNextStopISO : undefined}
            runStatus={route!.progress?.runStatus}
          />

          {route!.isRunning && route!.van.lastLat != null && route!.van.lastLng != null && (
            <MapErrorBoundary>
              <VanTrackingMap
                vanLat={route!.van.lastLat}
                vanLng={route!.van.lastLng}
                isLocationOutdated={route!.van.isLocationOutdated}
                stops={mapStops}
                nextStopId={route!.progress?.nextStopId ?? null}
                passedStopIds={passedStopIds}
              />
            </MapErrorBoundary>
          )}

          <ScheduleTimeline
            schedule={route!.schedule}
            nextStopId={nextStopId}
            isRunning={route!.isRunning}
            passedStopIds={route!.progress?.passedStopIds}
            inferredNextStopId={route!.progress?.nextStopId}
            etaMinutes={route!.progress?.etaNextStopMinutes}
            serverTime={data?.serverTime}
            runStatus={route!.progress?.runStatus}
          />
        </div>
      )}
    </>
  );
}
