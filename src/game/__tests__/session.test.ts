import { describe, expect, it } from "vitest";
import { moveBoardMonster, placeFromTray, tryMergeTrayItems, type TrayItem } from "../session";
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

describe("placeFromTray", () => {
  it("places into an empty board and clamps out-of-range anchors", () => {
    const item: TrayItem = { offerId: "o1", speciesId: "sparkit", shape: "2x2", level: 1 };
    const result = placeFromTray([], item, { row: 3, col: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.board[0].anchor).toEqual({ row: 2, col: 2 });
    }
  });

  it("fails when the target cells are occupied by a mismatched monster", () => {
    const board = [monster({ anchor: { row: 0, col: 0 } })];
    const item: TrayItem = { offerId: "o1", speciesId: "ridgeback", shape: "1x1", level: 1 };
    const result = placeFromTray(board, item, { row: 0, col: 0 });
    expect(result.ok).toBe(false);
  });

  it("merges into a matching board monster instead of failing to place", () => {
    const board = [monster({ instanceId: "a", speciesId: "sparkit", level: 1, anchor: { row: 0, col: 0 } })];
    const item: TrayItem = { offerId: "o1", speciesId: "sparkit", shape: "1x1", level: 1 };
    const result = placeFromTray(board, item, { row: 0, col: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("merged");
      expect(result.board).toHaveLength(1);
      expect(result.board[0].level).toBe(2);
      expect(result.board[0].instanceId).toBe("a");
    }
  });
});

describe("tryMergeTrayItems", () => {
  it("merges two matching tray candidates, keeping the target's offerId", () => {
    const target: TrayItem = { offerId: "t1", speciesId: "sparkit", shape: "1x1", level: 1 };
    const dragged: TrayItem = { offerId: "t2", speciesId: "sparkit", shape: "1x1", level: 1 };
    const result = tryMergeTrayItems(target, dragged);
    expect(result).not.toBeNull();
    expect(result?.offerId).toBe("t1");
    expect(result?.level).toBe(2);
  });

  it("returns null for mismatched species or level", () => {
    const target: TrayItem = { offerId: "t1", speciesId: "sparkit", shape: "1x1", level: 1 };
    expect(tryMergeTrayItems(target, { ...target, offerId: "t2", speciesId: "ridgeback" })).toBeNull();
    expect(tryMergeTrayItems(target, { ...target, offerId: "t2", level: 2 })).toBeNull();
  });
});

describe("moveBoardMonster", () => {
  it("moves into an empty cell", () => {
    const board = [monster({ instanceId: "a", anchor: { row: 0, col: 0 } })];
    const result = moveBoardMonster(board, "a", { row: 3, col: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("moved");
      expect(result.board[0].anchor).toEqual({ row: 3, col: 3 });
    }
  });

  it("merges when dropped onto a same species + same level monster", () => {
    const board = [
      monster({ instanceId: "a", speciesId: "sparkit", level: 1, anchor: { row: 0, col: 0 } }),
      monster({ instanceId: "b", speciesId: "sparkit", level: 1, anchor: { row: 1, col: 1 } }),
    ];
    const result = moveBoardMonster(board, "a", { row: 1, col: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("merged");
      expect(result.board).toHaveLength(1);
      expect(result.board[0].level).toBe(2);
      expect(result.board[0].instanceId).toBe("b");
    }
  });

  it("reports failure (revert) when dropped onto a mismatched monster", () => {
    const board = [
      monster({ instanceId: "a", speciesId: "sparkit", level: 1, anchor: { row: 0, col: 0 } }),
      monster({ instanceId: "b", speciesId: "ridgeback", level: 1, anchor: { row: 1, col: 1 } }),
    ];
    const result = moveBoardMonster(board, "a", { row: 1, col: 1 });
    expect(result.ok).toBe(false);
    // Original board is untouched — caller re-renders from its own last-known state.
    expect(board.find((m) => m.instanceId === "a")?.anchor).toEqual({ row: 0, col: 0 });
  });
});
