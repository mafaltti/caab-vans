import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { createAnnouncementSchema } from "@/lib/validators/announcement";

export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const supabase = createServiceClient();

  // Admin view: include all announcements (even expired)
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return apiError("NOT_FOUND", "Failed to fetch announcements", 500);
  }

  const announcements = (data ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    isPinned: a.is_pinned,
    isUrgent: a.is_urgent,
    expiresAt: a.expires_at,
    createdAt: a.created_at,
  }));

  return NextResponse.json({ announcements });
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = createAnnouncementSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  // Validate expires_at is in the future if set
  if (parsed.data.expiresAt) {
    const expiresDate = new Date(parsed.data.expiresAt);
    if (expiresDate <= new Date()) {
      return apiError("VALIDATION_ERROR", "Data de expiração deve ser no futuro", 400);
    }
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      title: parsed.data.title,
      body: parsed.data.body,
      is_pinned: parsed.data.isPinned ?? false,
      is_urgent: parsed.data.isUrgent ?? false,
      expires_at: parsed.data.expiresAt ?? null,
    })
    .select()
    .single();

  if (error) {
    return apiError("VALIDATION_ERROR", "Failed to create announcement", 400);
  }

  return NextResponse.json(
    {
      announcement: {
        id: data.id,
        title: data.title,
        body: data.body,
        isPinned: data.is_pinned,
        isUrgent: data.is_urgent,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
      },
    },
    { status: 201 },
  );
}
