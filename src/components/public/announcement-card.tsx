import { Card, CardContent } from "@/components/ui/card";
import { Pin } from "lucide-react";
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
      className={
        announcement.isUrgent
          ? "border-red-300 bg-red-50"
          : undefined
      }
    >
      <CardContent className="space-y-2">
        <div className="flex items-start gap-2">
          <h2
            className={`flex-1 text-base font-semibold ${
              announcement.isUrgent ? "text-red-900" : "text-zinc-900"
            }`}
          >
            {announcement.title}
          </h2>
          {announcement.isPinned && (
            <Pin className="size-4 shrink-0 text-blue-600" />
          )}
        </div>
        <p
          className={`text-sm ${
            announcement.isUrgent ? "text-red-800" : "text-zinc-600"
          }`}
        >
          {announcement.body}
        </p>
        <p className="text-xs text-zinc-400">
          Publicado em {formatRelativeDate(announcement.createdAt)}
        </p>
      </CardContent>
    </Card>
  );
}
