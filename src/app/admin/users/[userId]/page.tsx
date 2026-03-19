"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { UserForm } from "@/components/admin/user-form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

type UserData = {
  id: string;
  email: string;
  role: "admin" | "superuser" | "driver";
  isActive: boolean;
};

export default function AdminUserEditPage() {
  const router = useRouter();
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggleDialog, setToggleDialog] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState("");
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState("");
  const [generatedPin, setGeneratedPin] = useState("");
  const [showGeneratedPin, setShowGeneratedPin] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((res) => {
        if (res.status === 403) {
          router.push("/admin");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          const found = data.users?.find((u: UserData) => u.id === userId);
          setUser(found ?? null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId, router]);

  async function handleSubmit(data: {
    email?: string;
    password?: string;
    role: "admin" | "superuser" | "driver";
  }) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? "Erro ao atualizar usuário");
    }

    router.push("/admin/users");
  }

  async function handleGeneratePin() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/admin/drivers/${userId}/generate-pin`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error?.message ?? "Erro ao gerar PIN");
        return;
      }
      setGeneratedPin(data.pin);
      setShowGeneratedPin(true);
    } catch {
      alert("Erro de conexão");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSetPin() {
    setPinSaving(true);
    setPinError("");
    try {
      const res = await fetch(`/api/admin/drivers/${userId}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (!res.ok) {
        const data = await res.json();
        setPinError(data.error?.message ?? "Erro ao definir PIN");
        return;
      }
      setPinDialogOpen(false);
    } catch {
      setPinError("Erro de conexão");
    } finally {
      setPinSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!user) return;
    setToggling(true);
    setToggleError("");

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    });

    if (res.ok) {
      setUser({ ...user, isActive: !user.isActive });
      setToggleDialog(false);
    } else {
      const err = await res.json();
      setToggleError(err.error?.message ?? "Erro ao alterar status");
    }
    setToggling(false);
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">Carregando...</div>;
  }

  if (!user) {
    return <div className="text-sm text-red-600">Usuário não encontrado</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Editar usuário</h1>
      </div>

      <div className="text-sm text-zinc-500">{user.email}</div>

      <UserForm
        defaultValues={{ email: user.email, role: user.role }}
        isEdit
        onSubmit={handleSubmit}
        submitLabel="Salvar alterações"
      />

      <div className="border-t pt-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Conta ativa</Label>
            <p className="text-sm text-zinc-500">
              {user.isActive
                ? "O usuário pode acessar o painel"
                : "O usuário está bloqueado"}
            </p>
          </div>
          <Switch
            checked={user.isActive}
            onCheckedChange={() => setToggleDialog(true)}
          />
        </div>
      </div>

      <Dialog open={toggleDialog} onOpenChange={() => setToggleDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {user.isActive ? "Desativar usuário" : "Reativar usuário"}
            </DialogTitle>
            <DialogDescription>
              {user.isActive
                ? "O usuário não poderá mais acessar o painel administrativo."
                : "O usuário poderá acessar o painel administrativo novamente."}
            </DialogDescription>
          </DialogHeader>
          {toggleError && <p className="text-sm text-red-600">{toggleError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setToggleDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant={user.isActive ? "destructive" : "default"}
              onClick={handleToggleActive}
              disabled={toggling}
            >
              {toggling
                ? "Processando..."
                : user.isActive
                  ? "Desativar"
                  : "Reativar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {user.role === "driver" && (
        <>
          <div className="border-t pt-4">
            <div className="space-y-3">
              <Label>PIN de acesso</Label>
              <p className="text-sm text-zinc-500">
                O motorista pode usar um PIN de 6 dígitos para login rápido.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGeneratePin}
                  disabled={generating}
                >
                  {generating ? "Gerando..." : "Gerar PIN"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPinDialogOpen(true);
                    setPinInput("");
                    setPinError("");
                  }}
                >
                  Definir PIN
                </Button>
              </div>
            </div>
          </div>

          {/* Set PIN Dialog */}
          <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Definir PIN</DialogTitle>
                <DialogDescription>
                  Digite um PIN de 6 dígitos para o motorista.
                </DialogDescription>
              </DialogHeader>
              <Input
                value={pinInput}
                onChange={(e) =>
                  setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                maxLength={6}
                className="text-center text-lg tracking-widest"
              />
              {pinError && (
                <p className="text-sm text-red-600">{pinError}</p>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPinDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSetPin}
                  disabled={pinSaving || pinInput.length !== 6}
                >
                  {pinSaving ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Generated PIN Dialog */}
          <Dialog
            open={showGeneratedPin}
            onOpenChange={setShowGeneratedPin}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>PIN gerado</DialogTitle>
                <DialogDescription>
                  Este PIN será exibido apenas uma vez. Anote-o agora.
                </DialogDescription>
              </DialogHeader>
              <p className="text-center text-3xl font-mono font-bold tracking-widest">
                {generatedPin}
              </p>
              <DialogFooter>
                <Button onClick={() => setShowGeneratedPin(false)}>
                  Entendido
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
