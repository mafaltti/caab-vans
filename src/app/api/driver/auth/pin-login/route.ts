import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod/v4";
import bcrypt from "bcryptjs";
import { createHmac } from "crypto";
import { apiError, validationError } from "@/lib/api/errors";
import { createRateLimiter } from "@/lib/api/rate-limit";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";

const pinLoginSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
});

const pinLoginLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 5,
});

export async function POST(request: NextRequest) {
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const limit = pinLoginLimiter(clientIp);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many login attempts" } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = pinLoginSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { pin } = parsed.data;

  const digest = createHmac("sha256", process.env.PIN_PEPPER!).update(pin).digest("hex");

  const supabase = createServiceClient();

  // Look up PIN by digest
  const { data: row, error: lookupError } = await supabase
    .from("driver_pins")
    .select("user_id, pin_hash")
    .eq("pin_digest", digest)
    .single();

  if (lookupError || !row) {
    return apiError("UNAUTHORIZED", "PIN inválido", 401);
  }

  // Verify bcrypt hash as confirmation
  const hashMatch = await bcrypt.compare(pin, row.pin_hash);
  if (!hashMatch) {
    return apiError("UNAUTHORIZED", "PIN inválido", 401);
  }

  // Fetch user and verify role + active status
  const { data: userData, error: userError } =
    await supabase.auth.admin.getUserById(row.user_id);

  if (userError || !userData?.user) {
    return apiError("UNAUTHORIZED", "PIN inválido", 401);
  }

  const user = userData.user;
  const role = user.app_metadata?.role as string | undefined;
  const isActive = user.app_metadata?.is_active as boolean | undefined;

  if (role !== "driver" || isActive === false) {
    return apiError("UNAUTHORIZED", "PIN inválido", 401);
  }

  // Create session via magic link token
  const { data: linkData, error: linkError } =
    await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: user.email!,
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    return apiError("INTERNAL_ERROR", "PIN inválido", 401);
  }

  const hashed_token = linkData.properties.hashed_token;

  // Use session client with cookie handling to verify the OTP
  const sessionClient = await createSessionClient();
  const { error: otpError } = await sessionClient.auth.verifyOtp({
    token_hash: hashed_token,
    type: "magiclink",
  });

  if (otpError) {
    return apiError("INTERNAL_ERROR", "PIN inválido", 401);
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role,
    },
  });
}
