import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { updateAnnouncementSchema } from "@/lib/validators/announcement";

type RouteParams = { params: Promise<{ announcementId: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const { announcementId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = updateAnnouncementSchema.safeParse(body);
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

  const updates: Record<string, unknown> = {
    title: parsed.data.title,
    body: parsed.data.body,
  };
  if (parsed.data.isPinned !== undefined) updates.is_pinned = parsed.data.isPinned;
  if (parsed.data.isUrgent !== undefined) updates.is_urgent = parsed.data.isUrgent;
  if (parsed.data.expiresAt !== undefined) updates.expires_at = parsed.data.expiresAt;

  const { data, error } = await supabase
    .from("announcements")
    .update(updates)
    .eq("id", announcementId)
    .select()
    .single();

  if (error || !data) {
    return apiError("NOT_FOUND", "Announcement not found", 404);
  }

  return NextResponse.json({
    announcement: {
      id: data.id,
      title: data.title,
      body: data.body,
      isPinned: data.is_pinned,
      isUrgent: data.is_urgent,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const { announcementId } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", announcementId)
    .select("id");

  if (error || !data || data.length === 0) {
    return apiError("NOT_FOUND", "Announcement not found", 404);
  }

  return new NextResponse(null, { status: 204 });
}
