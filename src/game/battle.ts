import { ENEMY_DEFS } from "./enemies";
import { generateRewardOffer, REROLL_COST } from "./gacha";
import { canMerge } from "./merge";
import { defaultRng, type Rng } from "./rng";
import { resolveMonsterStats } from "./shapes";
import { waveScaling } from "./waves";
import type {
  EnemyInstance,
  GamePhase,
  Level,
  PlacedMonster,
  RewardOfferEntry,
  WaveDefinition,
  WaveSpawnEntry,
} from "./types";

export const BASE_MAX_HP = 10000;

/** How often a breached enemy (parked at the base) re-deals its damage. */
const ENEMY_ATTACK_INTERVAL_MS = 1000;

/**
 * How long to linger in "battle" after the last enemy is gone before
 * flipping to "reward". Without this, the reward offer UI can appear
 * while the killing blow's projectile/impact VFX (which run on their own
 * cosmetic timers in the view layer, decoupled from this instant combat
 * math) are still mid-flight.
 */
const WAVE_CLEAR_DELAY_MS = 900;

export type BattleEvent =
  | { type: "attack"; monsterId: string; targetIds: string[]; damage: number }
  | { type: "enemyKilled"; enemyId: string; coinReward: number }
  | { type: "breach"; enemyId: string; damage: number }
  | { type: "waveClear"; wave: number }
  | { type: "gameOver" };

export interface GameRunState {
  board: PlacedMonster[];
  baseHp: number;
  baseMaxHp: number;
  coins: number;
  wave: number;
  phase: GamePhase;
  enemies: EnemyInstance[];
  elapsedMs: number;
  rewardOffer: RewardOfferEntry[];
  rerollCost: number;
  killCount: number;
}

let enemyInstanceSeq = 0;

/**
 * Mutable real-time battle simulation. The view layer drives it with
 * `tick(dtMs)` every frame (from the Pixi ticker) and reads
 * `getSnapshot()` for rendering / HUD state.
 */
export class BattleEngine {
  private board: PlacedMonster[];
  private baseHp = BASE_MAX_HP;
  private coins = 0;
  private wave = 0;
  private phase: GamePhase = "initial-placement";
  private enemies: EnemyInstance[] = [];
  private spawnQueue: WaveSpawnEntry[] = [];
  private elapsedMs = 0;
  private rewardOffer: RewardOfferEntry[] = [];
  private rerollCost = REROLL_COST;
  private killCount = 0;
  private lastAttackAt = new Map<string, number>();
  private lastEnemyAttackAt = new Map<string, number>();
  private waveClearPendingAt: number | null = null;
  private rng: Rng;
  private listeners = new Set<() => void>();
  private snapshot: GameRunState;

  constructor(initialBoard: PlacedMonster[], rng: Rng = defaultRng) {
    this.board = initialBoard;
    this.rng = rng;
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = (): GameRunState => this.snapshot;

  setBoard(board: PlacedMonster[]): void {
    this.board = board;
    const activeIds = new Set(board.map((m) => m.instanceId));
    for (const id of this.lastAttackAt.keys()) {
      if (!activeIds.has(id)) this.lastAttackAt.delete(id);
    }
    this.publish();
  }

  getBoard(): PlacedMonster[] {
    return this.board;
  }

  startWave(def: WaveDefinition): void {
    this.wave = def.wave;
    this.spawnQueue = [...def.spawns];
    this.enemies = [];
    this.elapsedMs = 0;
    this.phase = "battle";
    this.waveClearPendingAt = null;
    // `lastAttackAt` timestamps are relative to `elapsedMs`, which just
    // reset to 0 above — a monster that survives across waves (exactly
    // the kind of investment a Lv4 represents, so this hit it hardest and
    // most visibly: "レベル4の味方がウェーブ開始してもしばらく攻撃してく
    // れない") keeps its stale, much-larger timestamp from the *previous*
    // wave's `elapsedMs`. Since `elapsedMs - last` then starts deeply
    // negative, `resolveAttacks`'s cooldown check keeps failing until the
    // new wave's `elapsedMs` climbs back up past that leftover value —
    // effectively locking the monster out of attacking for however far
    // into the previous wave it last fired, sometimes nearly the whole
    // wave. Clearing both maps here means every monster (and every
    // breached enemy re-attack timer) starts the new wave able to act
    // immediately, exactly like a freshly-placed one already did.
    this.lastAttackAt = new Map();
    this.lastEnemyAttackAt = new Map();
    this.publish();
  }

  spendReroll(): boolean {
    if (this.coins < this.rerollCost) return false;
    this.coins -= this.rerollCost;
    this.rewardOffer = generateRewardOffer(this.rng);
    this.publish();
    return true;
  }

  /** Called once when entering the reward phase to populate the offer. */
  private rollRewardOffer(): void {
    this.rewardOffer = generateRewardOffer(this.rng);
  }

  clearRewardOffer(): void {
    this.rewardOffer = [];
    this.publish();
  }

  /** Removes just the placed offer entry, leaving the rest pickable. */
  removeRewardOfferItem(offerId: string): void {
    this.rewardOffer = this.rewardOffer.filter((o) => o.offerId !== offerId);
    this.publish();
  }

  /** Dragging a monster off the board during the reward phase returns it
   * here, lined up alongside the other pickable candidates, rather than
   * deleting it. Only valid during the reward phase (there's no offer to
   * rejoin otherwise). */
  returnToRewardOffer(entry: RewardOfferEntry): boolean {
    if (this.phase !== "reward") return false;
    this.rewardOffer = [...this.rewardOffer, entry];
    this.publish();
    return true;
  }

  /** Merges two still-unplaced reward candidates directly (dragging one
   * offer onto another matching one). `targetOfferId` keeps its slot. */
  mergeRewardOfferItems(draggedOfferId: string, targetOfferId: string): boolean {
    const dragged = this.rewardOffer.find((o) => o.offerId === draggedOfferId);
    const target = this.rewardOffer.find((o) => o.offerId === targetOfferId);
    if (!dragged || !target) return false;
    if (!canMerge({ instanceId: dragged.offerId, speciesId: dragged.speciesId, level: dragged.level }, { instanceId: target.offerId, speciesId: target.speciesId, level: target.level })) {
      return false;
    }
    const merged: RewardOfferEntry = { ...target, level: (target.level + 1) as Level };
    this.rewardOffer = this.rewardOffer
      .filter((o) => o.offerId !== draggedOfferId && o.offerId !== targetOfferId)
      .concat(merged);
    this.publish();
    return true;
  }

  tick(dtMs: number): BattleEvent[] {
    if (this.phase !== "battle") return [];
    const events: BattleEvent[] = [];
    this.elapsedMs += dtMs;

    this.processSpawns();
    this.advanceEnemies(dtMs, events);
    this.resolveAttacks(events);
    this.checkWaveClear(events);

    this.publish();
    return events;
  }

  private processSpawns(): void {
    const ready = this.spawnQueue.filter((s) => s.delayMs <= this.elapsedMs);
    if (ready.length === 0) return;
    this.spawnQueue = this.spawnQueue.filter((s) => s.delayMs > this.elapsedMs);
    const scaling = waveScaling(this.wave);
    for (const spawn of ready) {
      const def = ENEMY_DEFS[spawn.enemyId];
      if (!def) continue;
      const maxHp = Math.round(def.baseHp * scaling.hp);
      this.enemies.push({
        instanceId: `enemy-${++enemyInstanceSeq}`,
        defId: def.id,
        spawnX: spawn.spawnX,
        hp: maxHp,
        maxHp,
        progress: 0,
        speed: def.baseSpeed * scaling.speed,
        damage: Math.round(def.baseDamage * scaling.damage),
        coinReward: def.coinReward,
        hasBreached: false,
      });
    }
  }

  private advanceEnemies(dtMs: number, events: BattleEvent[]): void {
    const survivors: EnemyInstance[] = [];
    for (const enemy of this.enemies) {
      // Already breached: stays parked at the base line as an attackable
      // target rather than continuing to move, and keeps re-dealing its
      // damage to the base on an interval for as long as it's alive —
      // it's removed only once `resolveAttacks` kills it.
      if (enemy.hasBreached) {
        const last = this.lastEnemyAttackAt.get(enemy.instanceId) ?? -Infinity;
        if (this.elapsedMs - last >= ENEMY_ATTACK_INTERVAL_MS) {
          this.lastEnemyAttackAt.set(enemy.instanceId, this.elapsedMs);
          this.baseHp = Math.max(0, this.baseHp - enemy.damage);
          events.push({ type: "breach", enemyId: enemy.instanceId, damage: enemy.damage });
        }
        survivors.push(enemy);
        continue;
      }
      const progress = enemy.progress + (enemy.speed * dtMs) / 1000;
      if (progress >= 1) {
        this.lastEnemyAttackAt.set(enemy.instanceId, this.elapsedMs);
        this.baseHp = Math.max(0, this.baseHp - enemy.damage);
        events.push({ type: "breach", enemyId: enemy.instanceId, damage: enemy.damage });
        survivors.push({ ...enemy, progress: 1, hasBreached: true });
        continue;
      }
      survivors.push({ ...enemy, progress });
    }
    this.enemies = survivors;
    if (this.baseHp <= 0 && this.phase === "battle") {
      this.phase = "gameover";
      events.push({ type: "gameOver" });
    }
  }

  private resolveAttacks(events: BattleEvent[]): void {
    if (this.phase !== "battle") return;
    // No lane restriction: every monster can threaten any enemy on the
    // board, always going for whichever are furthest along (closest to
    // breaching). `maxTargets` (from shape/level) is the only limiter.
    // Recomputed per monster (not hoisted) so kills from an earlier
    // monster in this same tick are reflected for the next one.
    //
    // `attackedThisTick` tracks enemies already hit earlier in this same
    // tick. Without it, every monster whose cooldown happens to expire on
    // this tick independently re-picks the same "furthest along" enemy,
    // piling redundant overkill onto it while other approaching enemies
    // go completely untouched. Monsters prefer a not-yet-hit enemy and
    // only fall back to a shared target when nothing else is alive.
    const attackedThisTick = new Set<string>();
    for (const monster of this.board) {
      const stats = resolveMonsterStats(monster.shape, monster.level);
      const alive = this.enemies
        .filter((e) => e.hp > 0)
        .sort((a, b) => b.progress - a.progress);
      if (alive.length === 0) continue;

      const last = this.lastAttackAt.get(monster.instanceId) ?? -Infinity;
      if (this.elapsedMs - last < stats.attackIntervalMs) continue;

      const fresh = alive.filter((e) => !attackedThisTick.has(e.instanceId));
      const candidates = fresh.length > 0 ? fresh : alive;
      const targets = candidates.slice(0, stats.maxTargets);
      this.lastAttackAt.set(monster.instanceId, this.elapsedMs);
      const targetIds: string[] = [];
      for (const target of targets) {
        target.hp -= stats.attack;
        attackedThisTick.add(target.instanceId);
        targetIds.push(target.instanceId);
      }
      events.push({
        type: "attack",
        monsterId: monster.instanceId,
        targetIds,
        damage: stats.attack,
      });
    }

    const alive: EnemyInstance[] = [];
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) {
        // Coins are a per-kill coin flip, not guaranteed ("1体の敵から確率
        // でコインをもらえるように") — `coinReward` on the event is the
        // actual amount earned this kill (0 on a miss), not the def's flat
        // potential value.
        const def = ENEMY_DEFS[enemy.defId];
        const dropped = this.rng() < (def?.coinDropChance ?? 1);
        const coinReward = dropped ? enemy.coinReward : 0;
        this.coins += coinReward;
        this.killCount += 1;
        this.lastEnemyAttackAt.delete(enemy.instanceId);
        events.push({ type: "enemyKilled", enemyId: enemy.instanceId, coinReward });
      } else {
        alive.push(enemy);
      }
    }
    this.enemies = alive;
  }

  private checkWaveClear(events: BattleEvent[]): void {
    if (this.phase !== "battle") return;
    if (this.spawnQueue.length !== 0 || this.enemies.length !== 0) {
      this.waveClearPendingAt = null;
      return;
    }
    if (this.waveClearPendingAt === null) {
      this.waveClearPendingAt = this.elapsedMs;
      return;
    }
    if (this.elapsedMs - this.waveClearPendingAt < WAVE_CLEAR_DELAY_MS) return;

    this.phase = "reward";
    this.rollRewardOffer();
    events.push({ type: "waveClear", wave: this.wave });
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((cb) => cb());
  }

  private buildSnapshot(): GameRunState {
    return {
      board: this.board,
      baseHp: this.baseHp,
      baseMaxHp: BASE_MAX_HP,
      coins: this.coins,
      wave: this.wave,
      phase: this.phase,
      enemies: this.enemies,
      elapsedMs: this.elapsedMs,
      rewardOffer: this.rewardOffer,
      rerollCost: this.rerollCost,
      killCount: this.killCount,
    };
  }
}
