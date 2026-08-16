export type ShapeId = "1x1" | "h2" | "v2" | "h3" | "2x2";

export interface Vec2 {
  row: number;
  col: number;
}

export interface ShapeDef {
  id: ShapeId;
  label: string;
  /** Cell offsets from the anchor (top-left) cell. */
  cells: Vec2[];
}

export type AttackRangeType = "single" | "row-multi" | "area-multi";

export interface ShapeCombatStats {
  baseAttack: number;
  attackIntervalMs: number;
  rangeType: AttackRangeType;
  /** Max simultaneous targets at level 1. */
  baseMaxTargets: number;
}

export interface MonsterSpecies {
  id: string;
  name: string;
  shape: ShapeId;
  /** Placeholder color for dummy-rect rendering until real art lands (Phase6). */
  color: number;
}

export type Level = 1 | 2 | 3 | 4 | 5;

export interface PlacedMonster {
  instanceId: string;
  speciesId: string;
  shape: ShapeId;
  level: Level;
  anchor: Vec2;
}

export interface ResolvedMonsterStats {
  attack: number;
  attackIntervalMs: number;
  rangeType: AttackRangeType;
  maxTargets: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  baseHp: number;
  /** Lane progress (0..1) gained per second. */
  baseSpeed: number;
  baseDamage: number;
  /** Coins awarded on a kill are a coin flip, not guaranteed — this is the
   * odds (0..1) of a drop; `coinReward` is the amount *if* it drops. */
  coinDropChance: number;
  coinReward: number;
  /** Multiplies the rendered sprite size — stronger enemies (higher
   * hp/damage) are drawn physically bigger so power reads visually, on
   * top of the art itself getting bulkier/more armored per tier. */
  sizeScale: number;
}

export interface EnemyInstance {
  instanceId: string;
  defId: string;
  /** Horizontal spawn position across the board's width (0..1) — enemies
   * scatter freely rather than snapping to a lane. */
  spawnX: number;
  hp: number;
  maxHp: number;
  /** 0 = just spawned (far), 1 = reached the base. */
  progress: number;
  speed: number;
  damage: number;
  coinReward: number;
  /** True once this enemy has reached the base (progress clamped to 1)
   * and dealt its breach damage. It stops advancing but stays on the
   * board as an attackable target rather than disappearing — it's only
   * removed once monsters actually kill it. */
  hasBreached: boolean;
}

export interface WaveSpawnEntry {
  /** Horizontal spawn position across the board's width (0..1). */
  spawnX: number;
  enemyId: string;
  delayMs: number;
}

export interface WaveDefinition {
  wave: number;
  spawns: WaveSpawnEntry[];
}

export type GamePhase =
  | "initial-placement"
  | "battle"
  | "reward"
  | "gameover";

export interface RewardOfferEntry {
  offerId: string;
  speciesId: string;
  level: Level;
}

export const BOARD_SIZE = 4;
