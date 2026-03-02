"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchWithAuth } from "@/lib/api/fetch-with-auth";

const vanSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
});

type DriverOption = { id: string; email: string };

type VanFormProps = {
  defaultValues?: { name: string; driverIds?: string[] };
  onSubmit: (data: { name: string; driverIds?: string[] }) => Promise<void>;
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
  const [driverIds, setDriverIds] = useState<string[]>(
    defaultValues?.driverIds ?? [],
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
        // Fail silently — driver list will just be empty
      });
  }, [showDriverSelect]);

  function toggleDriver(id: string) {
    setDriverIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }

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
        ...(showDriverSelect ? { driverIds } : {}),
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
          <Label>Motoristas</Label>
          {drivers.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum motorista disponível</p>
          ) : (
            <div className="space-y-2">
              {drivers.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={driverIds.includes(d.id)}
                    onChange={() => toggleDriver(d.id)}
                    className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                  />
                  {d.email}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
