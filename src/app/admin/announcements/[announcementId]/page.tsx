"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { AnnouncementForm } from "@/components/admin/announcement-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

type AnnouncementData = {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  isUrgent: boolean;
  expiresAt: string | null;
};

export default function AdminAnnouncementEditPage() {
  const router = useRouter();
  const { announcementId } = useParams<{ announcementId: string }>();
  const [announcement, setAnnouncement] = useState<AnnouncementData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/announcements")
      .then((res) => res.json())
      .then((data) => {
        const found = data.announcements?.find(
          (a: AnnouncementData) => a.id === announcementId,
        );
        setAnnouncement(found ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [announcementId]);

  async function handleSubmit(data: {
    title: string;
    body: string;
    isPinned: boolean;
    isUrgent: boolean;
    expiresAt: string | null;
  }) {
    const res = await fetch(`/api/admin/announcements/${announcementId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? "Erro ao atualizar aviso");
    }

    router.push("/admin/announcements");
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">Carregando...</div>;
  }

  if (!announcement) {
    return <div className="text-sm text-red-600">Aviso não encontrado</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/announcements">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Editar aviso</h1>
      </div>
      <AnnouncementForm
        defaultValues={announcement}
        onSubmit={handleSubmit}
        submitLabel="Salvar alterações"
      />
    </div>
  );
}
