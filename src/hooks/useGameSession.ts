"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { BattleEngine, type GameRunState } from "@/game/battle";
import {
  drawInitialHand,
  moveBoardMonster,
  placeFromTray,
  placedMonsterToRewardEntry,
  placedMonsterToTrayItem,
  toTrayItem,
  tryMergeTrayItems,
  type TrayItem,
} from "@/game/session";
import type { Vec2 } from "@/game/types";
import { generateWave } from "@/game/waves";

/** Outcome of a drag-drop, distinguishing a merge from a plain
 * placement/move — the view layer uses this to know when to play the
 * "合体" glow effect (only on an actual merge, not every successful drop). */
export type DropOutcome = "placed" | "merged" | "moved" | "failed";

export interface GameSession {
  snapshot: GameRunState;
  /** Reads the engine's *current* state directly, bypassing React —
   * `snapshot` above is only as fresh as the last completed render, which
   * is stale-by-one-frame when read immediately after `tick()` from
   * inside the Pixi ticker callback (that callback runs outside React's
   * render cycle, so no re-render has landed yet within the same call).
   * That staleness doesn't matter for continuously-interpolated values
   * (positions, HP bars — a frame of lag is invisible), but it silently
   * breaks one-shot event matching: an enemy's `enemyKilled` event fires
   * exactly once on the tick its hp hits 0, and if the renderer checks
   * `snapshot.enemies` before React has caught up, that enemy still
   * appears "alive" for one extra frame — by the time it finally drops
   * out of the stale `snapshot`, the matching kill event is long gone,
   * so the death is treated as a plain removal instead of a kill (no
   * grayscale/fade). Call this instead of reading `snapshot` for any
   * post-`tick()` read within the same synchronous frame. */
  getSnapshot: () => GameRunState;
  tray: TrayItem[];
  canStartFirstWave: boolean;
  placeTrayItem: (item: TrayItem, anchor: Vec2) => DropOutcome;
  /** Merges one tray/candidate item into another matching one, before
   * either touches the board. */
  mergeTrayItems: (draggedOfferId: string, targetOfferId: string) => boolean;
  moveMonster: (instanceId: string, anchor: Vec2) => DropOutcome;
  /** Drags a placed monster back into the tray: returns it to hand during
   * initial placement, or back into the reward candidates during the
   * reward phase. Returns false (caller should snap it back) when there's
   * no tray to rejoin, e.g. mid-battle. */
  discardMonster: (instanceId: string) => boolean;
  startFirstWave: () => void;
  reroll: () => boolean;
  nextWave: () => void;
  tick: (dtMs: number) => ReturnType<BattleEngine["tick"]>;
  resetRun: () => void;
}

export function useGameSession(): GameSession {
  const [engine, setEngine] = useState<BattleEngine>(() => new BattleEngine([]));

  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const [initialHand, setInitialHand] = useState<TrayItem[]>(() => drawInitialHand());

  const tray: TrayItem[] = useMemo(() => {
    if (snapshot.phase === "initial-placement") return initialHand;
    if (snapshot.phase === "reward") return snapshot.rewardOffer.map(toTrayItem);
    return [];
  }, [snapshot.phase, snapshot.rewardOffer, initialHand]);

  const placeTrayItem = useCallback(
    (item: TrayItem, anchor: Vec2): DropOutcome => {
      const result = placeFromTray(engine.getBoard(), item, anchor);
      if (!result.ok) return "failed";
      engine.setBoard(result.board);

      if (snapshot.phase === "initial-placement") {
        setInitialHand((hand) => hand.filter((i) => i.offerId !== item.offerId));
      } else if (snapshot.phase === "reward") {
        // Any number of the offered monsters can be taken — placing one
        // only removes that one, the rest stay pickable.
        engine.removeRewardOfferItem(item.offerId);
      }
      return result.kind;
    },
    [engine, snapshot.phase],
  );

  const mergeTrayItems = useCallback(
    (draggedOfferId: string, targetOfferId: string): boolean => {
      if (draggedOfferId === targetOfferId) return false;

      if (snapshot.phase === "initial-placement") {
        // Computed synchronously from the current `initialHand` (not via a
        // setState updater) so the boolean result is accurate immediately —
        // updater functions run at the next render, too late for the
        // caller to decide whether to snap the drag back.
        const dragged = initialHand.find((i) => i.offerId === draggedOfferId);
        const target = initialHand.find((i) => i.offerId === targetOfferId);
        if (!dragged || !target) return false;
        const result = tryMergeTrayItems(target, dragged);
        if (!result) return false;
        setInitialHand(
          initialHand.filter((i) => i.offerId !== draggedOfferId && i.offerId !== targetOfferId).concat(result),
        );
        return true;
      }

      if (snapshot.phase === "reward") {
        return engine.mergeRewardOfferItems(draggedOfferId, targetOfferId);
      }

      return false;
    },
    [engine, snapshot.phase, initialHand],
  );

  const moveMonster = useCallback(
    (instanceId: string, anchor: Vec2): DropOutcome => {
      // Board layout is locked once combat starts ("バトル中は位置を変える
      // ことはできないように") — only valid during placement/reward, where
      // there's no active fight to exploit mid-battle repositioning in.
      if (snapshot.phase === "battle") return "failed";
      const result = moveBoardMonster(engine.getBoard(), instanceId, anchor);
      if (!result.ok) return "failed";
      engine.setBoard(result.board);
      return result.kind;
    },
    [engine, snapshot.phase],
  );

  const discardMonster = useCallback(
    (instanceId: string): boolean => {
      const board = engine.getBoard();
      const monster = board.find((m) => m.instanceId === instanceId);
      if (!monster) return false;

      if (snapshot.phase === "initial-placement") {
        engine.setBoard(board.filter((m) => m.instanceId !== instanceId));
        setInitialHand((hand) => [...hand, placedMonsterToTrayItem(monster)]);
        return true;
      }
      if (snapshot.phase === "reward") {
        if (!engine.returnToRewardOffer(placedMonsterToRewardEntry(monster))) return false;
        engine.setBoard(board.filter((m) => m.instanceId !== instanceId));
        return true;
      }
      // No tray to rejoin mid-battle (or after game over) — refuse the drop.
      return false;
    },
    [engine, snapshot.phase],
  );

  const startFirstWave = useCallback(() => {
    engine.startWave(generateWave(1));
  }, [engine]);

  const reroll = useCallback((): boolean => engine.spendReroll(), [engine]);

  const nextWave = useCallback(() => {
    engine.clearRewardOffer();
    engine.startWave(generateWave(snapshot.wave + 1));
  }, [engine, snapshot.wave]);

  const tick = useCallback((dtMs: number) => engine.tick(dtMs), [engine]);

  const resetRun = useCallback(() => {
    setEngine(new BattleEngine([]));
    setInitialHand(drawInitialHand());
  }, []);

  return {
    snapshot,
    getSnapshot: engine.getSnapshot,
    tray,
    canStartFirstWave: snapshot.phase === "initial-placement" && initialHand.length === 0,
    placeTrayItem,
    mergeTrayItems,
    moveMonster,
    discardMonster,
    startFirstWave,
    reroll,
    nextWave,
    tick,
    resetRun,
  };
}
