import { getSpecies } from "./monsters";
import type { Level, PlacedMonster, ShapeId } from "./types";

/** 1x1 (sparkit) has no Lv5 evolution and caps at Lv4 ("LvMAX"); every other
 * shape gets a further Lv5 "final form" evolution on top of Lv4. */
const MAX_LEVEL_BY_SHAPE: Record<ShapeId, Level> = {
  "1x1": 4,
  h2: 5,
  v2: 5,
  h3: 5,
  "2x2": 5,
};

export function maxLevelForShape(shape: ShapeId): Level {
  return MAX_LEVEL_BY_SHAPE[shape];
}

export function maxLevelForSpecies(speciesId: string): Level {
  return maxLevelForShape(getSpecies(speciesId).shape);
}

/** The fields `canMerge` actually needs — lets a not-yet-placed tray/reward
 * pickup be checked against a board monster without a full anchor/shape. */
export type MergeCandidate = Pick<PlacedMonster, "instanceId" | "speciesId" | "level">;

/** Adapts a not-yet-placed tray/reward item (identity = `offerId`, no
 * board `instanceId`) into a `MergeCandidate`. Use instead of hand-rolling
 * the `{ instanceId: x.offerId, ... }` object at each `canMerge` call. */
export function offerMergeCandidate(x: { offerId: string; speciesId: string; level: Level }): MergeCandidate {
  return { instanceId: x.offerId, speciesId: x.speciesId, level: x.level };
}

/**
 * Same species + same level merge into level+1 (capped per-shape via
 * `maxLevelForSpecies` — 1x1 caps at Lv4, every other shape at Lv5).
 * Any mismatch (different species, different level, or already max level)
 * means "nothing happens" per spec — caller should revert the dragged
 * monster to its original anchor.
 */
export function canMerge(a: MergeCandidate, b: MergeCandidate): boolean {
  if (a.instanceId === b.instanceId) return false;
  if (a.speciesId !== b.speciesId) return false;
  if (a.level !== b.level) return false;
  if (a.level >= maxLevelForSpecies(a.speciesId)) return false;
  return true;
}

/**
 * Merges `moved` into `target`. Returns the resulting monster (keeping
 * target's anchor/instanceId, i.e. `moved` is consumed) or null if the
 * pair cannot merge.
 */
export function tryMerge(
  target: PlacedMonster,
  moved: PlacedMonster,
): PlacedMonster | null {
  if (!canMerge(target, moved)) return null;
  return { ...target, level: (target.level + 1) as Level };
}
