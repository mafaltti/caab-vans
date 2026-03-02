"use client";

import { useQuery } from "@tanstack/react-query";
import type { RouteDetail } from "@/types";

type RouteDetailResponse = {
  route: RouteDetail;
  serverTime: string;
};

async function fetchRouteDetail(
  routeId: string,
): Promise<RouteDetailResponse> {
  const res = await fetch(`/api/routes/${routeId}`);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Route not found");
    }
    throw new Error("Failed to fetch route detail");
  }
  return res.json();
}

export function useRouteDetail(routeId: string) {
  return useQuery({
    queryKey: ["route", routeId],
    queryFn: () => fetchRouteDetail(routeId),
    refetchInterval: 15_000,
    enabled: !!routeId,
  });
}
