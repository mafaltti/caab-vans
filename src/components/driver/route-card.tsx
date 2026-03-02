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
import { MapPin, Clock, Play, Square } from "lucide-react";
import { fetchWithAuth } from "@/lib/api/fetch-with-auth";
import type { DriverRoute, RunStatus } from "@/types";

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

export function RouteCard({ route, userId, onUpdate }: RouteCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showEndDialog, setShowEndDialog] = useState(false);

  const { runStatus, activeShift } = route;
  const isMyShift = activeShift?.driverId === userId;
  const canStart = !activeShift && runStatus !== "completed";
  const canEnd = activeShift !== null && isMyShift;

  async function handleStart() {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth(`/api/routes/${route.id}/start`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Erro ao iniciar turno");
        return;
      }
      const data = await res.json();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar turno");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnd() {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth(`/api/routes/${route.id}/end`, {
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
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setShowEndDialog(true)}
              disabled={loading}
            >
              <Square className="mr-2 size-4" />
              Encerrar Turno
            </Button>
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

      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar turno</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja encerrar seu turno? Esta ação não pode ser
              desfeita.
            </DialogDescription>
          </DialogHeader>
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
    </>
  );
}
