import { ENEMY_DEFS } from "./enemies";
import { defaultRng, pickWeighted, type Rng } from "./rng";
import type { WaveDefinition, WaveSpawnEntry } from "./types";
import waveConfigJson from "./waveConfig.json";

interface WaveConfig {
  baseEnemyCount: number;
  enemyCountPerWave: number;
  maxEnemyCount: number;
  spawnIntervalMs: number;
  hpGrowthPerWave: number;
  speedGrowthPerWave: number;
  damageGrowthPerWave: number;
  enemyUnlocks: Record<string, number>;
  /** A flagship enemy's debut wave gets a small, guaranteed batch of it
   * instead of being left to `pickEnemyId`'s normal weighting — a
   * just-unlocked id's weight (`1 / (wave - unlockWave + 1)`) peaks at 1
   * right on its unlock wave, which at this wave's enemy count would flood
   * the wave with dozens of it rather than the "2-3体" a freshly-unlocked
   * flagship enemy should announce itself with. From the following wave
   * onward it merges into the normal weighted pool like any other unlock. */
  bossDebut?: { enemyId: string; count: number };
  /** A recurring wave that's *only* this one enemy ("こいつは１ぴきのみで
   * 出現する") — starting at `startWave`, and every `interval` waves after
   * that, the entire wave is a single copy of `enemyId` instead of the
   * usual multi-enemy pool. Unlike `bossDebut`, this enemy id is meant to
   * be left out of `enemyUnlocks` entirely, so it can *only* ever appear
   * through this solo path, never mixed into a normal wave. */
  soloBossWave?: { enemyId: string; startWave: number; interval: number };
}

const waveConfig = waveConfigJson as WaveConfig;

function enemyCountForWave(wave: number): number {
  const raw =
    waveConfig.baseEnemyCount + waveConfig.enemyCountPerWave * (wave - 1);
  return Math.min(waveConfig.maxEnemyCount, Math.round(raw));
}

function availableEnemyIds(wave: number): string[] {
  return Object.entries(waveConfig.enemyUnlocks)
    .filter(([, unlockWave]) => wave >= unlockWave)
    .map(([id]) => id);
}

function pickEnemyId(wave: number, rng: Rng, excludeId?: string): string {
  const ids = availableEnemyIds(wave).filter((id) => id !== excludeId);
  // Earlier-unlocking enemies stay common; later ones are rarer additions.
  const weighted: [string, number][] = ids.map((id) => [
    id,
    1 / (wave - waveConfig.enemyUnlocks[id] + 1),
  ]);
  return pickWeighted(weighted, rng);
}

/** Stat multiplier applied to an enemy def for the given wave. */
export function waveScaling(wave: number) {
  return {
    hp: 1 + waveConfig.hpGrowthPerWave * (wave - 1),
    speed: 1 + waveConfig.speedGrowthPerWave * (wave - 1),
    damage: 1 + waveConfig.damageGrowthPerWave * (wave - 1),
  };
}

function soloBossEnemyId(wave: number): string | null {
  const cfg = waveConfig.soloBossWave;
  if (!cfg || wave < cfg.startWave) return null;
  return (wave - cfg.startWave) % cfg.interval === 0 ? cfg.enemyId : null;
}

export function generateWave(wave: number, rng: Rng = defaultRng): WaveDefinition {
  const soloBoss = soloBossEnemyId(wave);
  if (soloBoss && ENEMY_DEFS[soloBoss]) {
    // Centered, not scattered — with no other enemies this wave, there's
    // no crowding to spread out from, and centered reads more like a
    // single imposing arrival than a normal enemy's random lane position.
    return { wave, spawns: [{ spawnX: 0.5, enemyId: soloBoss, delayMs: 0 }] };
  }

  const count = enemyCountForWave(wave);

  const debut = waveConfig.bossDebut;
  const isDebutWave = debut !== undefined && waveConfig.enemyUnlocks[debut.enemyId] === wave;
  const debutCount = isDebutWave ? Math.min(debut.count, count) : 0;
  // Spread the debut copies out through the wave (not bunched at the very
  // start) so the flagship enemy reads as a threat that appears partway
  // through, not an opening gauntlet.
  const debutIndices = new Set(
    Array.from({ length: debutCount }, (_, k) => Math.floor((count * (k + 0.5)) / debutCount)),
  );

  const spawns: WaveSpawnEntry[] = [];
  for (let i = 0; i < count; i++) {
    const enemyId =
      isDebutWave && debut !== undefined && debutIndices.has(i)
        ? debut.enemyId
        : pickEnemyId(wave, rng, isDebutWave ? debut?.enemyId : undefined);
    if (!ENEMY_DEFS[enemyId]) continue;
    spawns.push({
      // Scattered across the board's width — no lane snapping.
      spawnX: rng(),
      enemyId,
      delayMs: i * waveConfig.spawnIntervalMs,
    });
  }
  return { wave, spawns };
}
