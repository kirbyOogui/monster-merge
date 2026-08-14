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

function pickEnemyId(wave: number, rng: Rng): string {
  const ids = availableEnemyIds(wave);
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

export function generateWave(wave: number, rng: Rng = defaultRng): WaveDefinition {
  const count = enemyCountForWave(wave);
  const spawns: WaveSpawnEntry[] = [];
  for (let i = 0; i < count; i++) {
    const enemyId = pickEnemyId(wave, rng);
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
