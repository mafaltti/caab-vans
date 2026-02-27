"use client";

import { useRouter } from "next/navigation";
import { AnnouncementForm } from "@/components/admin/announcement-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AdminAnnouncementCreatePage() {
  const router = useRouter();

  async function handleSubmit(data: {
    title: string;
    body: string;
    isPinned: boolean;
    isUrgent: boolean;
    expiresAt: string | null;
  }) {
    const res = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? "Erro ao criar aviso");
    }

    router.push("/admin/announcements");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/announcements">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Novo aviso</h1>
      </div>
      <AnnouncementForm onSubmit={handleSubmit} submitLabel="Criar aviso" />
    </div>
  );
}
