import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
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

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  const role = user?.app_metadata?.role;
  if (!user || role !== "driver") {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <h1 className="text-sm font-semibold text-zinc-900">CAAB Vans</h1>
        <AdminLogoutButton />
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
