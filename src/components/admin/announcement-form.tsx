"use client";

import { useState } from "react";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const announcementSchema = z.object({
  title: z.string().min(1, "Título é obrigatório").max(200, "Título muito longo"),
  body: z.string().min(1, "Conteúdo é obrigatório").max(2000, "Conteúdo muito longo"),
  isPinned: z.boolean(),
  isUrgent: z.boolean(),
  expiresAt: z.string().nullable(),
});

type AnnouncementFormData = {
  title: string;
  body: string;
  isPinned: boolean;
  isUrgent: boolean;
  expiresAt: string | null;
};

type AnnouncementFormProps = {
  defaultValues?: AnnouncementFormData;
  onSubmit: (data: AnnouncementFormData) => Promise<void>;
  submitLabel?: string;
};

export function AnnouncementForm({
  defaultValues,
  onSubmit,
  submitLabel = "Salvar",
}: AnnouncementFormProps) {
  const [title, setTitle] = useState(defaultValues?.title ?? "");
  const [body, setBody] = useState(defaultValues?.body ?? "");
  const [isPinned, setIsPinned] = useState(defaultValues?.isPinned ?? false);
  const [isUrgent, setIsUrgent] = useState(defaultValues?.isUrgent ?? false);
  const [expiresAt, setExpiresAt] = useState(
    defaultValues?.expiresAt
      ? defaultValues.expiresAt.slice(0, 16)
      : "",
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const data = {
      title,
      body,
      isPinned,
      isUrgent,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    };

    const parsed = announcementSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="announcement-title">Título</Label>
        <Input
          id="announcement-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Rota suspensa amanhã"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="announcement-body">Conteúdo</Label>
        <Textarea
          id="announcement-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Detalhes do aviso..."
          rows={4}
          required
        />
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            id="announcement-pinned"
            checked={isPinned}
            onCheckedChange={setIsPinned}
          />
          <Label htmlFor="announcement-pinned">Fixado</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="announcement-urgent"
            checked={isUrgent}
            onCheckedChange={setIsUrgent}
          />
          <Label htmlFor="announcement-urgent">Urgente</Label>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="announcement-expires">Expira em (opcional)</Label>
        <Input
          id="announcement-expires"
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
