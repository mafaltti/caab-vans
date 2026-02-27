"use client";

import { useState } from "react";
import { VanForm } from "@/components/admin/van-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Copy, Check } from "lucide-react";
import Link from "next/link";

type CreatedVan = {
  id: string;
  name: string;
  ingestionToken: string;
};

export default function AdminVanCreatePage() {
  const [created, setCreated] = useState<CreatedVan | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(data: { name: string }) {
    const res = await fetch("/api/admin/vans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? "Erro ao criar van");
    }

    const result = await res.json();
    setCreated(result.van);
  }

  async function copyToken(token: string) {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (created) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Van criada com sucesso</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{created.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium text-zinc-700">Token de ingestão</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="rounded bg-zinc-100 px-2 py-1 font-mono text-sm">
                  {created.ingestionToken}
                </code>
                <button
                  onClick={() => copyToken(created.ingestionToken)}
                  className="text-zinc-400 hover:text-zinc-700"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-700">Webhook URL (Pabbly)</p>
              <code className="mt-1 block rounded bg-zinc-100 px-2 py-1 font-mono text-sm">
                /api/ingest/{created.id}
              </code>
            </div>
          </CardContent>
        </Card>
        <Button asChild>
          <Link href="/admin/vans">Voltar para lista</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/vans">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Nova van</h1>
      </div>
      <VanForm onSubmit={handleSubmit} submitLabel="Criar van" />
    </div>
  );
}
