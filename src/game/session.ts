import { canPlace, findMonsterAtCell } from "./board";
import { generateInitialMonsters } from "./gacha";
import { canMerge, offerMergeCandidate, tryMerge } from "./merge";
import { getSpecies } from "./monsters";
import { defaultRng, type Rng } from "./rng";
import { occupiedCells, shapeExtent } from "./shapes";
import { BOARD_SIZE, type Level, type PlacedMonster, type RewardOfferEntry, type ShapeId, type Vec2 } from "./types";

let instanceSeq = 0;
export function nextInstanceId(): string {
  return `mon-${++instanceSeq}`;
}

export interface TrayItem {
  offerId: string;
  speciesId: string;
  shape: ShapeId;
  level: Level;
}

export function toTrayItem(entry: RewardOfferEntry): TrayItem {
  const species = getSpecies(entry.speciesId);
  return {
    offerId: entry.offerId,
    speciesId: entry.speciesId,
    shape: species.shape,
    level: entry.level,
  };
}

/** Converts a board monster back into a tray item (used when un-placing it). */
export function placedMonsterToTrayItem(m: PlacedMonster): TrayItem {
  return {
    offerId: `returned-${m.instanceId}`,
    speciesId: m.speciesId,
    shape: m.shape,
    level: m.level,
  };
}

/** Converts a board monster back into a reward-offer entry (used when
 * un-placing it during the reward phase, so it rejoins the candidates). */
export function placedMonsterToRewardEntry(m: PlacedMonster): RewardOfferEntry {
  return {
    offerId: `returned-${m.instanceId}`,
    speciesId: m.speciesId,
    level: m.level,
  };
}

/** Clamp a raw drag anchor so the shape always stays on the board. */
export function clampAnchor(shape: ShapeId, anchor: Vec2): Vec2 {
  const { rows, cols } = shapeExtent(shape);
  return {
    row: Math.min(Math.max(anchor.row, 0), BOARD_SIZE - rows),
    col: Math.min(Math.max(anchor.col, 0), BOARD_SIZE - cols),
  };
}

/** The single other monster whose cells overlap this footprint, if any
 * (excluding `ignoreInstanceId`, used when the piece being dropped is
 * already on the board). */
function findOverlapTarget(
  board: PlacedMonster[],
  cells: Vec2[],
  ignoreInstanceId?: string,
): PlacedMonster | undefined {
  const others = ignoreInstanceId ? board.filter((m) => m.instanceId !== ignoreInstanceId) : board;
  for (const cell of cells) {
    const hit = findMonsterAtCell(others, cell);
    if (hit) return hit;
  }
  return undefined;
}

export type PlaceFromTrayResult =
  | { ok: true; kind: "placed" | "merged"; board: PlacedMonster[] }
  | { ok: false };

/**
 * Places a tray item at `anchor`. If the drop overlaps exactly one board
 * monster, tries a merge against it first (so dragging a fresh pickup
 * straight onto a matching board monster levels it up) instead of just
 * failing because the cell is occupied.
 */
export function placeFromTray(
  board: PlacedMonster[],
  item: TrayItem,
  anchor: Vec2,
): PlaceFromTrayResult {
  const clamped = clampAnchor(item.shape, anchor);
  const cells = occupiedCells(item.shape, clamped);
  const overlap = findOverlapTarget(board, cells);

  if (overlap) {
    const incoming: PlacedMonster = {
      instanceId: nextInstanceId(),
      speciesId: item.speciesId,
      shape: item.shape,
      level: item.level,
      anchor: clamped,
    };
    const merged = tryMerge(overlap, incoming);
    if (!merged) return { ok: false };
    const nextBoard = board.filter((m) => m.instanceId !== overlap.instanceId).concat(merged);
    return { ok: true, kind: "merged", board: nextBoard };
  }

  if (!canPlace(board, item.shape, clamped)) return { ok: false };
  const monster: PlacedMonster = {
    instanceId: nextInstanceId(),
    speciesId: item.speciesId,
    shape: item.shape,
    level: item.level,
    anchor: clamped,
  };
  return { ok: true, kind: "placed", board: [...board, monster] };
}

export type MoveResult =
  | { ok: true; kind: "moved" | "merged"; board: PlacedMonster[] }
  | { ok: false };

/**
 * Attempts to drop a board monster at `rawAnchor`. If the drop overlaps
 * exactly one other monster, tries a merge against it; otherwise tries a
 * plain move. Returns `{ ok: false }` when nothing happens, meaning the
 * caller should snap the monster back to its original spot.
 */
export function moveBoardMonster(
  board: PlacedMonster[],
  instanceId: string,
  rawAnchor: Vec2,
): MoveResult {
  const moving = board.find((m) => m.instanceId === instanceId);
  if (!moving) return { ok: false };

  const anchor = clampAnchor(moving.shape, rawAnchor);
  const cells = occupiedCells(moving.shape, anchor);
  const overlap = findOverlapTarget(board, cells, instanceId);

  if (overlap) {
    const merged = tryMerge(overlap, moving);
    if (!merged) return { ok: false };
    const nextBoard = board
      .filter((m) => m.instanceId !== instanceId && m.instanceId !== overlap.instanceId)
      .concat(merged);
    return { ok: true, kind: "merged", board: nextBoard };
  }

  if (!canPlace(board, moving.shape, anchor, instanceId)) return { ok: false };
  const nextBoard = board.map((m) =>
    m.instanceId === instanceId ? { ...m, anchor } : m,
  );
  return { ok: true, kind: "moved", board: nextBoard };
}

export function drawInitialHand(rng: Rng = defaultRng): TrayItem[] {
  return generateInitialMonsters(rng).map(toTrayItem);
}

/**
 * Merges two tray items directly (no board involved) — e.g. dragging one
 * hand/candidate monster onto another matching one before either is
 * placed. `target` keeps its offerId/slot; `dragged` is consumed.
 */
export function tryMergeTrayItems(target: TrayItem, dragged: TrayItem): TrayItem | null {
  if (!canMerge(offerMergeCandidate(target), offerMergeCandidate(dragged))) {
    return null;
  }
  return { ...target, level: (target.level + 1) as Level };
}
