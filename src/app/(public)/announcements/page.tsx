"use client";

import { useAnnouncements } from "@/lib/queries/use-announcements";
import { AnnouncementCard } from "@/components/public/announcement-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function AnnouncementsPage() {
  const { data, isLoading, error, refetch } = useAnnouncements();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-zinc-900">Avisos</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-zinc-900">Avisos</h1>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Não foi possível carregar os avisos.
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

  const announcements = data?.announcements ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-zinc-900">Avisos</h1>
      {announcements.length === 0 ? (
        <div className="rounded-lg bg-zinc-100 p-6 text-center">
          <p className="text-sm text-zinc-500">Nenhum aviso no momento</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
            />
          ))}
        </div>
      )}
    </div>
  );
}
