"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MapPin, Megaphone, Users, Bus } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin/vans", label: "Vans", icon: Bus },
  { href: "/admin/routes", label: "Rotas", icon: MapPin },
  { href: "/admin/announcements", label: "Avisos", icon: Megaphone },
  { href: "/admin/users", label: "Usuários", icon: Users, superuserOnly: true },
];

type SidebarNavProps = {
  role: "admin" | "superuser" | "driver";
};

export function SidebarNav({ role }: SidebarNavProps) {
  const pathname = usePathname();

  const items = navItems.filter(
    (item) => !item.superuserOnly || role === "superuser",
  );

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
