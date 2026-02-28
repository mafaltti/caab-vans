import { AlertCircle, Info, Pin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <Card
      className={`relative overflow-hidden rounded-2xl p-0 gap-0 shadow-sm ${
        announcement.isUrgent
          ? "border-rose-200 shadow-rose-100/50"
          : "border-zinc-100"
      }`}
    >
      <CardContent className="p-5">
        {/* Type badge + pin */}
        <div className="flex items-center gap-2">
          {announcement.isUrgent ? (
            <Badge
              variant="destructive"
              className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-none shadow-none rounded text-[10px] font-bold uppercase tracking-wider"
            >
              <AlertCircle className="size-3" />
              Urgente
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="bg-zinc-100 text-zinc-600 hover:bg-zinc-100 border-none shadow-none rounded text-[10px] font-bold uppercase tracking-wider"
            >
              <Info className="size-3" />
              Informativo
            </Badge>
          )}
          {announcement.isPinned && (
            <Pin className="size-4 text-blue-500" style={{ fill: "rgb(239 246 255)" }} />
          )}
        </div>

        {/* Title */}
        <h2
          className={`mt-3 text-lg font-bold ${
            announcement.isUrgent ? "text-rose-900" : "text-zinc-900"
          }`}
        >
          {announcement.title}
        </h2>

        {/* Body */}
        <p
          className={`mt-3 text-sm leading-relaxed ${
            announcement.isUrgent ? "text-rose-800" : "text-zinc-600"
          }`}
        >
          {announcement.body}
        </p>

        {/* Date */}
        <p className="mt-3 text-xs font-medium text-zinc-400">
          Publicado em {formatRelativeDate(announcement.createdAt)}
        </p>
      </CardContent>
    </Card>
  );
}
