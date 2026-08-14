import { describe, expect, it } from "vitest";
import { BASE_MAX_HP, BattleEngine } from "../battle";
import { mulberry32 } from "../rng";
import type { PlacedMonster, WaveDefinition } from "../types";

function monster(overrides: Partial<PlacedMonster> = {}): PlacedMonster {
  return {
    instanceId: "m1",
    speciesId: "sparkit",
    shape: "1x1",
    level: 1,
    anchor: { row: 0, col: 0 },
    ...overrides,
  };
}

function runUntilNotBattle(engine: BattleEngine, dtMs = 100, maxTicks = 200) {
  let ticks = 0;
  while (engine.getSnapshot().phase === "battle" && ticks < maxTicks) {
    engine.tick(dtMs);
    ticks++;
  }
  return ticks;
}

describe("BattleEngine", () => {
  it("kills a lone enemy and clears the wave", () => {
    // Coins are a per-kill coin flip now (see `coinDropChance`), so a
    // deterministic seed known to roll a drop keeps this assertion
    // meaningful instead of flaking ~50% of the time on `defaultRng`.
    const engine = new BattleEngine([monster({ anchor: { row: 0, col: 0 } })], mulberry32(7));
    const wave: WaveDefinition = {
      wave: 1,
      spawns: [{ spawnX: 0.5, enemyId: "slime", delayMs: 0 }],
    };
    engine.startWave(wave);
    runUntilNotBattle(engine);

    const snapshot = engine.getSnapshot();
    expect(snapshot.phase).toBe("reward");
    expect(snapshot.killCount).toBe(1);
    expect(snapshot.coins).toBeGreaterThan(0);
    expect(snapshot.enemies).toHaveLength(0);
    expect(snapshot.rewardOffer).toHaveLength(3);
  });

  it("has no lane restriction: a lone monster anywhere on the board still threatens every enemy", () => {
    // Monster placed at the far edge (col 3) — under the old lane model
    // this would never see an enemy scattered near col 0.
    const engine = new BattleEngine([monster({ anchor: { row: 0, col: 3 } })]);
    const wave: WaveDefinition = {
      wave: 1,
      spawns: [{ spawnX: 0.05, enemyId: "slime", delayMs: 0 }],
    };
    engine.startWave(wave);
    const ticks = runUntilNotBattle(engine, 100, 300);

    const snapshot = engine.getSnapshot();
    expect(snapshot.phase).toBe("reward");
    expect(snapshot.killCount).toBe(1);
    expect(snapshot.baseHp).toBe(BASE_MAX_HP);
    expect(ticks).toBeLessThan(300);
  });

  it("lets an undefended enemy keep re-attacking the base until it wins", () => {
    // With no monsters to kill it, a breached enemy now stays parked at
    // the base and keeps re-dealing its damage on an interval (rather
    // than vanishing after a single hit) — an undefended board is
    // eventually overwhelmed instead of the wave auto-clearing.
    const engine = new BattleEngine([]);
    const wave: WaveDefinition = {
      wave: 1,
      spawns: [{ spawnX: 0.5, enemyId: "slime", delayMs: 0 }],
    };
    engine.startWave(wave);
    // BASE_MAX_HP is 10000 — a single slime's re-attacks (a few damage per
    // second once breached) take a while to grind through that, so this
    // needs a much larger simulated window than the other, faster-clearing
    // tests. A coarser dtMs keeps the tick count itself manageable.
    runUntilNotBattle(engine, 1000, 2000);

    const snapshot = engine.getSnapshot();
    expect(snapshot.phase).toBe("gameover");
    expect(snapshot.baseHp).toBe(0);
    expect(snapshot.killCount).toBe(0);
  });

  it("reduces base HP and ends the run when it hits zero", () => {
    const engine = new BattleEngine([]);
    const wave: WaveDefinition = {
      wave: 1,
      spawns: Array.from({ length: 25 }, (_, i) => ({
        spawnX: (i % 4) / 4,
        enemyId: "orc" as const,
        delayMs: i * 50,
      })),
    };
    engine.startWave(wave);
    runUntilNotBattle(engine, 200, 500);

    const snapshot = engine.getSnapshot();
    expect(snapshot.phase).toBe("gameover");
    expect(snapshot.baseHp).toBe(0);
  });

  it("v2 (single-target) only ever hits one enemy per attack, even with several present", () => {
    const engine = new BattleEngine([monster({ shape: "v2", anchor: { row: 0, col: 0 } })]);
    const wave: WaveDefinition = {
      wave: 1,
      spawns: [
        { spawnX: 0.1, enemyId: "orc", delayMs: 0 },
        { spawnX: 0.5, enemyId: "orc", delayMs: 0 },
        { spawnX: 0.9, enemyId: "orc", delayMs: 0 },
      ],
    };
    engine.startWave(wave);
    const events = engine.tick(1000);
    const attackEvents = events.filter((e) => e.type === "attack");
    expect(attackEvents).toHaveLength(1);
    expect(attackEvents[0].targetIds).toHaveLength(1);
  });

  it("h2 (multi-target) can hit more than one enemy in the same attack", () => {
    const engine = new BattleEngine([monster({ shape: "h2", anchor: { row: 0, col: 0 } })]);
    const wave: WaveDefinition = {
      wave: 1,
      spawns: [
        { spawnX: 0.2, enemyId: "orc", delayMs: 0 },
        { spawnX: 0.8, enemyId: "orc", delayMs: 0 },
      ],
    };
    engine.startWave(wave);
    const events = engine.tick(1000);
    const attackEvents = events.filter((e) => e.type === "attack");
    expect(attackEvents).toHaveLength(1);
    expect(attackEvents[0].targetIds).toHaveLength(2);
  });

  it("always focuses the frontmost enemy (highest progress) first, regardless of spawn position", () => {
    const engine = new BattleEngine([monster({ shape: "1x1", anchor: { row: 0, col: 0 } })]);
    // Same spawn time, but "bat" is faster than "slime" so it pulls ahead
    // in progress within the very first tick — targeting must follow
    // progress, not spawnX or spawn order.
    engine.startWave({
      wave: 1,
      spawns: [
        { spawnX: 0.9, enemyId: "bat", delayMs: 0 },
        { spawnX: 0.1, enemyId: "slime", delayMs: 0 },
      ],
    });
    const events = engine.tick(100);
    const attack = events.find((e) => e.type === "attack");
    expect(attack?.type).toBe("attack");
    const batId = engine.getSnapshot().enemies.find((e) => e.defId === "bat")?.instanceId;
    if (attack?.type === "attack") {
      expect(attack.targetIds).toEqual([batId]);
    }
  });

  it("lets the player pick any number of reward offers without forfeiting the rest", () => {
    const engine = new BattleEngine([monster({ anchor: { row: 0, col: 0 } })]);
    engine.startWave({ wave: 1, spawns: [{ spawnX: 0.5, enemyId: "slime", delayMs: 0 }] });
    runUntilNotBattle(engine);
    expect(engine.getSnapshot().phase).toBe("reward");

    const [first, second] = engine.getSnapshot().rewardOffer;
    engine.removeRewardOfferItem(first.offerId);
    expect(engine.getSnapshot().rewardOffer).toHaveLength(2);
    expect(engine.getSnapshot().phase).toBe("reward");

    engine.removeRewardOfferItem(second.offerId);
    expect(engine.getSnapshot().rewardOffer).toHaveLength(1);
    expect(engine.getSnapshot().phase).toBe("reward");
  });

  it("returns a dragged-off monster to the reward candidates instead of deleting it", () => {
    const engine = new BattleEngine([monster({ anchor: { row: 0, col: 0 } })]);
    engine.startWave({ wave: 1, spawns: [{ spawnX: 0.5, enemyId: "slime", delayMs: 0 }] });
    runUntilNotBattle(engine);
    expect(engine.getSnapshot().phase).toBe("reward");
    const before = engine.getSnapshot().rewardOffer.length;

    const ok = engine.returnToRewardOffer({ offerId: "returned-x", speciesId: "sparkit", level: 1 });
    expect(ok).toBe(true);
    expect(engine.getSnapshot().rewardOffer).toHaveLength(before + 1);
    expect(engine.getSnapshot().rewardOffer.some((o) => o.offerId === "returned-x")).toBe(true);
  });

  it("refuses to accept a returned monster outside the reward phase", () => {
    const engine = new BattleEngine([]);
    expect(engine.getSnapshot().phase).toBe("initial-placement");
    expect(engine.returnToRewardOffer({ offerId: "x", speciesId: "sparkit", level: 1 })).toBe(false);
  });

  it("merges two matching reward candidates directly, without touching the board", () => {
    const engine = new BattleEngine([monster({ anchor: { row: 0, col: 0 } })]);
    engine.startWave({ wave: 1, spawns: [{ spawnX: 0.5, enemyId: "slime", delayMs: 0 }] });
    runUntilNotBattle(engine);
    expect(engine.getSnapshot().phase).toBe("reward");

    engine.returnToRewardOffer({ offerId: "cand-a", speciesId: "sparkit", level: 1 });
    engine.returnToRewardOffer({ offerId: "cand-b", speciesId: "sparkit", level: 1 });
    const before = engine.getSnapshot().rewardOffer.length;

    const ok = engine.mergeRewardOfferItems("cand-a", "cand-b");
    expect(ok).toBe(true);
    const offer = engine.getSnapshot().rewardOffer;
    expect(offer).toHaveLength(before - 1);
    const merged = offer.find((o) => o.offerId === "cand-b");
    expect(merged?.level).toBe(2);
    expect(offer.some((o) => o.offerId === "cand-a")).toBe(false);
  });

  it("refuses to merge mismatched reward candidates", () => {
    const engine = new BattleEngine([monster({ anchor: { row: 0, col: 0 } })]);
    engine.startWave({ wave: 1, spawns: [{ spawnX: 0.5, enemyId: "slime", delayMs: 0 }] });
    runUntilNotBattle(engine);

    engine.returnToRewardOffer({ offerId: "cand-a", speciesId: "sparkit", level: 1 });
    engine.returnToRewardOffer({ offerId: "cand-b", speciesId: "ridgeback", level: 1 });
    expect(engine.mergeRewardOfferItems("cand-a", "cand-b")).toBe(false);
  });
});
