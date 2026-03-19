"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useDriverRoutes } from "@/lib/queries/use-driver-routes";
import { RouteCard } from "@/components/driver/route-card";
import type { DriverRoute } from "@/types";
import { MapPin } from "lucide-react";

function DriverPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const vanId = searchParams.get("vanId");
  const { data, isLoading } = useDriverRoutes(vanId);
  const didRedirect = useRef(false);

  const routes = data?.routes ?? [];
  const userId = data?.userId ?? "";

  // T006: Auto-redirect to active shift
  useEffect(() => {
    if (!data || didRedirect.current) return;
    const activeRoute = data.routes.find(
      (r) => r.activeShift?.driverId === data.userId,
    );
    if (activeRoute) {
      didRedirect.current = true;
      router.replace(`/driver/routes/${activeRoute.id}`);
    }
  }, [data, router]);

  function handleRouteUpdate(updated: DriverRoute) {
    queryClient.setQueryData<{ routes: DriverRoute[]; userId: string }>(
      ["driver-routes", vanId ?? null],
      (old) => {
        if (!old) return old;
        return {
          ...old,
          routes: old.routes.map((r) => (r.id === updated.id ? updated : r)),
        };
      },
    );
  }

  if (isLoading) {
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

export default function DriverPage() {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-500">Carregando...</div>}>
      <DriverPageContent />
    </Suspense>
  );
}
