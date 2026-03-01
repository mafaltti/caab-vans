"use client";

import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/": "Rotas",
  "/avisos": "Avisos",
};

export function PublicHeader() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname];

  if (!title) return null;

  return (
    <div className="fixed top-[env(safe-area-inset-top,0px)] left-0 right-0 z-20 bg-zinc-50/90 backdrop-blur-md border-b border-zinc-200/50">
      <div className="mx-auto max-w-lg px-5 py-4">
        <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
      </div>
    </div>
  );
}
