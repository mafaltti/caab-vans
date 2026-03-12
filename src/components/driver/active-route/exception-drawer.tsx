"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { MoreVertical, Navigation, SkipForward, Route } from "lucide-react";
import { SKIP_REASON_CODES, DETOUR_REASON_CODES } from "@/types";
import type { SkipReasonCode, DetourReasonCode } from "@/types";

const SKIP_LABELS: Record<SkipReasonCode, string> = {
  road_closure: "Via interditada",
  no_passengers: "Sem passageiros",
  facility_closed: "Local fechado",
  vehicle_issue: "Problema no veículo",
  other: "Outro",
};

const DETOUR_LABELS: Record<DetourReasonCode, string> = {
  road_closure: "Via interditada",
  accident: "Acidente",
  construction: "Obra na via",
  flooding: "Alagamento",
  police_checkpoint: "Blitz policial",
  other: "Outro",
};

type ExceptionDrawerProps = {
  nextStopId: string | null;
  nextStopName: string | null;
  nextStopLat: number | null;
  nextStopLng: number | null;
  isDetourActive: boolean;
  onSkipStop: (data: { stopId: string; reasonCode: string; note?: string }) => Promise<void>;
  onDetourToggle: (data: { action: "start" | "end"; reasonCode?: string; note?: string }) => Promise<void>;
  loading?: boolean;
};

function buildNavigationUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function ExceptionDrawer({
  nextStopId,
  nextStopName,
  nextStopLat,
  nextStopLng,
  isDetourActive,
  onSkipStop,
  onDetourToggle,
  loading = false,
}: ExceptionDrawerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "skip" | "detour-start">("menu");
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function resetState() {
    setMode("menu");
    setSelectedReason(null);
    setNote("");
    setError("");
  }

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (!isOpen) resetState();
  }

  async function handleSkipConfirm() {
    if (!nextStopId || !selectedReason) return;
    if (selectedReason === "other" && !note.trim()) {
      setError("Descreva o motivo");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSkipStop({
        stopId: nextStopId,
        reasonCode: selectedReason,
        note: note.trim() || undefined,
      });
      setOpen(false);
      resetState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao pular parada");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDetourStart() {
    if (!selectedReason) return;
    if (selectedReason === "other" && !note.trim()) {
      setError("Descreva o motivo");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onDetourToggle({
        action: "start",
        reasonCode: selectedReason,
        note: note.trim() || undefined,
      });
      setOpen(false);
      resetState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar desvio");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDetourEnd() {
    setSubmitting(true);
    setError("");
    try {
      await onDetourToggle({ action: "end" });
      setOpen(false);
      resetState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao encerrar desvio");
    } finally {
      setSubmitting(false);
    }
  }

  const isDisabled = loading || submitting;

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={loading}
        >
          <MoreVertical className="size-4" />
          Ações
        </Button>
      </DrawerTrigger>

      <DrawerContent>
        {mode === "menu" && (
          <>
            <DrawerHeader>
              <DrawerTitle>Ações</DrawerTitle>
              <DrawerDescription>
                Escolha uma ação para a rota em andamento
              </DrawerDescription>
            </DrawerHeader>

            <div className="space-y-2 px-4">
              {nextStopLat != null && nextStopLng != null && (
                <a
                  href={buildNavigationUrl(nextStopLat, nextStopLng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50"
                >
                  <Navigation className="size-5 text-zinc-600" />
                  <div>
                    <p className="text-sm font-medium">Navegar até a parada</p>
                    {nextStopName && (
                      <p className="text-xs text-zinc-500">{nextStopName}</p>
                    )}
                  </div>
                </a>
              )}

              {nextStopId && (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50"
                  onClick={() => setMode("skip")}
                  disabled={isDisabled}
                >
                  <SkipForward className="size-5 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium">Pular próxima parada</p>
                    {nextStopName && (
                      <p className="text-xs text-zinc-500">{nextStopName}</p>
                    )}
                  </div>
                </button>
              )}

              {isDetourActive ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100"
                  onClick={handleDetourEnd}
                  disabled={isDisabled}
                >
                  <Route className="size-5 text-amber-700" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Sair do desvio</p>
                    <p className="text-xs text-amber-600">Retornar à rota normal</p>
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50"
                  onClick={() => setMode("detour-start")}
                  disabled={isDisabled}
                >
                  <Route className="size-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium">Entrar em desvio</p>
                    <p className="text-xs text-zinc-500">Informar desvio de rota</p>
                  </div>
                </button>
              )}
            </div>

            {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}

            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DrawerClose>
            </DrawerFooter>
          </>
        )}

        {mode === "skip" && (
          <>
            <DrawerHeader>
              <DrawerTitle>Pular próxima parada</DrawerTitle>
              <DrawerDescription>
                {nextStopName
                  ? `Pular "${nextStopName}" — selecione o motivo`
                  : "Selecione o motivo"}
              </DrawerDescription>
            </DrawerHeader>

            <div className="space-y-2 px-4">
              {SKIP_REASON_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors ${
                    selectedReason === code
                      ? "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-zinc-200 hover:border-zinc-300"
                  }`}
                  onClick={() => setSelectedReason(code)}
                >
                  <span>{SKIP_LABELS[code]}</span>
                  {selectedReason === code && (
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                      Selecionado
                    </Badge>
                  )}
                </button>
              ))}

              {(selectedReason === "other" || note.length > 0) && (
                <Textarea
                  placeholder="Descreva o motivo..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  className="mt-2"
                  rows={3}
                />
              )}
            </div>

            {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}

            <DrawerFooter>
              <Button
                onClick={handleSkipConfirm}
                disabled={isDisabled || !selectedReason}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {submitting ? "Pulando..." : "Confirmar pular parada"}
              </Button>
              <Button variant="outline" onClick={() => { resetState(); setMode("menu"); }}>
                Voltar
              </Button>
            </DrawerFooter>
          </>
        )}

        {mode === "detour-start" && (
          <>
            <DrawerHeader>
              <DrawerTitle>Entrar em desvio</DrawerTitle>
              <DrawerDescription>
                Selecione o motivo do desvio
              </DrawerDescription>
            </DrawerHeader>

            <div className="space-y-2 px-4">
              {DETOUR_REASON_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors ${
                    selectedReason === code
                      ? "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-zinc-200 hover:border-zinc-300"
                  }`}
                  onClick={() => setSelectedReason(code)}
                >
                  <span>{DETOUR_LABELS[code]}</span>
                  {selectedReason === code && (
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                      Selecionado
                    </Badge>
                  )}
                </button>
              ))}

              {(selectedReason === "other" || note.length > 0) && (
                <Textarea
                  placeholder="Descreva o motivo..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  className="mt-2"
                  rows={3}
                />
              )}
            </div>

            {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}

            <DrawerFooter>
              <Button
                onClick={handleDetourStart}
                disabled={isDisabled || !selectedReason}
              >
                {submitting ? "Iniciando desvio..." : "Confirmar desvio"}
              </Button>
              <Button variant="outline" onClick={() => { resetState(); setMode("menu"); }}>
                Voltar
              </Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
