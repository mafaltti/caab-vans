"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithAuth } from "@/lib/api/fetch-with-auth";
import { RouteCard } from "@/components/driver/route-card";
import type { DriverRoute } from "@/types";
import { MapPin } from "lucide-react";

export default function DriverPage() {
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);

  const didFetch = useRef(false);
  useEffect(() => {
    if (didFetch.current) return;
    didFetch.current = true;
    fetchWithAuth("/api/driver/routes")
      .then((res) => res.json())
      .then((data) => {
        setRoutes(data.routes ?? []);
        setUserId(data.userId ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  function handleRouteUpdate(updated: DriverRoute) {
    setRoutes((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r)),
    );
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">Carregando...</div>;
  }

  if (routes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <MapPin className="mb-3 size-8 text-zinc-400" />
        <p className="text-sm text-zinc-500">Nenhuma rota atribuída</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-zinc-900">Minhas rotas</h1>
      {routes.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          userId={userId}
          onUpdate={handleRouteUpdate}
        />
      ))}
    </div>
  );
}
