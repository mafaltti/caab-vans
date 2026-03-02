import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname.startsWith("/admin/login");

  if (!user && !isLoginPage) {
    const loginUrl = new URL("/admin/login", request.url);
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  }

  if (user) {
    const role = user.app_metadata?.role as string | undefined;

    // Drivers hitting /admin/* (except login) → redirect to /driver
    if (role === "driver" && pathname.startsWith("/admin") && !isLoginPage) {
      const driverUrl = new URL("/driver", request.url);
      const redirect = NextResponse.redirect(driverUrl);
      redirect.headers.set("Cache-Control", "no-store");
      return redirect;
    }

    // Non-drivers hitting /driver/* → redirect to /admin
    if (role !== "driver" && pathname.startsWith("/driver")) {
      const adminUrl = new URL("/admin", request.url);
      const redirect = NextResponse.redirect(adminUrl);
      redirect.headers.set("Cache-Control", "no-store");
      return redirect;
    }
  }

  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/driver/:path*"],
};
