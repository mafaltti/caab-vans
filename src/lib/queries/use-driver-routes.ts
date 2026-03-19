"use client";

import { useQuery } from "@tanstack/react-query";
import type { DriverRoute } from "@/types";
import { fetchWithDriverAuth } from "@/lib/api/fetch-with-driver-auth";

type DriverRoutesResponse = {
  routes: DriverRoute[];
  userId: string;
};

async function fetchDriverRoutes(
  signal?: AbortSignal,
): Promise<DriverRoutesResponse> {
  const res = await fetchWithDriverAuth("/api/driver/routes", { signal });
  if (!res.ok) {
    throw new Error("Failed to fetch driver routes");
  }
  return res.json();
}

export function useDriverRoutes() {
  return useQuery({
    queryKey: ["driver-routes"],
    queryFn: ({ signal }) => fetchDriverRoutes(signal),
    refetchInterval: 30_000,
  });
}
