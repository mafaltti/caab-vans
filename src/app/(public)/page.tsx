"use client";

import { useRoutes } from "@/lib/queries/use-routes";
import { RouteCard } from "@/components/public/route-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { motion } from "motion/react";

function RouteCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="mt-3 h-10 w-full rounded-xl" />
    </div>
  );
}

export default function HomePage() {
  const { data, isLoading, error, refetch } = useRoutes();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-zinc-900">Rotas</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <RouteCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-zinc-900">Rotas</h1>
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
      <h1 className="text-2xl font-bold text-zinc-900">Rotas</h1>
      {routes.length === 0 ? (
        <div className="rounded-lg bg-zinc-100 p-6 text-center">
          <p className="text-sm text-zinc-500">Nenhuma rota configurada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map((route, i) => (
            <motion.div
              key={route.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <RouteCard route={route} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
