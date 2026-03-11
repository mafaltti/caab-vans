"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Save } from "lucide-react";

type EntryData = {
  id: string;
  stopName: string;
  arrivalTime: string;
  departureTime: string;
  stopSequence: number;
  stopLat: number | null;
  stopLng: number | null;
};

type ScheduleEditorProps = {
  routeId: string;
};

export function ScheduleEditor({ routeId }: ScheduleEditorProps) {
  const [entries, setEntries] = useState<EntryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newStopName, setNewStopName] = useState("");
  const [newArrivalTime, setNewArrivalTime] = useState("");
  const [newDepartureTime, setNewDepartureTime] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStopName, setEditStopName] = useState("");
  const [editArrivalTime, setEditArrivalTime] = useState("");
  const [editDepartureTime, setEditDepartureTime] = useState("");
  const [newStopLat, setNewStopLat] = useState("");
  const [newStopLng, setNewStopLng] = useState("");
  const [editStopLat, setEditStopLat] = useState("");
  const [editStopLng, setEditStopLng] = useState("");

  const fetchedRouteId = useRef<string | null>(null);
  useEffect(() => {
    if (fetchedRouteId.current === routeId) return;
    fetchedRouteId.current = routeId;
    fetch(`/api/admin/routes/${routeId}/schedule`)
      .then((res) => res.json())
      .then((data) => setEntries(data.entries ?? []))
      .finally(() => setLoading(false));
  }, [routeId]);

  async function handleAdd() {
    if (!newStopName.trim() || !newArrivalTime.trim() || !newDepartureTime.trim()) return;
    if (newDepartureTime < newArrivalTime) {
      setError("Horário de saída não pode ser antes da chegada");
      return;
    }
    setError("");
    setSaving(true);

    const res = await fetch(`/api/admin/routes/${routeId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stopName: newStopName,
        arrivalTime: newArrivalTime,
        departureTime: newDepartureTime,
        stopLat: newStopLat.trim() ? parseFloat(newStopLat) : null,
        stopLng: newStopLng.trim() ? parseFloat(newStopLng) : null,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setEntries((prev) =>
        [...prev, data.entry].sort((a, b) => a.stopSequence - b.stopSequence),
      );
      setNewStopName("");
      setNewArrivalTime("");
      setNewDepartureTime("");
      setNewStopLat("");
      setNewStopLng("");
    } else {
      const data = await res.json();
      setError(data.error?.message ?? "Erro ao adicionar");
    }
    setSaving(false);
  }

  function startEdit(entry: EntryData) {
    setEditingId(entry.id);
    setEditStopName(entry.stopName);
    setEditArrivalTime(entry.arrivalTime);
    setEditDepartureTime(entry.departureTime);
    setEditStopLat(entry.stopLat != null ? String(entry.stopLat) : "");
    setEditStopLng(entry.stopLng != null ? String(entry.stopLng) : "");
    setError("");
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    if (editDepartureTime < editArrivalTime) {
      setError("Horário de saída não pode ser antes da chegada");
      return;
    }
    setError("");
    setSaving(true);

    const res = await fetch(
      `/api/admin/routes/${routeId}/schedule/${editingId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stopName: editStopName,
          arrivalTime: editArrivalTime,
          departureTime: editDepartureTime,
          stopLat: editStopLat.trim() ? parseFloat(editStopLat) : null,
          stopLng: editStopLng.trim() ? parseFloat(editStopLng) : null,
        }),
      },
    );

    if (res.ok) {
      const data = await res.json();
      setEntries((prev) =>
        prev
          .map((e) => (e.id === editingId ? data.entry : e))
          .sort((a, b) => a.stopSequence - b.stopSequence),
      );
      setEditingId(null);
    } else {
      const data = await res.json();
      setError(data.error?.message ?? "Erro ao atualizar");
    }
    setSaving(false);
  }

  async function handleDelete(entryId: string) {
    const res = await fetch(
      `/api/admin/routes/${routeId}/schedule/${entryId}`,
      { method: "DELETE" },
    );

    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    }
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">Carregando horários...</div>;
  }

  return (
    <div className="space-y-3">
      {entries.length === 0 && (
        <p className="text-sm text-zinc-500">Nenhum horário cadastrado.</p>
      )}

      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 p-2"
        >
          {editingId === entry.id ? (
            <>
              <Input
                value={editArrivalTime}
                onChange={(e) => setEditArrivalTime(e.target.value)}
                placeholder="Chegada"
                className="w-16 sm:w-20"
              />
              <Input
                value={editDepartureTime}
                onChange={(e) => setEditDepartureTime(e.target.value)}
                placeholder="Saída"
                className="w-16 sm:w-20"
              />
              <Input
                value={editStopName}
                onChange={(e) => setEditStopName(e.target.value)}
                placeholder="Nome do ponto"
                className="flex-1"
              />
              <div className="flex w-full gap-2">
                <Input
                  type="number"
                  step="any"
                  value={editStopLat}
                  onChange={(e) => setEditStopLat(e.target.value)}
                  placeholder="Latitude"
                  className="w-28 text-xs"
                />
                <Input
                  type="number"
                  step="any"
                  value={editStopLng}
                  onChange={(e) => setEditStopLng(e.target.value)}
                  placeholder="Longitude"
                  className="w-28 text-xs"
                />
              </div>
              <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                <Save className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingId(null)}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <span className="shrink-0 font-mono text-sm font-medium">
                {entry.arrivalTime}
                {entry.departureTime !== entry.arrivalTime && (
                  <span className="text-zinc-400"> – {entry.departureTime}</span>
                )}
              </span>
              <span className="flex-1">
                <span className="text-sm">{entry.stopName}</span>
                {entry.stopLat != null && entry.stopLng != null && (
                  <span className="block text-xs text-zinc-400">
                    {"\uD83D\uDCCD"} {entry.stopLat}, {entry.stopLng}
                  </span>
                )}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => startEdit(entry)}
              >
                Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(entry.id)}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-zinc-300 p-2">
        <Input
          value={newArrivalTime}
          onChange={(e) => setNewArrivalTime(e.target.value)}
          placeholder="Chegada"
          className="w-16 sm:w-20"
        />
        <Input
          value={newDepartureTime}
          onChange={(e) => setNewDepartureTime(e.target.value)}
          placeholder="Saída"
          className="w-16 sm:w-20"
        />
        <Input
          value={newStopName}
          onChange={(e) => setNewStopName(e.target.value)}
          placeholder="Nome do ponto"
          className="flex-1"
        />
        <div className="flex w-full gap-2">
          <Input
            type="number"
            step="any"
            value={newStopLat}
            onChange={(e) => setNewStopLat(e.target.value)}
            placeholder="-12.9714"
            className="w-28 text-xs"
          />
          <Input
            type="number"
            step="any"
            value={newStopLng}
            onChange={(e) => setNewStopLng(e.target.value)}
            placeholder="-38.5124"
            className="w-28 text-xs"
          />
        </div>
        <Button size="sm" onClick={handleAdd} disabled={saving}>
          <Plus className="mr-1 h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
