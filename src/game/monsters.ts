import type { MonsterSpecies } from "./types";

/**
 * One species per shape (5 total) — each one is the "evolution line" for
 * that shape, visually progressing across Lv1-4 rather than having many
 * cosmetic variants per shape. Combat stats are driven entirely by
 * shape+level (see shapes.ts), so species is purely cosmetic; this keeps
 * Phase6 art scope to 5 evolution lines instead of 20.
 * `color` is a placeholder swatch for dummy-rect rendering until real
 * sprite art lands.
 */
export const MONSTER_SPECIES: MonsterSpecies[] = [
  { id: "sparkit", name: "スパーキット", shape: "1x1", color: 0x7ed957 },
  { id: "ridgeback", name: "リッジバック", shape: "h2", color: 0xc47a3d },
  { id: "longneck", name: "ロングネック", shape: "v2", color: 0x4e7ff0 },
  { id: "serpentail", name: "サーペンテイル", shape: "h3", color: 0x9a4ef0 },
  { id: "bouldros", name: "ボルドロス", shape: "2x2", color: 0xd94e4e },
];

export const MONSTER_BY_ID: Record<string, MonsterSpecies> = Object.fromEntries(
  MONSTER_SPECIES.map((m) => [m.id, m]),
);

export function getSpecies(speciesId: string): MonsterSpecies {
  const species = MONSTER_BY_ID[speciesId];
  if (!species) throw new Error(`Unknown species: ${speciesId}`);
  return species;
}
