import type { Metadata } from "next";
import { BottomNav } from "@/components/public/bottom-nav";

export const metadata: Metadata = {
  title: "CAAB Vans",
  description: "Acompanhe o status das rotas de transporte CAAB",
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <main className="mx-auto max-w-lg px-4 pb-20 pt-6">{children}</main>
      <BottomNav />
    </div>
  );
}
