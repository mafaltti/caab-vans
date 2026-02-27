import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";

const updateVanSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long").optional(),
  regenerateToken: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ vanId: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const { vanId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = updateVanSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.regenerateToken) updates.ingestion_token = crypto.randomUUID();

  if (Object.keys(updates).length === 0) {
    return apiError("VALIDATION_ERROR", "No fields to update", 400);
  }

  const { data, error } = await supabase
    .from("vans")
    .update(updates)
    .eq("id", vanId)
    .select()
    .single();

  if (error || !data) {
    return apiError("NOT_FOUND", "Van not found", 404);
  }

  return NextResponse.json({
    van: {
      id: data.id,
      name: data.name,
      ingestionToken: data.ingestion_token,
      locationUrl: data.location_url,
      locationUpdatedAt: data.location_updated_at,
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

  const { vanId } = await params;
  const supabase = createServiceClient();

  // Check if van is assigned to a route
  const { data: routes } = await supabase
    .from("routes")
    .select("id")
    .eq("van_id", vanId)
    .limit(1);

  if (routes && routes.length > 0) {
    return apiError("CONFLICT", "Van is assigned to a route. Remove the route first.", 409);
  }

  const { data, error } = await supabase
    .from("vans")
    .delete()
    .eq("id", vanId)
    .select("id");

  if (error || !data || data.length === 0) {
    return apiError("NOT_FOUND", "Van not found", 404);
  }

  return new NextResponse(null, { status: 204 });
}
