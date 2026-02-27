"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithAuth } from "@/lib/api/fetch-with-auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Copy, Check } from "lucide-react";

type VanItem = {
  id: string;
  name: string;
  ingestionToken: string;
  locationUrl: string | null;
  locationUpdatedAt: string | null;
  createdAt: string;
};

export default function AdminVansPage() {
  const [vans, setVans] = useState<VanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const didFetch = useRef(false);
  useEffect(() => {
    if (didFetch.current) return;
    didFetch.current = true;
    fetchWithAuth("/api/admin/vans")
      .then((res) => res.json())
      .then((data) => setVans(data.vans ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/admin/vans/${deleteId}`, { method: "DELETE" });
    if (res.ok) {
      setVans((prev) => prev.filter((v) => v.id !== deleteId));
      setDeleteId(null);
    } else {
      const data = await res.json();
      setError(data.error?.message ?? "Erro ao excluir");
    }
    setDeleting(false);
  }

  function maskToken(token: string) {
    return token.slice(0, 8) + "...";
  }

  async function copyToken(token: string, vanId: string) {
    await navigator.clipboard.writeText(token);
    setCopiedId(vanId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Vans</h1>
        <Button asChild size="sm">
          <Link href="/admin/vans/new">
            <Plus className="mr-2 h-4 w-4" />
            Nova van
          </Link>
        </Button>
      </div>

      {vans.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center">
          <p className="text-sm text-zinc-500">Nenhuma van cadastrada.</p>
          <Button asChild variant="link" size="sm" className="mt-2">
            <Link href="/admin/vans/new">Crie uma</Link>
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Webhook URL</TableHead>
              <TableHead>Última atualização</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vans.map((van) => (
              <TableRow key={van.id}>
                <TableCell className="font-medium">{van.name}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1 font-mono text-xs">
                    {maskToken(van.ingestionToken)}
                    <button
                      onClick={() => copyToken(van.ingestionToken, van.id)}
                      className="text-zinc-400 hover:text-zinc-700"
                      title="Copiar token"
                    >
                      {copiedId === van.id ? (
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </span>
                </TableCell>
                <TableCell>
                  <code className="text-xs text-zinc-500">
                    /api/ingest/{van.id}
                  </code>
                </TableCell>
                <TableCell className="text-sm text-zinc-500">
                  {van.locationUpdatedAt
                    ? new Date(van.locationUpdatedAt).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/vans/${van.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(van.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta van? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
