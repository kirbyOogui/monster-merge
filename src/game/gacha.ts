import { MONSTER_SPECIES } from "./monsters";
import { defaultRng, pickWeighted, type Rng } from "./rng";
import type { Level, RewardOfferEntry } from "./types";

/** Higher level = lower probability, per design ("高Lvは低確率"). Lv3's
 * share has been cut three times at the user's request (8 → 4 → 2 → 1),
 * making a Lv4 (only reachable by merging two hard-won Lv3s) a rarer,
 * more deliberate payoff instead of something that shows up often. Lv2
 * was cut alongside it this time too (27 → 20). */
const REWARD_LEVEL_WEIGHTS: [Level, number][] = [
  [1, 79],
  [2, 20],
  [3, 1],
];

export const REWARD_OFFER_SIZE = 3;
export const REROLL_COST = 40;

function randomSpeciesId(rng: Rng): string {
  const index = Math.floor(rng() * MONSTER_SPECIES.length);
  return MONSTER_SPECIES[Math.min(index, MONSTER_SPECIES.length - 1)].id;
}

function randomRewardLevel(rng: Rng): Level {
  return pickWeighted(REWARD_LEVEL_WEIGHTS, rng);
}

export function generateRewardOffer(rng: Rng = defaultRng): RewardOfferEntry[] {
  return Array.from({ length: REWARD_OFFER_SIZE }, (_, i) => ({
    offerId: `offer-${Date.now()}-${i}-${Math.floor(rng() * 1e6)}`,
    speciesId: randomSpeciesId(rng),
    level: randomRewardLevel(rng),
  }));
}

/** Always Lv1 so the initial 3 starting monsters can't roll a free head start. */
export function generateInitialMonsters(rng: Rng = defaultRng): RewardOfferEntry[] {
  return Array.from({ length: 3 }, (_, i) => ({
    offerId: `initial-${i}-${Math.floor(rng() * 1e6)}`,
    speciesId: randomSpeciesId(rng),
    level: 1 as Level,
  }));
}
