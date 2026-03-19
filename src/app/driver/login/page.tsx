"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Delete } from "lucide-react";

export default function DriverLoginPage() {
  const [loginMode, setLoginMode] = useState<"pin" | "email">("pin");

  // Email state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // PIN state
  const [pinDigits, setPinDigits] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  // Email state
  const [emailError, setEmailError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  async function handlePinSubmit(fullPin: string) {
    setPinLoading(true);
    setPinError("");

    try {
      const res = await fetch("/api/driver/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: fullPin }),
      });

      if (!res.ok) {
        const data = await res.json();
        setPinError(data.error?.message ?? "PIN inválido");
        setPinDigits("");
        return;
      }

      window.location.href = "/driver";
    } catch {
      setPinError("Erro de conexão");
      setPinDigits("");
    } finally {
      setPinLoading(false);
    }
  }

  function handlePinDigit(digit: string) {
    if (pinLoading) return;
    const next = pinDigits + digit;
    setPinDigits(next);
    setPinError("");
    if (next.length === 6) {
      handlePinSubmit(next);
    }
  }

  function handlePinBackspace() {
    if (pinLoading) return;
    setPinDigits((prev) => prev.slice(0, -1));
    setPinError("");
  }

  function handlePinClear() {
    if (pinLoading) return;
    setPinDigits("");
    setPinError("");
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailLoading(true);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setEmailError(data.error?.message ?? "Falha ao entrar");
        return;
      }

      const data = await res.json();
      window.location.href = data.user?.role === "driver" ? "/driver" : "/admin";
    } catch {
      setEmailError("Erro de conexão");
    } finally {
      setEmailLoading(false);
    }
  }

  const padButtons = [
    "1", "2", "3",
    "4", "5", "6",
    "7", "8", "9",
    "clear", "0", "backspace",
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-xl">CAAB Vans Motorista</CardTitle>
        </CardHeader>
        <CardContent>
          {loginMode === "pin" ? (
            <div className="space-y-6">
              {/* PIN dot indicators */}
              <div className="flex justify-center gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`size-3.5 rounded-full border-2 transition-colors ${
                      i < pinDigits.length
                        ? "border-zinc-900 bg-zinc-900"
                        : "border-zinc-300 bg-white"
                    }`}
                  />
                ))}
              </div>

              {pinError && (
                <p className="text-center text-sm text-red-600">{pinError}</p>
              )}

              {pinLoading && (
                <p className="text-center text-sm text-zinc-500">Verificando...</p>
              )}

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-3">
                {padButtons.map((btn) => {
                  if (btn === "clear") {
                    return (
                      <button
                        key={btn}
                        type="button"
                        onClick={handlePinClear}
                        disabled={pinLoading}
                        className="flex h-14 items-center justify-center rounded-lg text-sm text-zinc-500 transition-colors hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-50"
                      >
                        Limpar
                      </button>
                    );
                  }
                  if (btn === "backspace") {
                    return (
                      <button
                        key={btn}
                        type="button"
                        onClick={handlePinBackspace}
                        disabled={pinLoading}
                        className="flex h-14 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-50"
                      >
                        <Delete className="size-5" />
                      </button>
                    );
                  }
                  return (
                    <button
                      key={btn}
                      type="button"
                      onClick={() => handlePinDigit(btn)}
                      disabled={pinLoading || pinDigits.length >= 6}
                      className="flex h-14 items-center justify-center rounded-lg text-lg font-medium text-zinc-900 transition-colors hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-50"
                    >
                      {btn}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setLoginMode("email")}
                className="block w-full text-center text-sm text-blue-600 hover:underline"
              >
                Entrar com e-mail
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              {emailError && (
                <p className="text-sm text-red-600">{emailError}</p>
              )}
              <Button type="submit" className="w-full" disabled={emailLoading}>
                {emailLoading ? "Entrando..." : "Entrar"}
              </Button>
              <button
                type="button"
                onClick={() => setLoginMode("pin")}
                className="block w-full text-center text-sm text-blue-600 hover:underline"
              >
                Voltar ao PIN
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
