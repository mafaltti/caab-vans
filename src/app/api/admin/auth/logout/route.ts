import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api/errors";

export async function POST() {
  try {
    const supabase = await createSessionClient();
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to sign out", 500);
  }
}
