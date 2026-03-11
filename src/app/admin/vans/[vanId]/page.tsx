"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { VanForm } from "@/components/admin/van-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

type VanData = {
  id: string;
  name: string;
};

export default function AdminVanEditPage() {
  const router = useRouter();
  const { vanId } = useParams<{ vanId: string }>();
  const [van, setVan] = useState<VanData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/vans")
      .then((res) => res.json())
      .then((data) => {
        const found = data.vans?.find((v: VanData) => v.id === vanId);
        setVan(found ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [vanId]);

  async function handleSubmit(data: { name: string }) {
    const res = await fetch(`/api/admin/vans/${vanId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: data.name }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? "Erro ao atualizar van");
    }

    router.push("/admin/vans");
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">Carregando...</div>;
  }

  if (!van) {
    return <div className="text-sm text-red-600">Van não encontrada</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/vans">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Editar van</h1>
      </div>

      <VanForm
        defaultValues={{ name: van.name }}
        onSubmit={handleSubmit}
        submitLabel="Salvar"
      />
    </div>
  );
}
