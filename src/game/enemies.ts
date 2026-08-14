import type { EnemyDef } from "./types";

/**
 * 4 base enemy types (matches the "敵4種" asset count in Phase6). All
 * enemies share the same walk/hit/die behavior — stat-only variety.
 * Special behaviors (shield/fast/boss) are explicitly Phase2 scope.
 */
export const ENEMY_DEFS: Record<string, EnemyDef> = {
  bat: {
    id: "bat",
    name: "コウモリ",
    baseHp: 15,
    baseSpeed: 0.22,
    baseDamage: 5,
    coinDropChance: 0.5,
    coinReward: 4,
    sizeScale: 0.8,
  },
  slime: {
    id: "slime",
    name: "スライム",
    baseHp: 20,
    baseSpeed: 0.12,
    baseDamage: 6,
    coinDropChance: 0.5,
    coinReward: 3,
    sizeScale: 0.9,
  },
  goblin: {
    id: "goblin",
    name: "ゴブリン",
    baseHp: 35,
    baseSpeed: 0.15,
    baseDamage: 9,
    coinDropChance: 0.5,
    coinReward: 5,
    sizeScale: 1.05,
  },
  orc: {
    id: "orc",
    name: "オーク",
    baseHp: 70,
    baseSpeed: 0.09,
    baseDamage: 17,
    coinDropChance: 0.5,
    coinReward: 9,
    sizeScale: 1.3,
  },
};

export const ENEMY_IDS = Object.keys(ENEMY_DEFS);
