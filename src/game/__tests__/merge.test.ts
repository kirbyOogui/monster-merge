import { describe, expect, it } from "vitest";
import { canMerge, maxLevelForSpecies, tryMerge } from "../merge";
import type { PlacedMonster } from "../types";

function monster(overrides: Partial<PlacedMonster> = {}): PlacedMonster {
  return {
    instanceId: "a",
    speciesId: "sparkit",
    shape: "1x1",
    level: 1,
    anchor: { row: 0, col: 0 },
    ...overrides,
  };
}

describe("canMerge", () => {
  it("merges same species + same level", () => {
    const a = monster({ instanceId: "a", level: 2 });
    const b = monster({ instanceId: "b", level: 2 });
    expect(canMerge(a, b)).toBe(true);
  });

  it("rejects different species", () => {
    const a = monster({ instanceId: "a", speciesId: "sparkit" });
    const b = monster({ instanceId: "b", speciesId: "ridgeback" });
    expect(canMerge(a, b)).toBe(false);
  });

  it("rejects different levels", () => {
    const a = monster({ instanceId: "a", level: 1 });
    const b = monster({ instanceId: "b", level: 2 });
    expect(canMerge(a, b)).toBe(false);
  });

  it("rejects merging a monster with itself", () => {
    const a = monster({ instanceId: "a" });
    expect(canMerge(a, a)).toBe(false);
  });

  it("rejects merging at max level (1x1 caps at Lv4)", () => {
    const a = monster({ instanceId: "a", level: maxLevelForSpecies("sparkit") });
    const b = monster({ instanceId: "b", level: maxLevelForSpecies("sparkit") });
    expect(canMerge(a, b)).toBe(false);
  });

  it("allows non-1x1 shapes to merge up to Lv5", () => {
    const ridgeback = (overrides: Partial<PlacedMonster>) =>
      monster({ speciesId: "ridgeback", shape: "h2", ...overrides });
    const a = ridgeback({ instanceId: "a", level: 4 });
    const b = ridgeback({ instanceId: "b", level: 4 });
    expect(canMerge(a, b)).toBe(true);
  });

  it("rejects merging non-1x1 shapes at their Lv5 cap", () => {
    const ridgeback = (overrides: Partial<PlacedMonster>) =>
      monster({ speciesId: "ridgeback", shape: "h2", ...overrides });
    const a = ridgeback({ instanceId: "a", level: maxLevelForSpecies("ridgeback") });
    const b = ridgeback({ instanceId: "b", level: maxLevelForSpecies("ridgeback") });
    expect(canMerge(a, b)).toBe(false);
  });
});

describe("tryMerge", () => {
  it("returns the target monster leveled up, keeping its anchor/instanceId", () => {
    const target = monster({ instanceId: "target", level: 1, anchor: { row: 2, col: 2 } });
    const moved = monster({ instanceId: "moved", level: 1, anchor: { row: 0, col: 0 } });
    const result = tryMerge(target, moved);
    expect(result).not.toBeNull();
    expect(result?.level).toBe(2);
    expect(result?.instanceId).toBe("target");
    expect(result?.anchor).toEqual({ row: 2, col: 2 });
  });

  it("returns null when nothing happens (mismatch)", () => {
    const target = monster({ instanceId: "target", speciesId: "sparkit" });
    const moved = monster({ instanceId: "moved", speciesId: "ridgeback" });
    expect(tryMerge(target, moved)).toBeNull();
  });
});
