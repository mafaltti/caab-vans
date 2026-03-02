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
  onUpdate: (route: DriverRoute) => void;
};

function statusBadge(status: RunStatus | null) {
  if (!status) {
    return <Badge variant="secondary">Sem viagem</Badge>;
  }
  switch (status) {
    case "waiting":
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Aguardando</Badge>;
    case "in_progress":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Em andamento</Badge>;
    case "completed":
      return <Badge className="bg-zinc-100 text-zinc-500 hover:bg-zinc-100">Encerrada</Badge>;
  }
}

function formatStartedAt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Bahia",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RouteCard({ route, onUpdate }: RouteCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showEndDialog, setShowEndDialog] = useState(false);

  const runStatus = route.run?.status ?? null;

  async function handleStart() {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth(`/api/routes/${route.id}/start`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Erro ao iniciar rota");
        return;
      }
      const data = await res.json();
      onUpdate({
        ...route,
        run: data.run,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar rota");
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
        setError(data.error?.message ?? "Erro ao encerrar rota");
        return;
      }
      const data = await res.json();
      onUpdate({
        ...route,
        run: data.run,
      });
      setShowEndDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao encerrar rota");
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

          {runStatus === "completed" && route.run && (
            <div className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500">
              <p>Iniciada: {formatStartedAt(route.run.startedAt!)}</p>
              <p>Encerrada: {formatStartedAt(route.run.endedAt!)}</p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {(runStatus === null || runStatus === "waiting") && (
            <Button
              className="w-full"
              onClick={handleStart}
              disabled={loading}
            >
              <Play className="mr-2 size-4" />
              {loading ? "Iniciando..." : "Iniciar Rota"}
            </Button>
          )}

          {runStatus === "in_progress" && (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setShowEndDialog(true)}
              disabled={loading}
            >
              <Square className="mr-2 size-4" />
              Encerrar Rota
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar rota</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja encerrar a rota? Esta ação não pode ser
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
