"use client";

import { useQuery } from "@tanstack/react-query";
import type { AnnouncementResponse } from "@/types";

type AnnouncementsResponse = {
  announcements: AnnouncementResponse[];
};

async function fetchAnnouncements(): Promise<AnnouncementsResponse> {
  const res = await fetch("/api/announcements");
  if (!res.ok) {
    throw new Error("Failed to fetch announcements");
  }
  return res.json();
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: fetchAnnouncements,
    refetchInterval: 30_000,
  });
}
