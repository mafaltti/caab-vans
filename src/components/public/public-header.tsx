"use client";

import { usePathname } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_TITLES: Record<string, string> = {
  "/": "Rotas",
  "/avisos": "Avisos",
};

export function PublicHeader() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname];

  return (
    <div className={`fixed top-[env(safe-area-inset-top,0px)] left-0 right-0 z-20 ${title ? "bg-zinc-50/90 backdrop-blur-md border-b border-zinc-200/50" : ""}`}>
      {title ? (
        <div className="mx-auto max-w-lg px-5 py-4">
          <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
        </div>
      ) : (
        <div className="mx-auto max-w-lg px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Skeleton className="mr-2 size-6 rounded-full" />
              <Skeleton className="h-7 w-48" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
      )}
    </div>
  );
}
