import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAuth } from "@/lib/api/auth";
import { apiError, validationError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";

const createVanSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
});

export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    return e as NextResponse;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("vans")
    .select("id, name, ingestion_token, location_url, location_updated_at, created_at")
    .order("name");

  if (error) {
    return apiError("NOT_FOUND", "Failed to fetch vans", 500);
  }

  const vanIds = (data ?? []).map((v) => v.id);
  const { data: assignments } = vanIds.length > 0
    ? await supabase.from("van_drivers").select("van_id, driver_id").in("van_id", vanIds)
    : { data: [] };

  const driversByVan = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const list = driversByVan.get(a.van_id) ?? [];
    list.push(a.driver_id);
    driversByVan.set(a.van_id, list);
  }

  const vans = (data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    driverIds: driversByVan.get(v.id) ?? [],
    ingestionToken: v.ingestion_token,
    locationUrl: v.location_url,
    locationUpdatedAt: v.location_updated_at,
    createdAt: v.created_at,
  }));

  return NextResponse.json({ vans });
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

  const parsed = createVanSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("vans")
    .insert({
      name: parsed.data.name,
      ingestion_token: crypto.randomUUID(),
    })
    .select()
    .single();

  if (error) {
    return apiError("CONFLICT", "Failed to create van", 409);
  }

  return NextResponse.json(
    {
      van: {
        id: data.id,
        name: data.name,
        ingestionToken: data.ingestion_token,
        locationUrl: data.location_url,
        locationUpdatedAt: data.location_updated_at,
        createdAt: data.created_at,
      },
    },
    { status: 201 },
  );
}
