import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { updateUserSchema } from "@/lib/validators/user";

type RouteParams = { params: Promise<{ userId: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireRole("superuser");
  } catch (e) {
    return e as NextResponse;
  }

  const { userId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { role, password, isActive } = parsed.data;

  if (role === undefined && password === undefined && isActive === undefined) {
    return apiError("VALIDATION_ERROR", "No fields to update", 400);
  }

  const supabase = createServiceClient();

  // Fetch current user to check existence and current metadata
  const { data: existing, error: fetchError } =
    await supabase.auth.admin.getUserById(userId);

  if (fetchError || !existing?.user) {
    return apiError("NOT_FOUND", "Usuário não encontrado", 404);
  }

  // FR-017: Prevent deactivation of the last active superuser
  if (isActive === false) {
    const currentRole = existing.user.app_metadata?.role as string;
    if (currentRole === "superuser") {
      const {
        data: { users: allUsers },
      } = await supabase.auth.admin.listUsers();
      const activeSuperusers = (allUsers ?? []).filter(
        (u) =>
          u.app_metadata?.role === "superuser" &&
          u.app_metadata?.is_active !== false,
      );
      if (activeSuperusers.length <= 1) {
        return apiError(
          "CONFLICT",
          "Não é possível desativar o último superusuário ativo",
          409,
        );
      }
    }
  }

  // Also prevent role change from superuser if it would leave zero active superusers
  if (role !== undefined && role !== "superuser") {
    const currentRole = existing.user.app_metadata?.role as string;
    const currentlyActive = existing.user.app_metadata?.is_active !== false;
    if (currentRole === "superuser" && currentlyActive) {
      const {
        data: { users: allUsers },
      } = await supabase.auth.admin.listUsers();
      const activeSuperusers = (allUsers ?? []).filter(
        (u) =>
          u.app_metadata?.role === "superuser" &&
          u.app_metadata?.is_active !== false,
      );
      if (activeSuperusers.length <= 1) {
        return apiError(
          "CONFLICT",
          "Não é possível remover o papel de superusuário do último superusuário ativo",
          409,
        );
      }
    }
  }

  const updates: Record<string, unknown> = {};
  const metadataUpdates: Record<string, unknown> = {
    ...existing.user.app_metadata,
  };

  if (password !== undefined) {
    updates.password = password;
  }

  if (role !== undefined) {
    metadataUpdates.role = role;
  }

  if (isActive !== undefined) {
    metadataUpdates.is_active = isActive;
  }

  updates.app_metadata = metadataUpdates;

  const { data: updated, error: updateError } =
    await supabase.auth.admin.updateUserById(userId, updates);

  if (updateError) {
    return apiError("VALIDATION_ERROR", updateError.message, 400);
  }

  return NextResponse.json({
    user: {
      id: updated.user.id,
      email: updated.user.email ?? "",
      role: updated.user.app_metadata?.role ?? "admin",
      isActive: updated.user.app_metadata?.is_active !== false,
      createdAt: updated.user.created_at,
    },
  });
}
