"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function AdminLogoutButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleLogout() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/auth/logout", { method: "POST" });
      if (!res.ok) {
        setError(true);
        setLoading(false);
        return;
      }
      window.location.href = "/admin/login";
    } catch {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        disabled={loading}
      >
        <LogOut className="mr-2 h-4 w-4" />
        {loading ? "Saindo..." : "Sair"}
      </Button>
      {error && <p className="text-xs text-red-600">Falha ao sair</p>}
    </div>
  );
}
