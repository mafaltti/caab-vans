/// <reference types="vitest/globals" />
import { parsePositiveInt } from "@/lib/tracking/osrm";

describe("parsePositiveInt", () => {
  it("parses a valid integer string", () => {
    expect(parsePositiveInt("500", 300)).toBe(500);
  });

  it("returns fallback when value is undefined", () => {
    expect(parsePositiveInt(undefined, 300)).toBe(300);
  });

  it("returns fallback for non-numeric string", () => {
    expect(parsePositiveInt("abc", 300)).toBe(300);
  });

  it("returns fallback for zero", () => {
    expect(parsePositiveInt("0", 300)).toBe(300);
  });

  it("returns fallback for negative number", () => {
    expect(parsePositiveInt("-100", 300)).toBe(300);
  });

  it("returns fallback for value with trailing non-numeric characters", () => {
    expect(parsePositiveInt("200abc", 300)).toBe(300);
  });

  it("returns fallback for empty string", () => {
    expect(parsePositiveInt("", 300)).toBe(300);
  });

  it("returns fallback for value exceeding setTimeout max", () => {
    expect(parsePositiveInt("2147483648", 300)).toBe(300);
  });
});
