"use client";

import { usePathname } from "next/navigation";
import { PageTransition } from "@/components/public/page-transition";

export default function PublicTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const variant = pathname.startsWith("/routes/")
    ? "slide-from-right"
    : "fade-slide-up";

  return (
    <PageTransition key={pathname} variant={variant}>
      {children}
    </PageTransition>
  );
}
