"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MapPin, Clock, Play, Square, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchWithDriverAuth } from "@/lib/api/fetch-with-driver-auth";
import type { DriverRoute, RunStatus } from "@/types";

type StopSuggestion = {
  id: string;
  name: string;
  arrivalTime: string;
};

type ColdStartData = {
  suggestedStop: StopSuggestion | null;
  alternatives: StopSuggestion[];
};

type RouteCardProps = {
  route: DriverRoute;
  userId: string;
  onUpdate: (route: DriverRoute) => void;
};

function statusBadge(status: RunStatus) {
  switch (status) {
    case "waiting":
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Aguardando</Badge>;
    case "in_progress":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Em andamento</Badge>;
    case "idle":
      return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50">Entre turnos</Badge>;
    case "completed":
      return <Badge className="bg-zinc-100 text-zinc-500 hover:bg-zinc-100">Encerrada</Badge>;
  }
}

function formatShiftTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Bahia",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getBrowserLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 30000 },
    );
  });
}

export function RouteCard({ route, userId, onUpdate }: RouteCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [coldStart, setColdStart] = useState<ColdStartData | null>(null);
  const [showColdStartDialog, setShowColdStartDialog] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const { runStatus, activeShift } = route;
  const isMyShift = activeShift?.driverId === userId;
  const canStart = !activeShift && runStatus !== "completed";
  const canEnd = activeShift !== null && isMyShift;

  function applyStartData(data: {
    shift: { id: string; driverId: string; startedAt: string };
    run: { id: string; routeId: string; serviceDate: string };
  }) {
    const newShift = {
      id: data.shift.id,
      driverId: data.shift.driverId,
      driverEmail: "",
      startedAt: data.shift.startedAt,
      endedAt: null,
    };
    onUpdate({
      ...route,
      runStatus: "in_progress",
      run: data.run,
      activeShift: {
        id: data.shift.id,
        driverId: data.shift.driverId,
        startedAt: data.shift.startedAt,
      },
      todayShifts: [...route.todayShifts, newShift],
    });
  }

  async function handleStart() {
    setLoading(true);
    setError("");
    try {
      const coords = await getBrowserLocation();
      const fetchOpts: RequestInit = { method: "POST" };
      if (coords) {
        fetchOpts.headers = { "Content-Type": "application/json" };
        fetchOpts.body = JSON.stringify({ lat: coords.lat, lng: coords.lng });
      }

      const res = await fetchWithDriverAuth(`/api/routes/${route.id}/start`, fetchOpts);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Erro ao iniciar turno");
        return;
      }
      const data = await res.json();

      if (data.coldStart) {
        setColdStart(data.coldStart);
        setSelectedStopId(data.coldStart.suggestedStop?.id ?? null);
        setShowColdStartDialog(true);
        // Apply start data immediately (shift is already created)
        applyStartData(data);
      } else {
        applyStartData(data);
        router.push(`/driver/routes/${route.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar turno");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmColdStart() {
    if (!selectedStopId) return;
    setConfirmLoading(true);
    setError("");
    try {
      const res = await fetchWithDriverAuth(
        `/api/routes/${route.id}/confirm-start-stop`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stopId: selectedStopId }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Erro ao confirmar parada");
        return;
      }
      setShowColdStartDialog(false);
      setColdStart(null);
      router.push(`/driver/routes/${route.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao confirmar parada");
    } finally {
      setConfirmLoading(false);
    }
  }

  async function handleEnd() {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithDriverAuth(`/api/routes/${route.id}/end`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Erro ao encerrar turno");
        return;
      }
      const data = await res.json();
      const endedShift = {
        id: data.shift.id,
        driverId: data.shift.driverId,
        driverEmail: route.todayShifts.find((s) => s.id === data.shift.id)?.driverEmail ?? "",
        startedAt: data.shift.startedAt,
        endedAt: data.shift.endedAt,
      };
      const updatedShifts = route.todayShifts.map((s) =>
        s.id === endedShift.id ? endedShift : s,
      );
      if (!route.todayShifts.some((s) => s.id === endedShift.id)) {
        updatedShifts.push(endedShift);
      }
      onUpdate({
        ...route,
        runStatus: "idle",
        activeShift: null,
        todayShifts: updatedShifts,
      });
      setShowEndDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao encerrar turno");
    } finally {
      setLoading(false);
    }
  }

  // Build the list of all selectable stops for the cold-start dialog
  const allColdStartStops: StopSuggestion[] = coldStart
    ? [
        ...(coldStart.suggestedStop ? [coldStart.suggestedStop] : []),
        ...coldStart.alternatives,
      ]
    : [];

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{route.name}</CardTitle>
            {statusBadge(runStatus)}
          </div>
          <p className="text-sm text-zinc-500">{route.vanName}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4 text-sm text-zinc-600">
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {route.totalStops} paradas
            </span>
            {route.firstStopTime && route.lastStopTime && (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" />
                {route.firstStopTime} – {route.lastStopTime}
              </span>
            )}
          </div>

          {activeShift && !isMyShift && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
              Turno em andamento (outro motorista)
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {canStart && (
            <Button
              className="w-full"
              onClick={handleStart}
              disabled={loading}
            >
              <Play className="mr-2 size-4" />
              {loading ? "Iniciando..." : "Iniciar Turno"}
            </Button>
          )}

          {canEnd && (
            <>
              <Button asChild className="w-full">
                <Link href={`/driver/routes/${route.id}`}>
                  <ChevronRight className="mr-2 size-4" />
                  Ver rota ativa
                </Link>
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setShowEndDialog(true)}
                disabled={loading}
              >
                <Square className="mr-2 size-4" />
                Encerrar Turno
              </Button>
            </>
          )}

          {route.todayShifts.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-500">Turnos de hoje</p>
              {route.todayShifts.map((shift) => (
                <div
                  key={shift.id}
                  className={`rounded-lg p-2.5 text-sm ${
                    shift.driverId === userId
                      ? "bg-blue-50 text-blue-800"
                      : "bg-zinc-50 text-zinc-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{shift.driverEmail || "Motorista"}</span>
                    <span className="shrink-0 text-xs">
                      {formatShiftTime(shift.startedAt)}
                      {" – "}
                      {shift.endedAt ? formatShiftTime(shift.endedAt) : (
                        <span className="font-medium text-blue-600">ativo</span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* End Shift Dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar turno</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja encerrar seu turno? Esta ação não pode ser
              desfeita.
            </DialogDescription>
          </DialogHeader>
          {activeShift?.startedAt && (
            <div className="border-t pt-3 mt-3 text-sm text-zinc-600">
              <p>
                Duração:{" "}
                {(() => {
                  const elapsed = Math.floor(
                    (Date.now() - new Date(activeShift.startedAt).getTime()) / 1000,
                  );
                  const hours = Math.floor(elapsed / 3600);
                  const minutes = Math.floor((elapsed % 3600) / 60);
                  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes} min`;
                })()}
              </p>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEndDialog(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleEnd}
              disabled={loading}
            >
              {loading ? "Encerrando..." : "Encerrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cold-Start Confirmation Dialog */}
      <Dialog
        open={showColdStartDialog}
        onOpenChange={() => {}}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar parada atual</DialogTitle>
            <DialogDescription>
              Parece que o turno começou após o horário previsto. Selecione a
              parada em que você está agora. Ela e as paradas anteriores serão
              marcadas automaticamente.
            </DialogDescription>
          </DialogHeader>

          {coldStart?.suggestedStop && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500">Sugestão</p>
              <button
                type="button"
                onClick={() => setSelectedStopId(coldStart.suggestedStop!.id)}
                className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                  selectedStopId === coldStart.suggestedStop.id
                    ? "border-blue-500 bg-blue-50 text-blue-800"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{coldStart.suggestedStop.name}</span>
                  <span className="text-xs text-zinc-500">{coldStart.suggestedStop.arrivalTime}</span>
                </div>
              </button>
            </div>
          )}

          {allColdStartStops.length > (coldStart?.suggestedStop ? 1 : 0) && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500">
                {coldStart?.suggestedStop ? "Outras paradas" : "Selecione uma parada"}
              </p>
              <div className="max-h-48 space-y-1.5 overflow-y-auto">
                {allColdStartStops
                  .filter((s) => s.id !== coldStart?.suggestedStop?.id)
                  .map((stop) => (
                    <button
                      key={stop.id}
                      type="button"
                      onClick={() => setSelectedStopId(stop.id)}
                      className={`w-full rounded-lg border p-2.5 text-left text-sm transition-colors ${
                        selectedStopId === stop.id
                          ? "border-blue-500 bg-blue-50 text-blue-800"
                          : "border-zinc-200 hover:border-zinc-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{stop.name}</span>
                        <span className="text-xs text-zinc-500">{stop.arrivalTime}</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button
              onClick={handleConfirmColdStart}
              disabled={confirmLoading || !selectedStopId}
            >
              {confirmLoading ? "Confirmando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
