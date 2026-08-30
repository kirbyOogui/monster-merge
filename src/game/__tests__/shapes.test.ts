import { describe, expect, it } from "vitest";
import { occupiedCells, resolveMonsterStats, shapeExtent } from "../shapes";

describe("occupiedCells", () => {
  it("computes absolute cells from an anchor", () => {
    expect(occupiedCells("2x2", { row: 1, col: 1 })).toEqual([
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ]);
  });
});

describe("shapeExtent", () => {
  it("reports the bounding box for each shape", () => {
    expect(shapeExtent("1x1")).toEqual({ rows: 1, cols: 1 });
    expect(shapeExtent("h3")).toEqual({ rows: 1, cols: 3 });
    expect(shapeExtent("v2")).toEqual({ rows: 2, cols: 1 });
    expect(shapeExtent("2x2")).toEqual({ rows: 2, cols: 2 });
  });
});

describe("resolveMonsterStats", () => {
  it("increases attack and shrinks interval with level", () => {
    const lv1 = resolveMonsterStats("1x1", 1);
    const lv4 = resolveMonsterStats("1x1", 4);
    expect(lv4.attack).toBeGreaterThan(lv1.attack);
    expect(lv4.attackIntervalMs).toBeLessThan(lv1.attackIntervalMs);
  });

  it("single-range shapes always cap at 1 target regardless of level", () => {
    expect(resolveMonsterStats("v2", 4).maxTargets).toBe(1);
  });

  it("row/area shapes gain an extra target at level 3+", () => {
    const lv2 = resolveMonsterStats("h3", 2);
    const lv3 = resolveMonsterStats("h3", 3);
    expect(lv3.maxTargets).toBe(lv2.maxTargets + 1);
  });

  it("row/area shapes gain a *second* extra target at level 5, on top of the level-3 one", () => {
    const base = resolveMonsterStats("h2", 1).maxTargets;
    expect(resolveMonsterStats("h2", 3).maxTargets).toBe(base + 1);
    expect(resolveMonsterStats("h2", 4).maxTargets).toBe(base + 1);
    expect(resolveMonsterStats("h2", 5).maxTargets).toBe(base + 2);
    expect(resolveMonsterStats("2x2", 5).maxTargets).toBe(resolveMonsterStats("2x2", 1).maxTargets + 2);
  });

  it("single-range shapes stay at one target even at level 5", () => {
    expect(resolveMonsterStats("1x1", 5).maxTargets).toBe(1);
    expect(resolveMonsterStats("v2", 5).maxTargets).toBe(1);
  });
});
