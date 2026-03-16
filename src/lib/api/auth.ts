import { type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSessionClient, createServiceClient } from "@/lib/supabase/server";
import { apiError } from "./errors";

type AuthResult = {
  user: { id: string; email: string };
  role: "admin" | "superuser" | "driver";
};

export async function requireAuth(request?: NextRequest): Promise<AuthResult> {
  // Bearer token path (native callers)
  if (request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        throw apiError("UNAUTHORIZED", "Invalid or expired token", 401);
      }

      const role = user.app_metadata?.role as "admin" | "superuser" | "driver" | undefined;
      const isActive = user.app_metadata?.is_active as boolean | undefined;

      if (!role || isActive === false) {
        throw apiError("FORBIDDEN", "Account is inactive", 403);
      }

      return {
        user: { id: user.id, email: user.email! },
        role,
      };
    }
  }

  // Cookie-based path (web callers)
  const supabase = await createSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw apiError("UNAUTHORIZED", "Authentication required", 401);
  }

  const role = user.app_metadata?.role as "admin" | "superuser" | "driver" | undefined;
  const isActive = user.app_metadata?.is_active as boolean | undefined;

  if (!role || isActive === false) {
    throw apiError("FORBIDDEN", "Account is not active", 403);
  }

  return {
    user: { id: user.id, email: user.email! },
    role,
  };
}

export async function requireBoundVan(request: NextRequest): Promise<string | null> {
  const vanId = request.headers.get("x-bound-van-id");
  const ingestionToken = request.headers.get("x-ingestion-token");
  const isBearer = request.headers.get("authorization")?.startsWith("Bearer ");

  if (!vanId || !ingestionToken) {
    // Bearer callers (native) MUST provide bound-van headers
    if (isBearer) {
      throw apiError("UNAUTHORIZED", "Bound-van headers required for native callers", 401);
    }
    return null;
  }

  const supabase = createServiceClient();
  const { data: van } = await supabase
    .from("vans")
    .select("id, ingestion_token")
    .eq("id", vanId)
    .single();

  if (!van) {
    throw apiError("NOT_FOUND", "Van not found", 404);
  }

  if (van.ingestion_token !== ingestionToken) {
    throw apiError("UNAUTHORIZED", "Invalid ingestion token", 401);
  }

  return vanId;
}

export async function requireRole(
  requiredRole: "admin" | "superuser" | "driver",
  request?: NextRequest,
): Promise<AuthResult> {
  const auth = await requireAuth(request);

  if (requiredRole === "superuser" && auth.role !== "superuser") {
    throw apiError("FORBIDDEN", "Superuser access required", 403);
  }

  if (
    requiredRole === "admin" &&
    auth.role !== "admin" &&
    auth.role !== "superuser"
  ) {
    throw apiError("FORBIDDEN", "Admin access required", 403);
  }

  if (requiredRole === "driver" && auth.role !== "driver") {
    throw apiError("FORBIDDEN", "Driver access required", 403);
  }

  return auth;
}
