import { describe, expect, it } from "vitest";
import { generateInitialMonsters, generateRewardOffer } from "../gacha";
import { mulberry32 } from "../rng";

describe("generateRewardOffer", () => {
  it("always returns 3 entries within Lv1-3", () => {
    const rng = mulberry32(42);
    const offer = generateRewardOffer(rng);
    expect(offer).toHaveLength(3);
    for (const entry of offer) {
      expect(entry.level).toBeGreaterThanOrEqual(1);
      expect(entry.level).toBeLessThanOrEqual(3);
    }
  });

  it("skews toward lower levels (higher Lv = lower probability)", () => {
    const rng = mulberry32(1);
    const counts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
    for (let i = 0; i < 3000; i++) {
      const [entry] = generateRewardOffer(rng);
      counts[entry.level] += 1;
    }
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBeGreaterThan(counts[3]);
  });
});

describe("generateInitialMonsters", () => {
  it("always returns 3 Lv1 monsters", () => {
    const rng = mulberry32(7);
    const initial = generateInitialMonsters(rng);
    expect(initial).toHaveLength(3);
    expect(initial.every((m) => m.level === 1)).toBe(true);
  });
});
