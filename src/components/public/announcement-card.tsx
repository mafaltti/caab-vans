import { AlertCircle, Info, Pin } from "lucide-react";
import type { AnnouncementResponse } from "@/types";

type AnnouncementCardProps = {
  announcement: AnnouncementResponse;
};

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("pt-BR", {
    timeZone: "America/Bahia",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm">
      {/* Urgent accent bar */}
      {announcement.isUrgent && (
        <div className="absolute bottom-0 left-0 top-0 w-1.5 bg-rose-500" />
      )}

      <div className="space-y-3">
        {/* Type badge + pin */}
        <div className="flex items-center gap-2">
          {announcement.isUrgent ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
              <AlertCircle className="size-3" />
              Urgente
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              <Info className="size-3" />
              Informativo
            </span>
          )}
          {announcement.isPinned && (
            <Pin className="size-4 text-blue-500" style={{ fill: "rgb(239 246 255)" }} />
          )}
        </div>

        {/* Title */}
        <h2
          className={`text-base font-semibold ${
            announcement.isUrgent ? "text-rose-900" : "text-zinc-900"
          }`}
        >
          {announcement.title}
        </h2>

        {/* Body */}
        <p
          className={`text-sm ${
            announcement.isUrgent ? "text-rose-800" : "text-zinc-600"
          }`}
        >
          {announcement.body}
        </p>

        {/* Date */}
        <p className="text-xs text-zinc-400">
          Publicado em {formatRelativeDate(announcement.createdAt)}
        </p>
      </div>
    </div>
  );
}
