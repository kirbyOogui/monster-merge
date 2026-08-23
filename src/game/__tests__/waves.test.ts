import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng";
import { generateWave } from "../waves";

function countEnemy(wave: ReturnType<typeof generateWave>, enemyId: string): number {
  return wave.spawns.filter((s) => s.enemyId === enemyId).length;
}

describe("generateWave", () => {
  it("gives giant's debut wave (9) a small guaranteed batch, not the flooded share its raw unlock weight would imply", () => {
    const wave = generateWave(9, mulberry32(1));
    expect(countEnemy(wave, "giant")).toBe(3);
  });

  it("has no giants before its unlock wave", () => {
    const wave = generateWave(8, mulberry32(1));
    expect(countEnemy(wave, "giant")).toBe(0);
  });

  it("lets giant rejoin the normal weighted pool the wave after its debut", () => {
    const wave = generateWave(10, mulberry32(1));
    // Not a guaranteed count anymore — just confirms it's eligible again.
    expect(wave.spawns.some((s) => s.enemyId === "giant")).toBe(true);
  });

  it("makes the solo boss's wave nothing but a single copy of it", () => {
    const wave = generateWave(15, mulberry32(1));
    expect(wave.spawns).toHaveLength(1);
    expect(wave.spawns[0].enemyId).toBe("dragon");
  });

  it("repeats the solo boss wave every `interval` waves after its start", () => {
    const wave = generateWave(25, mulberry32(1));
    expect(wave.spawns).toHaveLength(1);
    expect(wave.spawns[0].enemyId).toBe("dragon");
  });

  it("never mixes the solo boss into a normal multi-enemy wave", () => {
    for (const wave of [14, 16, 20, 24, 26]) {
      expect(countEnemy(generateWave(wave, mulberry32(1)), "dragon")).toBe(0);
    }
  });
});
