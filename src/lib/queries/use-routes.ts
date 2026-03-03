"use client";

import { useQuery } from "@tanstack/react-query";
import type { RouteWithStatus } from "@/types";

type RoutesResponse = {
  routes: RouteWithStatus[];
  serverTime: string;
};

async function fetchRoutes(signal?: AbortSignal): Promise<RoutesResponse> {
  const res = await fetch("/api/routes", { signal });
  if (!res.ok) {
    throw new Error("Failed to fetch routes");
  }
  return res.json();
}

export function useRoutes() {
  return useQuery({
    queryKey: ["routes"],
    queryFn: ({ signal }) => fetchRoutes(signal),
    refetchInterval: 5_000,
  });
}
