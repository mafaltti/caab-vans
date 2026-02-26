import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { createRouteSchema } from "@/lib/validators/route";

export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("routes")
    .select("id, name, van_id, vans(id, name)")
    .order("name");

  if (error) {
    return apiError("NOT_FOUND", "Failed to fetch routes", 500);
  }

  const routes = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    vanId: r.van_id,
    van: r.vans as unknown as { id: string; name: string } | null,
  }));

  return NextResponse.json({ routes });
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

  const parsed = createRouteSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = createServiceClient();

  // Check van uniqueness — one van per route
  const { data: existing } = await supabase
    .from("routes")
    .select("id")
    .eq("van_id", parsed.data.vanId)
    .limit(1);

  if (existing && existing.length > 0) {
    return apiError("CONFLICT", "Esta van já está atribuída a outra rota", 409);
  }

  const { data, error } = await supabase
    .from("routes")
    .insert({
      name: parsed.data.name,
      van_id: parsed.data.vanId,
    })
    .select()
    .single();

  if (error) {
    return apiError("VALIDATION_ERROR", "Failed to create route", 400);
  }

  return NextResponse.json(
    {
      route: {
        id: data.id,
        name: data.name,
        vanId: data.van_id,
      },
    },
    { status: 201 },
  );
}
