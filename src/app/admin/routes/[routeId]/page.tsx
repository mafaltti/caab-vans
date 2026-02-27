"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { RouteForm } from "@/components/admin/route-form";
import { ScheduleEditor } from "@/components/admin/schedule-editor";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

type RouteData = {
  id: string;
  name: string;
  vanId: string;
};

export default function AdminRouteEditPage() {
  const router = useRouter();
  const { routeId } = useParams<{ routeId: string }>();
  const [route, setRoute] = useState<RouteData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/routes")
      .then((res) => res.json())
      .then((data) => {
        const found = data.routes?.find(
          (r: RouteData) => r.id === routeId,
        );
        setRoute(found ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [routeId]);

  async function handleSubmit(data: { name: string; vanId: string }) {
    const res = await fetch(`/api/admin/routes/${routeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? "Erro ao atualizar rota");
    }

    router.push("/admin/routes");
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">Carregando...</div>;
  }

  if (!route) {
    return <div className="text-sm text-red-600">Rota não encontrada</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/routes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Editar rota</h1>
      </div>

      <RouteForm
        defaultValues={{ name: route.name, vanId: route.vanId }}
        onSubmit={handleSubmit}
        submitLabel="Salvar alterações"
      />

      <Separator />

      <div>
        <h2 className="mb-4 text-base font-semibold">Horários</h2>
        <ScheduleEditor routeId={routeId} />
      </div>
    </div>
  );
}
