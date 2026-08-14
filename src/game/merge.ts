import type { Level, PlacedMonster } from "./types";

export const MAX_LEVEL: Level = 4;

/** The fields `canMerge` actually needs — lets a not-yet-placed tray/reward
 * pickup be checked against a board monster without a full anchor/shape. */
export type MergeCandidate = Pick<PlacedMonster, "instanceId" | "speciesId" | "level">;

/**
 * Same species + same level merge into level+1 (capped at MAX_LEVEL).
 * Any mismatch (different species, different level, or already max level)
 * means "nothing happens" per spec — caller should revert the dragged
 * monster to its original anchor.
 */
export function canMerge(a: MergeCandidate, b: MergeCandidate): boolean {
  if (a.instanceId === b.instanceId) return false;
  if (a.speciesId !== b.speciesId) return false;
  if (a.level !== b.level) return false;
  if (a.level >= MAX_LEVEL) return false;
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
