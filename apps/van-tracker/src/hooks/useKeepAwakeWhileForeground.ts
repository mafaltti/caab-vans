import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from "expo-keep-awake";

const TAG = "tracker-foreground";

export function useKeepAwakeWhileForeground() {
  const isActive = useRef(false);

  useEffect(() => {
    if (AppState.currentState === "active") {
      activateKeepAwakeAsync(TAG);
      isActive.current = true;
    }

    const handleChange = (nextState: AppStateStatus) => {
      if (nextState === "active" && !isActive.current) {
        activateKeepAwakeAsync(TAG);
        isActive.current = true;
      } else if (nextState !== "active" && isActive.current) {
        deactivateKeepAwake(TAG);
        isActive.current = false;
      }
    };

    const subscription = AppState.addEventListener("change", handleChange);

    return () => {
      subscription.remove();
      if (isActive.current) {
        deactivateKeepAwake(TAG);
        isActive.current = false;
      }
    };
  }, []);
}
