"use client";

import { useRoutes } from "@/lib/queries/use-routes";
import { RouteCard } from "@/components/public/route-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function HomePage() {
  const { data, isLoading, error, refetch } = useRoutes();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-zinc-900">Rotas</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-zinc-900">Rotas</h1>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Não foi possível carregar as rotas.
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

  const routes = data?.routes ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-zinc-900">Rotas</h1>
      {routes.length === 0 ? (
        <div className="rounded-lg bg-zinc-100 p-6 text-center">
          <p className="text-sm text-zinc-500">Nenhuma rota configurada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map((route) => (
            <RouteCard key={route.id} route={route} />
          ))}
        </div>
      )}
    </div>
  );
}
