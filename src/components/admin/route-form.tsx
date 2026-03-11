"use client";

import { useState, useEffect, useRef } from "react";
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

const routeSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  vanId: z.string().min(1, "Selecione uma van"),
});

type VanOption = { id: string; name: string };
type DriverOption = { id: string; email: string };

type RouteFormProps = {
  defaultValues?: { name: string; vanId: string; driverIds?: string[] };
  onSubmit: (data: { name: string; vanId: string; driverIds: string[] }) => Promise<void>;
  submitLabel?: string;
};

export function RouteForm({ defaultValues, onSubmit, submitLabel = "Salvar" }: RouteFormProps) {
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [vanId, setVanId] = useState(defaultValues?.vanId ?? "");
  const [vans, setVans] = useState<VanOption[]>([]);
  const [driverIds, setDriverIds] = useState<string[]>(defaultValues?.driverIds ?? []);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/vans")
      .then((res) => res.json())
      .then((data) => setVans(data.vans ?? []))
      .catch(() => {});
  }, []);

  const didFetchDrivers = useRef(false);
  useEffect(() => {
    if (didFetchDrivers.current) return;
    didFetchDrivers.current = true;
    fetchWithAuth("/api/admin/drivers")
      .then((res) => res.json())
      .then((data) => setDrivers(data.drivers ?? []))
      .catch(() => {});
  }, []);

  function toggleDriver(id: string) {
    setDriverIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const parsed = routeSchema.safeParse({ name, vanId });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      await onSubmit({ ...parsed.data, driverIds });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="route-name">Nome da rota</Label>
        <Input
          id="route-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Rota Centro"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="route-van">Van</Label>
        <Select value={vanId} onValueChange={setVanId}>
          <SelectTrigger id="route-van">
            <SelectValue placeholder="Selecione uma van" />
          </SelectTrigger>
          <SelectContent>
            {vans.map((van) => (
              <SelectItem key={van.id} value={van.id}>
                {van.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
