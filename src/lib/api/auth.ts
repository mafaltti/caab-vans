import { createSessionClient } from "@/lib/supabase/server";
import { apiError } from "./errors";

type AuthResult = {
  user: { id: string; email: string };
  role: "admin" | "superuser";
};

export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw apiError("UNAUTHORIZED", "Authentication required", 401);
  }

  const role = user.app_metadata?.role as "admin" | "superuser" | undefined;
  const isActive = user.app_metadata?.is_active as boolean | undefined;

  if (!role || isActive === false) {
    throw apiError("FORBIDDEN", "Account is not active", 403);
  }

  return {
    user: { id: user.id, email: user.email! },
    role,
  };
}

export async function requireRole(
  requiredRole: "admin" | "superuser",
): Promise<AuthResult> {
  const auth = await requireAuth();

  if (requiredRole === "superuser" && auth.role !== "superuser") {
    throw apiError("FORBIDDEN", "Superuser access required", 403);
  }

  return auth;
}
