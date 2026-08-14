import { occupiedCells } from "./shapes";
import { BOARD_SIZE, type PlacedMonster, type ShapeId, type Vec2 } from "./types";

export function isWithinBoard(cells: Vec2[]): boolean {
  return cells.every(
    (c) => c.row >= 0 && c.row < BOARD_SIZE && c.col >= 0 && c.col < BOARD_SIZE,
  );
}

/**
 * Returns true if `shape` anchored at `anchor` can be placed on the board,
 * ignoring collisions with `ignoreInstanceId` (used while dragging an
 * existing monster to a new spot).
 */
export function canPlace(
  board: PlacedMonster[],
  shape: ShapeId,
  anchor: Vec2,
  ignoreInstanceId?: string,
): boolean {
  const cells = occupiedCells(shape, anchor);
  if (!isWithinBoard(cells)) return false;

  const occupied = new Set<string>();
  for (const m of board) {
    if (m.instanceId === ignoreInstanceId) continue;
    for (const c of occupiedCells(m.shape, m.anchor)) {
      occupied.add(`${c.row},${c.col}`);
    }
  }
  return cells.every((c) => !occupied.has(`${c.row},${c.col}`));
}

export function findMonsterAtCell(
  board: PlacedMonster[],
  cell: Vec2,
): PlacedMonster | undefined {
  return board.find((m) =>
    occupiedCells(m.shape, m.anchor).some(
      (c) => c.row === cell.row && c.col === cell.col,
    ),
  );
}

export function placeMonster(
  board: PlacedMonster[],
  monster: PlacedMonster,
): PlacedMonster[] {
  return [...board, monster];
}

export function removeMonster(
  board: PlacedMonster[],
  instanceId: string,
): PlacedMonster[] {
  return board.filter((m) => m.instanceId !== instanceId);
}

export function moveMonster(
  board: PlacedMonster[],
  instanceId: string,
  newAnchor: Vec2,
): PlacedMonster[] {
  return board.map((m) =>
    m.instanceId === instanceId ? { ...m, anchor: newAnchor } : m,
  );
}

/** First empty anchor (scanning row-major) that fits `shape`, if any. */
export function findFirstOpenAnchor(
  board: PlacedMonster[],
  shape: ShapeId,
): Vec2 | undefined {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const anchor = { row, col };
      if (canPlace(board, shape, anchor)) return anchor;
    }
  }
  return undefined;
}
