"use client";

import { Button } from "@/components/ui/button";
import { MapPin, AlertTriangle } from "lucide-react";

type LocationLinkCtaProps = {
  locationUrl: string | null;
  locationUpdatedAt: string | null;
  isLocationOutdated: boolean;
};

export function LocationLinkCta({
  locationUrl,
  locationUpdatedAt,
  isLocationOutdated,
}: LocationLinkCtaProps) {
  if (!locationUrl) {
    return (
      <div className="rounded-lg bg-zinc-100 p-4">
        <p className="text-sm text-zinc-500">
          Localização não disponível
        </p>
      </div>
    );
  }

  const formattedDate = locationUpdatedAt
    ? new Date(locationUpdatedAt).toLocaleString("pt-BR", {
        timeZone: "America/Bahia",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-3">
      <Button
        asChild
        size="lg"
        className="min-h-[44px] w-full text-base"
      >
        <a
          href={locationUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            try {
              const payload = JSON.stringify({
                event: "open_location_link_clicked",
                timestamp: new Date().toISOString(),
              });
              if (navigator.sendBeacon) {
                navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
              }
            } catch {
              // tracking is best-effort
            }
          }}
        >
          <MapPin className="size-5" />
          Abrir localização
        </a>
      </Button>

      {formattedDate && (
        <p className="text-center text-xs text-zinc-500">
          Última atualização: {formattedDate}
        </p>
      )}

      {isLocationOutdated && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-700">
            Localização não atualizada hoje
          </p>
        </div>
      )}
    </div>
  );
}
