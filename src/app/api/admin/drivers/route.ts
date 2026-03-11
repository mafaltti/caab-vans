import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireRole("admin");
  } catch (e) {
    return e as NextResponse;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    return apiError("INTERNAL_ERROR", "Failed to fetch users", 500);
  }

  const drivers = (data?.users ?? [])
    .filter(
      (u) =>
        u.app_metadata?.role === "driver" &&
        u.app_metadata?.is_active !== false,
    )
    .map((u) => ({ id: u.id, email: u.email! }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return NextResponse.json({ drivers });
}
