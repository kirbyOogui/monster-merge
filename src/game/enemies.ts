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
    baseHp: 22,
    baseSpeed: 0.22,
    baseDamage: 7,
    coinDropChance: 0.4,
    coinReward: 4,
    sizeScale: 0.8,
  },
  slime: {
    id: "slime",
    name: "スライム",
    baseHp: 29,
    baseSpeed: 0.12,
    baseDamage: 8,
    coinDropChance: 0.4,
    coinReward: 3,
    sizeScale: 0.9,
  },
  goblin: {
    id: "goblin",
    name: "ゴブリン",
    baseHp: 50,
    baseSpeed: 0.15,
    baseDamage: 13,
    coinDropChance: 0.4,
    coinReward: 5,
    sizeScale: 1.05,
  },
  orc: {
    id: "orc",
    name: "オーク",
    baseHp: 100,
    baseSpeed: 0.09,
    baseDamage: 24,
    coinDropChance: 0.4,
    coinReward: 9,
    sizeScale: 1.3,
  },
  troll: {
    id: "troll",
    name: "トロール",
    baseHp: 350,
    baseSpeed: 0.07,
    baseDamage: 43,
    coinDropChance: 0.4,
    coinReward: 15,
    sizeScale: 1.55,
  },
  giant: {
    id: "giant",
    name: "ジャイアント",
    baseHp: 700,
    baseSpeed: 0.06,
    baseDamage: 74,
    coinDropChance: 0.4,
    coinReward: 25,
    sizeScale: 2.0,
  },
};

export const ENEMY_IDS = Object.keys(ENEMY_DEFS);
