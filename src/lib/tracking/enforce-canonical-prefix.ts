export interface SortedStop {
  schedule_entry_id: string;
  status: "pending" | "passed" | "skipped";
}

export interface CanonicalPrefixResult {
  contiguousPassedIds: Set<string>;
  healIds: string[];
  lastPassedStopId: string | null;
  nextStopId: string | null;
}

/**
 * Walk sorted stops from route start, build a contiguous passed prefix,
 * and identify non-contiguous passed rows that need healing.
 */
export function enforceCanonicalPrefix(
  sortedStops: SortedStop[],
): CanonicalPrefixResult {
  const contiguousPassedIds = new Set<string>();

  // Build contiguous resolved prefix (passed or skipped)
  for (const stop of sortedStops) {
    if (stop.status === "passed" || stop.status === "skipped") {
      contiguousPassedIds.add(stop.schedule_entry_id);
    } else {
      break;
    }
  }

  // Find non-contiguous passed rows that need healing
  const healIds: string[] = [];
  for (const stop of sortedStops) {
    if (
      stop.status === "passed" &&
      !contiguousPassedIds.has(stop.schedule_entry_id)
    ) {
      healIds.push(stop.schedule_entry_id);
    }
  }

  // Derive pointers
  const lastPassedStopId =
    contiguousPassedIds.size > 0
      ? [...contiguousPassedIds].pop()!
      : null;

  let nextStopId: string | null = null;
  for (const stop of sortedStops) {
    if (!contiguousPassedIds.has(stop.schedule_entry_id)) {
      nextStopId = stop.schedule_entry_id;
      break;
    }
  }

  return { contiguousPassedIds, healIds, lastPassedStopId, nextStopId };
}
