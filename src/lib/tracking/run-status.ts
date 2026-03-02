import type { RunStatus } from "@/types";

export function deriveRunStatus(
  startedAt: string | null,
  endedAt: string | null,
): RunStatus {
  if (endedAt) return "completed";
  if (startedAt) return "in_progress";
  return "waiting";
}
