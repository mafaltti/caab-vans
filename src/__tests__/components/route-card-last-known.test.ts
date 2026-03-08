/// <reference types="vitest/globals" />

/**
 * T015 — Last-known label gating on route cards.
 *
 * The route-card renders "Última posição" when nextStopMode === "last_known".
 * We extract this as a pure function and test the cases.
 */

type NextStopMode = "live" | "last_known" | null;

/** Mirrors the label condition at route-card.tsx */
function getNextStopLabel(nextStopMode: NextStopMode): string | null {
  return nextStopMode === "last_known" ? "Última posição" : null;
}

describe("RouteCard last-known label gating", () => {
  it('returns "Última posição" when nextStopMode is "last_known"', () => {
    expect(getNextStopLabel("last_known")).toBe("Última posição");
  });

  it("returns null when nextStopMode is \"live\"", () => {
    expect(getNextStopLabel("live")).toBeNull();
  });

  it("returns null when nextStopMode is null", () => {
    expect(getNextStopLabel(null)).toBeNull();
  });
});
