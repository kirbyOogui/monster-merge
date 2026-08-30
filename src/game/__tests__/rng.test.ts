import { describe, expect, it } from "vitest";
import { mulberry32, pickWeighted } from "../rng";

describe("mulberry32", () => {
  it("is deterministic for a given seed and in [0, 1)", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 20; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("diverges for different seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("pickWeighted", () => {
  it("returns the only entry regardless of the roll", () => {
    expect(pickWeighted([["x", 5]], mulberry32(1))).toBe("x");
    expect(pickWeighted([["x", 5]], mulberry32(999))).toBe("x");
  });

  it("never returns a zero-weight entry", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      expect(pickWeighted([["never", 0], ["always", 1]], rng)).toBe("always");
    }
  });

  it("picks roughly in proportion to the weights", () => {
    const rng = mulberry32(42);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const N = 6000;
    for (let i = 0; i < N; i++) {
      counts[pickWeighted([["a", 70], ["b", 20], ["c", 10]], rng)] += 1;
    }
    expect(counts.a).toBeGreaterThan(counts.b);
    expect(counts.b).toBeGreaterThan(counts.c);
    // a ~ 70% ± 5pts
    expect(Math.abs(counts.a / N - 0.7)).toBeLessThan(0.05);
  });
});
