"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bus, Bell } from "lucide-react";
import { useAnnouncements } from "@/lib/queries/use-announcements";

const navItems = [
  { href: "/", label: "Rotas", icon: Bus },
  { href: "/avisos", label: "Avisos", icon: Bell },
];

export function BottomNav() {
  const pathname = usePathname();
  const { data } = useAnnouncements();

  const hasUrgent = data?.announcements?.some((a) => a.isUrgent) ?? false;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg justify-around">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/" || pathname.startsWith("/routes")
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          const showDot = item.href === "/avisos" && hasUrgent;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[44px] w-20 flex-col items-center justify-center gap-1 py-2 transition-colors ${
                isActive ? "text-blue-600" : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              <div className="relative">
                <div
                  className={`rounded-xl p-1.5 ${
                    isActive ? "bg-blue-50" : ""
                  }`}
                >
                  <Icon
                    className={`size-6 transition-transform ${
                      isActive ? "scale-110" : ""
                    }`}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </div>
                {showDot && (
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-white bg-rose-500" />
                )}
              </div>
              <span className="text-[10px] font-semibold tracking-wide">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
