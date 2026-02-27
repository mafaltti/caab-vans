"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bus, Megaphone } from "lucide-react";

const navItems = [
  { href: "/", label: "Rotas", icon: Bus },
  { href: "/announcements", label: "Avisos", icon: Megaphone },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-white">
      <div className="mx-auto flex max-w-lg">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/" || pathname.startsWith("/routes")
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition-colors ${
                isActive
                  ? "font-medium text-blue-600"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
