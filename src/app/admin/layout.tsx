import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SidebarNav } from "@/components/admin/sidebar-nav";
import { AdminLogoutButton } from "@/components/admin/logout-button";

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies — safe to ignore
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    return <>{children}</>;
  }

  const role = (user.app_metadata?.role ?? "admin") as "admin" | "superuser" | "driver";

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white p-4 md:block">
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-900">CAAB Vans</h2>
          <p className="text-xs text-zinc-500">{user.email}</p>
        </div>
        <SidebarNav role={role} />
        <div className="mt-auto pt-6">
          <AdminLogoutButton />
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 md:hidden">
          <h2 className="text-sm font-semibold text-zinc-900">CAAB Vans</h2>
          <AdminLogoutButton />
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-2 md:hidden">
          <MobileNav role={role} />
        </nav>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function MobileNav({ role }: { role: "admin" | "superuser" | "driver" }) {
  return <SidebarNav role={role} />;
}
