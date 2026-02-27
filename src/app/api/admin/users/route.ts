import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { createUserSchema } from "@/lib/validators/user";

export async function GET() {
  try {
    await requireRole("superuser");
  } catch (e) {
    return e as NextResponse;
  }

  const supabase = createServiceClient();
  const {
    data: { users },
    error,
  } = await supabase.auth.admin.listUsers();

  if (error) {
    return apiError("NOT_FOUND", "Failed to fetch users", 500);
  }

  const mapped = users.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    role: (u.app_metadata?.role as string) ?? "admin",
    isActive: u.app_metadata?.is_active !== false,
    createdAt: u.created_at,
  }));

  return NextResponse.json({ users: mapped });
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("superuser");
  } catch (e) {
    return e as NextResponse;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: {
      role: parsed.data.role,
      is_active: true,
    },
  });

  if (error) {
    if (error.message?.includes("already been registered")) {
      return apiError("CONFLICT", "E-mail já cadastrado", 409);
    }
    return apiError("VALIDATION_ERROR", error.message, 400);
  }

  return NextResponse.json(
    {
      user: {
        id: data.user.id,
        email: data.user.email ?? "",
        role: data.user.app_metadata?.role ?? parsed.data.role,
        isActive: true,
        createdAt: data.user.created_at,
      },
    },
    { status: 201 },
  );
}
