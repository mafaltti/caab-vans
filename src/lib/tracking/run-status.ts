import type { RunStatus } from "@/types";

export function deriveRunStatus(
  shifts: { ended_at: string | null }[],
  isPastScheduleWindow: boolean,
): RunStatus {
  if (shifts.length === 0) return "waiting";
  const hasActive = shifts.some((s) => s.ended_at === null);
  if (hasActive) return "in_progress";
  if (isPastScheduleWindow) return "completed";
  return "idle";
}
