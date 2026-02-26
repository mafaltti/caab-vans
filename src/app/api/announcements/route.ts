import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServiceClient();

  const { data: announcements, error } = await supabase
    .from("announcements")
    .select("id, title, body, is_pinned, is_urgent, expires_at, created_at")
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch announcements" } },
      { status: 500 },
    );
  }

  const result = (announcements ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    isPinned: a.is_pinned,
    isUrgent: a.is_urgent,
    expiresAt: a.expires_at,
    createdAt: a.created_at,
  }));

  return NextResponse.json({ announcements: result });
}
