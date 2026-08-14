import { describe, expect, it } from "vitest";
import { canPlace, findFirstOpenAnchor, moveMonster, placeMonster, removeMonster } from "../board";
import type { PlacedMonster } from "../types";

function monster(overrides: Partial<PlacedMonster> = {}): PlacedMonster {
  return {
    instanceId: "m1",
    speciesId: "sparkit",
    shape: "1x1",
    level: 1,
    anchor: { row: 0, col: 0 },
    ...overrides,
  };
}

describe("canPlace", () => {
  it("allows placement fully inside the 4x4 board", () => {
    expect(canPlace([], "1x1", { row: 3, col: 3 })).toBe(true);
    expect(canPlace([], "2x2", { row: 2, col: 2 })).toBe(true);
  });

  it("rejects placement that overflows the board", () => {
    expect(canPlace([], "2x2", { row: 3, col: 3 })).toBe(false);
    expect(canPlace([], "h3", { row: 0, col: 2 })).toBe(false);
    expect(canPlace([], "v2", { row: 3, col: 0 })).toBe(false);
  });

  it("rejects placement overlapping an existing monster", () => {
    const board = [monster({ instanceId: "a", shape: "2x2", anchor: { row: 0, col: 0 } })];
    expect(canPlace(board, "1x1", { row: 1, col: 1 })).toBe(false);
    expect(canPlace(board, "1x1", { row: 2, col: 2 })).toBe(true);
  });

  it("ignores the monster's own cells when moving it", () => {
    const board = [monster({ instanceId: "a", shape: "h2", anchor: { row: 0, col: 0 } })];
    expect(canPlace(board, "h2", { row: 0, col: 0 }, "a")).toBe(true);
  });
});

describe("board mutation helpers", () => {
  it("place/remove/move round-trip", () => {
    let board: PlacedMonster[] = [];
    board = placeMonster(board, monster());
    expect(board).toHaveLength(1);

    board = moveMonster(board, "m1", { row: 1, col: 1 });
    expect(board[0].anchor).toEqual({ row: 1, col: 1 });

    board = removeMonster(board, "m1");
    expect(board).toHaveLength(0);
  });
});

describe("findFirstOpenAnchor", () => {
  it("returns undefined when the board is full", () => {
    const board: PlacedMonster[] = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        board.push(monster({ instanceId: `${row}-${col}`, anchor: { row, col } }));
      }
    }
    expect(findFirstOpenAnchor(board, "1x1")).toBeUndefined();
  });

  it("finds the first row-major open slot for a 2x2", () => {
    const board = [monster({ instanceId: "a", anchor: { row: 0, col: 0 } })];
    const anchor = findFirstOpenAnchor(board, "2x2");
    expect(anchor).toEqual({ row: 0, col: 1 });
  });
});
