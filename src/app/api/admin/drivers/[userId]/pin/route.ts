import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod/v4";
import bcrypt from "bcryptjs";
import { createHmac } from "crypto";
import { requireRole } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";

const pinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
});

type RouteParams = { params: Promise<{ userId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireRole("admin");
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

  const parsed = pinSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { pin } = parsed.data;

  const supabase = createServiceClient();

  // Verify target user exists and is a driver
  const { data: targetUser, error: userError } =
    await supabase.auth.admin.getUserById(userId);

  if (userError || !targetUser?.user) {
    return apiError("NOT_FOUND", "Usuário não encontrado", 404);
  }

  if (targetUser.user.app_metadata?.role !== "driver") {
    return apiError("VALIDATION_ERROR", "Usuário não é um motorista", 400);
  }

  const pin_hash = await bcrypt.hash(pin, 10);
  const pin_digest = createHmac("sha256", process.env.PIN_PEPPER!).update(pin).digest("hex");

  const { error: dbError } = await supabase.from("driver_pins").upsert(
    {
      user_id: userId,
      pin_hash,
      pin_digest,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (dbError) {
    if (dbError.code === "23505") {
      return apiError("CONFLICT", "Este PIN já está em uso", 409);
    }
    return apiError("INTERNAL_ERROR", "Failed to set PIN", 500);
  }

  return NextResponse.json({ message: "PIN definido com sucesso" });
}
