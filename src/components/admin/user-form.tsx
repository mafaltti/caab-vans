"use client";

import { useState } from "react";
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

const userSchema = z.object({
  email: z.email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
  role: z.enum(["admin", "superuser", "driver"]),
});

const editUserSchema = z.object({
  role: z.enum(["admin", "superuser", "driver"]),
  password: z
    .string()
    .min(8, "Senha deve ter no mínimo 8 caracteres")
    .optional()
    .or(z.literal("")),
});

type UserFormData = {
  email?: string;
  password?: string;
  role: "admin" | "superuser" | "driver";
};

type UserFormProps = {
  defaultValues?: { email: string; role: "admin" | "superuser" | "driver" };
  isEdit?: boolean;
  onSubmit: (data: UserFormData) => Promise<void>;
  submitLabel?: string;
};

export function UserForm({
  defaultValues,
  isEdit = false,
  onSubmit,
  submitLabel = "Salvar",
}: UserFormProps) {
  const [email, setEmail] = useState(defaultValues?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "superuser" | "driver">(
    defaultValues?.role ?? "admin",
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (isEdit) {
      const parsed = editUserSchema.safeParse({
        role,
        password: password || undefined,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }

      const data: UserFormData = { role: parsed.data.role };
      if (parsed.data.password) {
        data.password = parsed.data.password;
      }

      setLoading(true);
      try {
        await onSubmit(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao salvar");
      } finally {
        setLoading(false);
      }
    } else {
      const parsed = userSchema.safeParse({ email, password, role });
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
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isEdit && (
        <div className="space-y-2">
          <Label htmlFor="user-email">E-mail</Label>
          <Input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@caab.org.br"
            required
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="user-password">
          {isEdit ? "Nova senha (deixe vazio para manter)" : "Senha"}
        </Label>
        <Input
          id="user-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isEdit ? "••••••••" : "Mínimo 8 caracteres"}
          required={!isEdit}
          minLength={isEdit ? undefined : 8}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="user-role">Papel</Label>
        <Select value={role} onValueChange={(v) => setRole(v as "admin" | "superuser" | "driver")}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="superuser">Superusuário</SelectItem>
            <SelectItem value="driver">Motorista</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
