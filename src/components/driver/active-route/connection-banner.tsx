"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const STALE_THRESHOLD_S = 20;
const CHECK_INTERVAL_MS = 5000;

type ConnectionBannerProps = {
  dataUpdatedAt: number;
};

function isDataFresh(dataUpdatedAt: number): boolean {
  return (Date.now() - dataUpdatedAt) / 1000 <= STALE_THRESHOLD_S;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function ConnectionBanner({ dataUpdatedAt }: ConnectionBannerProps) {
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);
  const [stale, setStale] = useState(false);

  // Poll staleness every 5s and also check immediately when dataUpdatedAt changes
  useEffect(() => {
    function check() {
      setStale(!isDataFresh(dataUpdatedAt));
    }

    check();

    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  const visible = stale || !isOnline;

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 p-2">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-center text-sm text-amber-800">
        Sem conexão — dados podem estar desatualizados
      </div>
    </div>
  );
}
