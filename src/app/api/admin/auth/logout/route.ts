import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api/errors";

export async function POST() {
  try {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      return apiError("INTERNAL_ERROR", "Failed to sign out", 500);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return apiError("INTERNAL_ERROR", "Failed to sign out", 500);
  }
}
