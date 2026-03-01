"use client";

import { useAnnouncements } from "@/lib/queries/use-announcements";
import { AnnouncementCard } from "@/components/public/announcement-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { motion } from "motion/react";

export default function AvisosPage() {
  const { data, isLoading, error, refetch } = useAnnouncements();

  const announcements = data?.announcements ?? [];

  const content = isLoading ? (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="space-y-3">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </>
  ) : error ? (
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
  ) : announcements.length === 0 ? (
    <div className="rounded-lg bg-zinc-100 p-6 text-center">
      <p className="text-sm text-zinc-500">Nenhum aviso no momento</p>
    </div>
  ) : (
    <div className="space-y-3">
      {announcements.map((announcement, i) => (
        <motion.div
          key={announcement.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
        >
          <AnnouncementCard announcement={announcement} />
        </motion.div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="fixed top-0 left-0 right-0 z-20 bg-zinc-50/90 backdrop-blur-md border-b border-zinc-200/50">
        <div className="mx-auto max-w-lg px-5 py-4">
          <h1 className="text-2xl font-bold text-zinc-900">Avisos</h1>
        </div>
      </div>
      <div className="h-14" aria-hidden="true" />
      {content}
    </div>
  );
}
