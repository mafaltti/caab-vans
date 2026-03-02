"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWithAuth } from "@/lib/api/fetch-with-auth";

const vanSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
});

type DriverOption = { id: string; email: string };

type VanFormProps = {
  defaultValues?: { name: string; driverId?: string | null };
  onSubmit: (data: { name: string; driverId?: string | null }) => Promise<void>;
  submitLabel?: string;
  showDriverSelect?: boolean;
};

export function VanForm({
  defaultValues,
  onSubmit,
  submitLabel = "Salvar",
  showDriverSelect = false,
}: VanFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [driverId, setDriverId] = useState<string | null>(
    defaultValues?.driverId ?? null,
  );
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const didFetchDrivers = useRef(false);
  useEffect(() => {
    if (!showDriverSelect || didFetchDrivers.current) return;
    didFetchDrivers.current = true;
    fetchWithAuth("/api/admin/users")
      .then((res) => res.json())
      .then((data) => {
        const driverUsers = (data.users ?? []).filter(
          (u: { role: string; isActive: boolean }) =>
            u.role === "driver" && u.isActive,
        );
        setDrivers(driverUsers.map((u: { id: string; email: string }) => ({
          id: u.id,
          email: u.email,
        })));
      })
      .catch(() => {
        // Fail silently — driver select will just be empty
      });
  }, [showDriverSelect]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const parsed = vanSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        ...parsed.data,
        ...(showDriverSelect ? { driverId } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="van-name">Nome da van</Label>
        <Input
          id="van-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Van 01"
          required
        />
      </div>

      {showDriverSelect && (
        <div className="space-y-2">
          <Label htmlFor="van-driver">Motorista</Label>
          <Select
            value={driverId ?? "__none__"}
            onValueChange={(v) => setDriverId(v === "__none__" ? null : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Nenhum motorista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Nenhum</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
