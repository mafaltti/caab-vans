"use client";

import { useQuery } from "@tanstack/react-query";
import type { DriverRoute } from "@/types";
import { fetchWithDriverAuth } from "@/lib/api/fetch-with-driver-auth";

type DriverRoutesResponse = {
  routes: DriverRoute[];
  userId: string;
};

async function fetchDriverRoutes(
  vanId?: string | null,
  signal?: AbortSignal,
): Promise<DriverRoutesResponse> {
  const url = vanId
    ? `/api/driver/routes?vanId=${vanId}`
    : "/api/driver/routes";
  const res = await fetchWithDriverAuth(url, { signal });
  if (!res.ok) {
    throw new Error("Failed to fetch driver routes");
  }
  return res.json();
}

export function useDriverRoutes(vanId?: string | null) {
  return useQuery({
    queryKey: ["driver-routes", vanId ?? null],
    queryFn: ({ signal }) => fetchDriverRoutes(vanId, signal),
    refetchInterval: 30_000,
  });
}
