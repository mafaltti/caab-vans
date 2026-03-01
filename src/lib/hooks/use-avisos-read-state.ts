"use client";

import { useSyncExternalStore, useCallback } from "react";
import type { AnnouncementResponse } from "@/types";

const STORAGE_KEY = "avisos_last_seen_at";

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY);
}

function getServerSnapshot() {
  return null;
}

export function useAvisosReadState() {
  const lastSeenAt = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const markAsSeen = useCallback(() => {
    const now = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, now);
    emitChange();
  }, []);

  const hasUnread = useCallback(
    (announcements: AnnouncementResponse[]) => {
      if (announcements.length === 0) return false;
      if (lastSeenAt === null) return true;
      return announcements.some((a) => a.createdAt > lastSeenAt);
    },
    [lastSeenAt],
  );

  return { lastSeenAt, markAsSeen, hasUnread };
}
