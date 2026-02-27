import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createSessionClient } from "@/lib/supabase/server";
import { apiError, validationError } from "@/lib/api/errors";
import { createRateLimiter } from "@/lib/api/rate-limit";

const loginSchema = z.object({
  email: z.email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { email, password } = parsed.data;

  const limit = loginLimiter(email);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many login attempts" } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return apiError("UNAUTHORIZED", "Invalid credentials", 401);
  }

  const role = data.user.app_metadata?.role as string | undefined;
  const isActive = data.user.app_metadata?.is_active as boolean | undefined;

  if (!role || isActive === false) {
    await supabase.auth.signOut();
    return apiError("UNAUTHORIZED", "Account is not active", 401);
  }

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      role,
    },
  });
}
