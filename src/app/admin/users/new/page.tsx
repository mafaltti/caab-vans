"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserForm } from "@/components/admin/user-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AdminUserCreatePage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  const didCheck = useRef(false);
  useEffect(() => {
    if (didCheck.current) return;
    didCheck.current = true;
    fetch("/api/admin/users").then((res) => {
      if (res.status === 403) {
        router.push("/admin");
      } else {
        setAllowed(true);
      }
    });
  }, [router]);

  async function handleSubmit(data: {
    email?: string;
    password?: string;
    role: "admin" | "superuser" | "driver";
  }) {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? "Erro ao criar usuário");
    }

    router.push("/admin/users");
  }

  if (!allowed) {
    return <div className="text-sm text-zinc-500">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Novo usuário</h1>
      </div>
      <UserForm onSubmit={handleSubmit} submitLabel="Criar usuário" />
    </div>
  );
}
