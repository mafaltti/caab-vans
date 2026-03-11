/// <reference types="vitest/globals" />

import { persistCanonicalProgress } from "@/lib/tracking/persist-canonical-progress";

// --- Mock Supabase builder ---

type StopUpdate = {
  payload: Record<string, unknown>;
  filters: Record<string, unknown>;
};

type PointerUpdate = {
  payload: Record<string, unknown>;
  runId: string;
};

function createMockSupabase(opts: {
  stops?: Array<{
    schedule_entry_id: string;
    status: "pending" | "passed";
    schedule_entries: { stop_sequence: number };
  }>;
  fetchError?: { message: string } | null;
}) {
  const { stops = [], fetchError = null } = opts;

  const healUpdates: StopUpdate[] = [];
  const pointerUpdates: PointerUpdate[] = [];

  function chain(result: unknown, error: unknown = null) {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return undefined;
          if (prop === "single" || prop === "maybeSingle")
            return () => ({ data: result, error });
          return () => proxy;
        },
      },
    );
    return proxy;
  }

  const supabase = {
    from: (table: string) => {
      if (table === "route_run_stops") {
        return {
          select: () => {
            // select chain for fetch
            const selectChain: Record<string, unknown> = {};
            selectChain.eq = () => {
              // eq("run_id", runId) -> order chain
              return {
                order: () => {
                  // Return the data (thenable)
                  return {
                    then: (
                      resolve: (v: unknown) => void,
                      reject: (e: unknown) => void,
                    ) =>
                      Promise.resolve({
                        data: fetchError ? null : stops,
                        error: fetchError,
                      }).then(resolve, reject),
                  };
                },
              };
            };
            return selectChain;
          },
          update: (payload: Record<string, unknown>) => {
            return {
              eq: (_col: string, runId: string) => ({
                in: (_col2: string, ids: string[]) => {
                  healUpdates.push({
                    payload,
                    filters: { run_id: runId, schedule_entry_ids: ids },
                  });
                  return Promise.resolve({ error: null });
                },
              }),
            };
          },
        };
      }
      if (table === "route_runs") {
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, runId: string) => {
              pointerUpdates.push({ payload, runId });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      return chain(null);
    },
  };

  return { supabase: supabase as never, healUpdates, pointerUpdates };
}

describe("persistCanonicalProgress", () => {
  it("returns first stop as next when all are pending", async () => {
    const { supabase, pointerUpdates } = createMockSupabase({
      stops: [
        { schedule_entry_id: "a", status: "pending", schedule_entries: { stop_sequence: 1 } },
        { schedule_entry_id: "b", status: "pending", schedule_entries: { stop_sequence: 2 } },
        { schedule_entry_id: "c", status: "pending", schedule_entries: { stop_sequence: 3 } },
      ],
    });

    const result = await persistCanonicalProgress(supabase, "run-1");

    expect(result.nextStopId).toBe("a");
    expect(result.lastPassedStopId).toBeNull();
    expect(result.healIds).toHaveLength(0);
    expect(pointerUpdates).toHaveLength(1);
    expect(pointerUpdates[0].payload).toMatchObject({
      last_passed_stop_id: null,
      next_stop_id: "a",
    });
  });

  it("computes correct pointers for contiguous passed prefix", async () => {
    const { supabase, pointerUpdates } = createMockSupabase({
      stops: [
        { schedule_entry_id: "a", status: "passed", schedule_entries: { stop_sequence: 1 } },
        { schedule_entry_id: "b", status: "passed", schedule_entries: { stop_sequence: 2 } },
        { schedule_entry_id: "c", status: "pending", schedule_entries: { stop_sequence: 3 } },
      ],
    });

    const result = await persistCanonicalProgress(supabase, "run-1");

    expect(result.lastPassedStopId).toBe("b");
    expect(result.nextStopId).toBe("c");
    expect(result.contiguousPassedIds).toEqual(new Set(["a", "b"]));
    expect(result.healIds).toHaveLength(0);
    expect(pointerUpdates[0].payload).toMatchObject({
      last_passed_stop_id: "b",
      next_stop_id: "c",
    });
  });

  it("heals non-contiguous passed rows to pending", async () => {
    const { supabase, healUpdates, pointerUpdates } = createMockSupabase({
      stops: [
        { schedule_entry_id: "a", status: "passed", schedule_entries: { stop_sequence: 1 } },
        { schedule_entry_id: "b", status: "pending", schedule_entries: { stop_sequence: 2 } },
        { schedule_entry_id: "c", status: "passed", schedule_entries: { stop_sequence: 3 } },
      ],
    });

    const result = await persistCanonicalProgress(supabase, "run-1");

    expect(result.contiguousPassedIds).toEqual(new Set(["a"]));
    expect(result.healIds).toEqual(["c"]);
    expect(result.lastPassedStopId).toBe("a");
    expect(result.nextStopId).toBe("b");

    expect(healUpdates).toHaveLength(1);
    expect(healUpdates[0].payload).toMatchObject({
      status: "pending",
      passed_at: null,
      pass_source: null,
      pass_confidence: null,
    });
    expect(healUpdates[0].filters.schedule_entry_ids).toEqual(["c"]);

    expect(pointerUpdates[0].payload).toMatchObject({
      last_passed_stop_id: "a",
      next_stop_id: "b",
    });
  });

  it("handles empty run safely", async () => {
    const { supabase, pointerUpdates, healUpdates } = createMockSupabase({
      stops: [],
    });

    const result = await persistCanonicalProgress(supabase, "run-1");

    expect(result.nextStopId).toBeNull();
    expect(result.lastPassedStopId).toBeNull();
    expect(result.healIds).toHaveLength(0);
    expect(pointerUpdates).toHaveLength(0);
    expect(healUpdates).toHaveLength(0);
  });

  it("is idempotent when called twice with same state", async () => {
    const stops = [
      { schedule_entry_id: "a", status: "passed" as const, schedule_entries: { stop_sequence: 1 } },
      { schedule_entry_id: "b", status: "pending" as const, schedule_entries: { stop_sequence: 2 } },
    ];

    const { supabase: sb1, pointerUpdates: pu1 } = createMockSupabase({ stops });
    const result1 = await persistCanonicalProgress(sb1, "run-1");

    const { supabase: sb2, pointerUpdates: pu2 } = createMockSupabase({ stops });
    const result2 = await persistCanonicalProgress(sb2, "run-1");

    expect(result1.nextStopId).toBe(result2.nextStopId);
    expect(result1.lastPassedStopId).toBe(result2.lastPassedStopId);
    expect(pu1[0].payload.next_stop_id).toBe(pu2[0].payload.next_stop_id);
    expect(pu1[0].payload.last_passed_stop_id).toBe(pu2[0].payload.last_passed_stop_id);
  });

  it("returns empty result on fetch error", async () => {
    const { supabase } = createMockSupabase({
      fetchError: { message: "db error" },
    });

    const result = await persistCanonicalProgress(supabase, "run-1");

    expect(result.nextStopId).toBeNull();
    expect(result.lastPassedStopId).toBeNull();
    expect(result.healIds).toHaveLength(0);
  });

  it("handles all stops passed (next is null)", async () => {
    const { supabase, pointerUpdates } = createMockSupabase({
      stops: [
        { schedule_entry_id: "a", status: "passed", schedule_entries: { stop_sequence: 1 } },
        { schedule_entry_id: "b", status: "passed", schedule_entries: { stop_sequence: 2 } },
      ],
    });

    const result = await persistCanonicalProgress(supabase, "run-1");

    expect(result.lastPassedStopId).toBe("b");
    expect(result.nextStopId).toBeNull();
    expect(pointerUpdates[0].payload).toMatchObject({
      last_passed_stop_id: "b",
      next_stop_id: null,
    });
  });
});
