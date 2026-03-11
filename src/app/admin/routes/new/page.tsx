"use client";

import { useRouter } from "next/navigation";
import { RouteForm } from "@/components/admin/route-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AdminRouteCreatePage() {
  const router = useRouter();

  async function handleSubmit(data: { name: string; vanId: string; driverIds: string[] }) {
    const res = await fetch("/api/admin/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? "Erro ao criar rota");
    }

    router.push("/admin/routes");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/routes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Nova rota</h1>
      </div>
      <RouteForm onSubmit={handleSubmit} submitLabel="Criar rota" />
    </div>
  );
}
