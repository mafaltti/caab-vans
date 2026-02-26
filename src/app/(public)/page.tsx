"use client";

import { useRoutes } from "@/lib/queries/use-routes";
import { RouteCard } from "@/components/public/route-card";
import { Skeleton } from "@/components/ui/skeleton";

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
        <div className="rounded-lg bg-red-50 p-4 text-center">
          <p className="text-sm text-red-700">Não foi possível carregar as rotas.</p>
          <button
            onClick={() => refetch()}
            className="mt-2 min-h-[44px] text-sm font-medium text-red-600 underline"
          >
            Tentar novamente
          </button>
        </div>
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
