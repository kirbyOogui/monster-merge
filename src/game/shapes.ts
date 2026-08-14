import type {
  AttackRangeType,
  Level,
  ResolvedMonsterStats,
  ShapeCombatStats,
  ShapeDef,
  ShapeId,
  Vec2,
} from "./types";

export const SHAPES: Record<ShapeId, ShapeDef> = {
  "1x1": { id: "1x1", label: "1×1", cells: [{ row: 0, col: 0 }] },
  h2: {
    id: "h2",
    label: "横2",
    cells: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ],
  },
  v2: {
    id: "v2",
    label: "縦2",
    cells: [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
    ],
  },
  h3: {
    id: "h3",
    label: "横3",
    cells: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ],
  },
  "2x2": {
    id: "2x2",
    label: "2×2",
    cells: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ],
  },
};

/**
 * Role table per design doc section 2 ("5形状の役割設計").
 * 1x1: 手数多い/低威力/単体. h2: 横列範囲. v2: 少手数/高威力/単体.
 * h3: 少手数/高威力/横列範囲. 2x2: 最少手数/最高威力/広範囲.
 */
export const SHAPE_COMBAT: Record<ShapeId, ShapeCombatStats> = {
  "1x1": {
    baseAttack: 6,
    attackIntervalMs: 1200,
    rangeType: "single",
    baseMaxTargets: 1,
  },
  h2: {
    baseAttack: 8,
    attackIntervalMs: 1500,
    rangeType: "row-multi",
    baseMaxTargets: 2,
  },
  v2: {
    baseAttack: 20,
    attackIntervalMs: 1850,
    rangeType: "single",
    baseMaxTargets: 1,
  },
  h3: {
    baseAttack: 14,
    attackIntervalMs: 1750,
    rangeType: "row-multi",
    baseMaxTargets: 2,
  },
  "2x2": {
    baseAttack: 30,
    attackIntervalMs: 2200,
    rangeType: "area-multi",
    baseMaxTargets: 2,
  },
};

/** Multiplicative attack growth per level (Lv1 baseline = 1). Lv4 requires
 * merging two Lv3s (itself two Lv2s, itself two Lv1s — 8 Lv1-equivalents
 * of investment for one Lv4), so its jump from Lv3 was widened well past
 * the arithmetic +0.4-per-level pattern the earlier levels follow, at the
 * user's request ("味方のレベル４をもっと強力にして") to make that
 * investment pay off much more dramatically. */
const LEVEL_ATTACK_MULTIPLIER: Record<Level, number> = {
  1: 1,
  2: 1.8,
  3: 3.0,
  4: 7.0,
};

/** Attack interval shrinks (faster hands) as level rises. */
const LEVEL_INTERVAL_MULTIPLIER: Record<Level, number> = {
  1: 1,
  2: 0.92,
  3: 0.84,
  4: 0.65,
};

export function shapeExtent(shape: ShapeId): { rows: number; cols: number } {
  const cells = SHAPES[shape].cells;
  return {
    rows: Math.max(...cells.map((c) => c.row)) + 1,
    cols: Math.max(...cells.map((c) => c.col)) + 1,
  };
}

export function occupiedCells(shape: ShapeId, anchor: Vec2): Vec2[] {
  return SHAPES[shape].cells.map((c) => ({
    row: anchor.row + c.row,
    col: anchor.col + c.col,
  }));
}

export function resolveMonsterStats(
  shape: ShapeId,
  level: Level,
): ResolvedMonsterStats {
  const base = SHAPE_COMBAT[shape];
  const maxTargets =
    base.rangeType === "single"
      ? 1
      : base.baseMaxTargets + (level >= 3 ? 1 : 0);
  return {
    attack: Math.round(base.baseAttack * LEVEL_ATTACK_MULTIPLIER[level]),
    attackIntervalMs: Math.round(
      base.attackIntervalMs * LEVEL_INTERVAL_MULTIPLIER[level],
    ),
    rangeType: base.rangeType as AttackRangeType,
    maxTargets,
  };
}
