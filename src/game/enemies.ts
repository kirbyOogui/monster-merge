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
  /** A dedicated solo-wave boss (see `soloBossWave` in waveConfig.json) —
   * never joins the normal weighted enemy pool, so it's deliberately left
   * out of `enemyUnlocks`; its only spawn path is `generateWave`'s
   * solo-boss branch, which always sends exactly one. Stats are a large
   * jump over giant (the previous strongest) since this is the whole
   * wave's threat rather than one of dozens. */
  dragon: {
    id: "dragon",
    name: "ドラゴン",
    // ~5x the previous 2200 — a solo boss wave should be a real wall, not
    // something a maxed board melts in a couple of seconds.
    baseHp: 11000,
    baseSpeed: 0.05,
    baseDamage: 130,
    coinDropChance: 1,
    coinReward: 60,
    sizeScale: 2.6,
    // A slower, heavier-hitting-feeling cadence than every other enemy's
    // 1s default ("攻撃頻度をおとす") — its breach attack also gets a
    // much bigger screen-wide effect (see spawnDragonBreachEffect in
    // GameCanvas.tsx), which reads best with room to breathe between hits
    // rather than repeating every second.
    attackIntervalMs: 3000,
  },
};

export const ENEMY_IDS = Object.keys(ENEMY_DEFS);
