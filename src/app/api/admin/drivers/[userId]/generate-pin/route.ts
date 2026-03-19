import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { createHash, randomInt } from "crypto";
import { requireRole } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ userId: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireRole("admin");
  } catch (e) {
    return e as NextResponse;
  }

  const { userId } = await params;

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

  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const pin = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const pin_hash = await bcrypt.hash(pin, 10);
    const pin_digest = createHash("sha256").update(pin).digest("hex");

    const { error: dbError } = await supabase.from("driver_pins").upsert(
      {
        user_id: userId,
        pin_hash,
        pin_digest,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (!dbError) {
      return NextResponse.json({ pin, message: "PIN gerado com sucesso" });
    }

    // Retry on unique constraint violation (pin_digest collision)
    if (dbError.code !== "23505") {
      return apiError("INTERNAL_ERROR", "Failed to generate PIN", 500);
    }
  }

  return apiError(
    "CONFLICT",
    "Não foi possível gerar um PIN único. Tente novamente.",
    409,
  );
}
