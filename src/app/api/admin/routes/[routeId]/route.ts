import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { updateRouteSchema } from "@/lib/validators/route";

type RouteParams = { params: Promise<{ routeId: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const { routeId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = updateRouteSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = createServiceClient();

  // Check van uniqueness — skip if same route already uses this van
  const { data: existing } = await supabase
    .from("routes")
    .select("id")
    .eq("van_id", parsed.data.vanId)
    .neq("id", routeId)
    .limit(1);

  if (existing && existing.length > 0) {
    return apiError("CONFLICT", "Esta van já está atribuída a outra rota", 409);
  }

  const { data, error } = await supabase
    .from("routes")
    .update({
      name: parsed.data.name,
      van_id: parsed.data.vanId,
    })
    .eq("id", routeId)
    .select()
    .single();

  if (error || !data) {
    return apiError("NOT_FOUND", "Route not found", 404);
  }

  return NextResponse.json({
    route: {
      id: data.id,
      name: data.name,
      vanId: data.van_id,
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const { routeId } = await params;
  const supabase = createServiceClient();

  // Delete schedule entries first (cascade)
  await supabase.from("schedule_entries").delete().eq("route_id", routeId);

  const { error } = await supabase.from("routes").delete().eq("id", routeId);

  if (error) {
    return apiError("NOT_FOUND", "Route not found", 404);
  }

  return new NextResponse(null, { status: 204 });
}
