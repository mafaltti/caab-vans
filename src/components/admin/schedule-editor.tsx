"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Save } from "lucide-react";

type EntryData = {
  id: string;
  stopName: string;
  time: string;
};

type ScheduleEditorProps = {
  routeId: string;
};

export function ScheduleEditor({ routeId }: ScheduleEditorProps) {
  const [entries, setEntries] = useState<EntryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newStopName, setNewStopName] = useState("");
  const [newTime, setNewTime] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStopName, setEditStopName] = useState("");
  const [editTime, setEditTime] = useState("");

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
    if (!newStopName.trim() || !newTime.trim()) return;
    setError("");
    setSaving(true);

    const res = await fetch(`/api/admin/routes/${routeId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stopName: newStopName, time: newTime }),
    });

    if (res.ok) {
      const data = await res.json();
      setEntries((prev) =>
        [...prev, data.entry].sort((a, b) => a.time.localeCompare(b.time)),
      );
      setNewStopName("");
      setNewTime("");
    } else {
      const data = await res.json();
      setError(data.error?.message ?? "Erro ao adicionar");
    }
    setSaving(false);
  }

  function startEdit(entry: EntryData) {
    setEditingId(entry.id);
    setEditStopName(entry.stopName);
    setEditTime(entry.time);
    setError("");
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setError("");
    setSaving(true);

    const res = await fetch(
      `/api/admin/routes/${routeId}/schedule/${editingId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopName: editStopName, time: editTime }),
      },
    );

    if (res.ok) {
      const data = await res.json();
      setEntries((prev) =>
        prev
          .map((e) => (e.id === editingId ? data.entry : e))
          .sort((a, b) => a.time.localeCompare(b.time)),
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
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                placeholder="HH:mm"
                className="w-16 sm:w-20"
              />
              <Input
                value={editStopName}
                onChange={(e) => setEditStopName(e.target.value)}
                placeholder="Nome do ponto"
                className="flex-1"
              />
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
              <span className="w-14 shrink-0 font-mono text-sm font-medium">
                {entry.time}
              </span>
              <span className="flex-1 text-sm">{entry.stopName}</span>
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
          value={newTime}
          onChange={(e) => setNewTime(e.target.value)}
          placeholder="HH:mm"
          className="w-16 sm:w-20"
        />
        <Input
          value={newStopName}
          onChange={(e) => setNewStopName(e.target.value)}
          placeholder="Nome do ponto"
          className="flex-1"
        />
        <Button size="sm" onClick={handleAdd} disabled={saving}>
          <Plus className="mr-1 h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
