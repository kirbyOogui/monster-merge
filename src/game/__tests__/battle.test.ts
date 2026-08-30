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
    // Not necessarily a *flawless* defense anymore: MIN_ATTACKABLE_PROGRESS
    // (0.55, raised so enemies stay visible longer before becoming
    // targetable — see battle.ts) leaves a single Lv1 1x1's slow DPS little
    // margin against a full-speed slime, so one breach tick can land before
    // the kill lands. The point of this test is cross-board targeting
    // (col 3 monster vs. a far-left spawn), not a zero-leak guarantee.
    expect(snapshot.baseHp).toBeGreaterThan(BASE_MAX_HP - 100);
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

  it("spaces the dragon boss's repeated breach hits out further than the default 1s interval", () => {
    const engine = new BattleEngine([]);
    const wave: WaveDefinition = {
      wave: 1,
      spawns: [{ spawnX: 0.5, enemyId: "dragon", delayMs: 0 }],
    };
    engine.startWave(wave);
    // One big tick both walks it all the way to the base (dragon's
    // baseSpeed needs ~20s of simulated time) and lands its first breach
    // hit, matching the "single large tick" pattern used elsewhere in this
    // file rather than looping many small ones.
    engine.tick(20500);
    const hpAfterBreach = engine.getSnapshot().baseHp;
    expect(hpAfterBreach).toBeLessThan(BASE_MAX_HP);

    // The default 1s interval every other enemy re-attacks on — dragon's
    // own `attackIntervalMs` override (3000ms) means it must NOT have
    // re-hit yet.
    engine.tick(1000);
    expect(engine.getSnapshot().baseHp).toBe(hpAfterBreach);

    // Now past its own interval.
    engine.tick(2500);
    expect(engine.getSnapshot().baseHp).toBeLessThan(hpAfterBreach);
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
    // Enemies only become attackable once they've walked past
    // MIN_ATTACKABLE_PROGRESS (0.55) — orc's speed needs ~6.1s of simulated
    // time to get there, so a single big tick stands in for "wait until
    // they're within range" rather than the old "attackable the instant
    // they spawn".
    const events = engine.tick(7000);
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
    // See the v2 test above: needs enough simulated time for orc to cross
    // MIN_ATTACKABLE_PROGRESS before either becomes targetable.
    const events = engine.tick(7000);
    const attackEvents = events.filter((e) => e.type === "attack");
    expect(attackEvents).toHaveLength(1);
    expect(attackEvents[0].targetIds).toHaveLength(2);
  });

  it("always focuses the frontmost enemy (highest progress) first, regardless of spawn position", () => {
    const engine = new BattleEngine([monster({ shape: "1x1", anchor: { row: 0, col: 0 } })]);
    // Same spawn time, but "bat" is faster than "slime" so it pulls ahead
    // in progress — targeting must follow progress, not spawnX or spawn
    // order. 3000ms is enough for bat to cross MIN_ATTACKABLE_PROGRESS
    // (0.55) while slime (slower) is still below it, which also reinforces
    // that only the attackable one is even a candidate.
    engine.startWave({
      wave: 1,
      spawns: [
        { spawnX: 0.9, enemyId: "bat", delayMs: 0 },
        { spawnX: 0.1, enemyId: "slime", delayMs: 0 },
      ],
    });
    const events = engine.tick(3000);
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

  it("lets a monster that survived a wave attack right away in the next one", () => {
    // Regression for the stale-timer bug called out in startWave: a
    // monster carried over between waves kept its `lastAttackAt` timestamp
    // from deep in the previous wave's `elapsedMs`, so the cooldown check
    // stayed negative and locked it out of attacking until the new wave's
    // clock climbed back past that leftover value.
    const engine = new BattleEngine([monster({ shape: "h2", anchor: { row: 0, col: 0 } })]);

    // Wave 1: a tank the monster can't clear, run long so `elapsedMs`
    // (and the monster's last-fire timestamp) end up large.
    engine.startWave({ wave: 1, spawns: [{ spawnX: 0.5, enemyId: "giant", delayMs: 0 }] });
    for (let i = 0; i < 40; i++) engine.tick(500); // ~20s simulated

    // Wave 2: fresh enemy, well within attackable range after one big tick.
    engine.startWave({ wave: 2, spawns: [{ spawnX: 0.5, enemyId: "giant", delayMs: 0 }] });
    engine.tick(100); // enemy not down the lane far enough yet
    const events = engine.tick(8000); // now past MIN_ATTACKABLE_PROGRESS
    expect(events.some((e) => e.type === "attack")).toBe(true);
  });

  it("won't target an enemy that hasn't walked far enough down the lane", () => {
    const engine = new BattleEngine([monster({ shape: "h2", anchor: { row: 0, col: 0 } })]);
    engine.startWave({ wave: 1, spawns: [{ spawnX: 0.5, enemyId: "slime", delayMs: 0 }] });

    // slime is slow — 1s is well short of MIN_ATTACKABLE_PROGRESS.
    const early = engine.tick(1000);
    expect(early.some((e) => e.type === "attack")).toBe(false);
    expect(engine.getSnapshot().enemies[0].progress).toBeLessThan(0.25);

    // Give it time to cross the threshold — now it's a valid target.
    const later = engine.tick(3000);
    expect(later.some((e) => e.type === "attack")).toBe(true);
  });

  it("spreads several monsters' attacks across several enemies instead of dogpiling one", () => {
    const engine = new BattleEngine([
      monster({ instanceId: "a", shape: "1x1", anchor: { row: 0, col: 0 } }),
      monster({ instanceId: "b", shape: "1x1", anchor: { row: 0, col: 1 } }),
      monster({ instanceId: "c", shape: "1x1", anchor: { row: 0, col: 2 } }),
    ]);
    engine.startWave({
      wave: 1,
      spawns: [
        { spawnX: 0.2, enemyId: "orc", delayMs: 0 },
        { spawnX: 0.5, enemyId: "orc", delayMs: 0 },
        { spawnX: 0.8, enemyId: "orc", delayMs: 0 },
      ],
    });
    const events = engine.tick(7000); // all orcs attackable, all monsters off cooldown
    const hit = new Set(events.flatMap((e) => (e.type === "attack" ? e.targetIds : [])));
    expect(hit.size).toBeGreaterThan(1);
  });

  it("clears a removed monster's attack cooldown so re-adding its id starts fresh", () => {
    const engine = new BattleEngine([monster({ instanceId: "x", shape: "h2", anchor: { row: 0, col: 0 } })]);
    engine.startWave({ wave: 1, spawns: [{ spawnX: 0.5, enemyId: "troll", delayMs: 0 }] });
    engine.tick(7000); // "x" fires; troll (350hp) survives; lastAttackAt["x"] ~= 7000

    engine.setBoard([]); // prune lastAttackAt["x"]
    engine.setBoard([monster({ instanceId: "x", shape: "h2", anchor: { row: 1, col: 0 } })]);

    // Tiny tick: if the stale ~7000 cooldown had survived the prune,
    // elapsedMs is barely past it and no attack would fire.
    const events = engine.tick(50);
    expect(events.some((e) => e.type === "attack")).toBe(true);
  });

  it("still lets a monster finish off an enemy that has already breached the base", () => {
    // A slow h2/Lv3 vs a tanky troll: the troll reaches the base and
    // starts re-attacking (hasBreached) well before the monster can grind
    // it down — but it stays a valid target and the monster still kills it.
    const engine = new BattleEngine([monster({ shape: "h2", level: 3, anchor: { row: 0, col: 0 } })], mulberry32(5));
    engine.startWave({ wave: 1, spawns: [{ spawnX: 0.5, enemyId: "troll", delayMs: 0 }] });

    let sawBreach = false;
    for (let i = 0; i < 400 && engine.getSnapshot().phase === "battle"; i++) {
      const events = engine.tick(100);
      if (events.some((e) => e.type === "breach")) sawBreach = true;
    }

    const snap = engine.getSnapshot();
    expect(sawBreach).toBe(true);
    expect(snap.enemies).toHaveLength(0); // the parked troll was killed, not left forever
    expect(snap.killCount).toBe(1);
    expect(snap.phase).toBe("reward");
  });

  it("refuses a reroll outside the reward phase", () => {
    const engine = new BattleEngine([]);
    expect(engine.spendReroll()).toBe(false); // initial-placement
    engine.startWave({ wave: 1, spawns: [{ spawnX: 0.5, enemyId: "slime", delayMs: 0 }] });
    expect(engine.spendReroll()).toBe(false); // battle
  });

  it("spends coins and replaces the offer on a reward-phase reroll", () => {
    const engine = new BattleEngine(
      [
        monster({ instanceId: "m1", shape: "h3", level: 4, anchor: { row: 0, col: 0 } }),
        monster({ instanceId: "m2", shape: "h3", level: 4, anchor: { row: 1, col: 0 } }),
      ],
      mulberry32(1),
    );
    engine.startWave({
      wave: 1,
      spawns: Array.from({ length: 40 }, (_, i) => ({ spawnX: (i % 5) / 5, enemyId: "goblin" as const, delayMs: i * 30 })),
    });
    runUntilNotBattle(engine, 100, 800);
    const snap = engine.getSnapshot();
    expect(snap.phase).toBe("reward");
    expect(snap.coins).toBe(80); // deterministic under mulberry32(1)

    const offerBefore = snap.rewardOffer.map((o) => o.offerId).join(",");
    expect(engine.spendReroll()).toBe(true);
    expect(engine.getSnapshot().coins).toBe(80 - 40);
    expect(engine.getSnapshot().rewardOffer.map((o) => o.offerId).join(",")).not.toBe(offerBefore);

    // Second reroll: only 40 left, exactly the cost — still affordable.
    expect(engine.spendReroll()).toBe(true);
    expect(engine.getSnapshot().coins).toBe(0);
    // Third: broke now.
    expect(engine.spendReroll()).toBe(false);
    expect(engine.getSnapshot().coins).toBe(0);
  });
});
