import { useEffect, useRef, useCallback } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { fetchWithDriverAuth } from "@/lib/driver-api";
import { isShiftActive, clearShiftState, setShiftActive } from "@/storage/shift-state";
import { stopTracking } from "@/location/tracking";
import type { RoutesListResponse } from "@/types/driver";

export function useShiftReconciliation() {
  const router = useRouter();
  const reconciling = useRef(false);

  const reconcile = useCallback(async () => {
    if (reconciling.current) return;
    reconciling.current = true;

    try {
      const localActive = await isShiftActive();

      let response: Response;
      try {
        response = await fetchWithDriverAuth("/api/driver/routes");
      } catch {
        // Network failure — skip reconciliation
        return;
      }

      if (!response.ok) return;

      const data = (await response.json()) as RoutesListResponse;
      const serverInProgress = data.routes.find(
        (r) => r.runStatus === "in_progress" && r.activeShift,
      );

      if (localActive && !serverInProgress) {
        // Server has no active shift but local says active — clear
        try {
          await stopTracking();
        } catch {
          // Non-fatal
        }
        await clearShiftState();
      } else if (!localActive && serverInProgress && serverInProgress.activeShift) {
        // Server has active shift but local is idle — restore
        await setShiftActive(
          serverInProgress.id,
          serverInProgress.activeShift.id,
        );
        router.push(`/(driver)/routes/${serverInProgress.id}`);
      }
    } catch {
      // Reconciliation is best-effort
    } finally {
      reconciling.current = false;
    }
  }, [router]);

  useEffect(() => {
    reconcile();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        reconcile();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [reconcile]);
}
