import type { Vec2 } from "@/game/types";

/**
 * Portrait layout: enemies spawn near the top and walk DOWN toward the
 * board, which sits near the bottom of the canvas ("味方は下側"). Enemies
 * scatter freely across a centered lane (see `LANE_X`/`LANE_PX` below,
 * narrower than the board) — every monster can threaten any enemy
 * regardless of column, so placement affects capacity/merging, not
 * defended zones.
 */
export const CELL = 64;
export const BOARD_PX = CELL * 4;
export const CANVAS_W = 380;
export const BOARD_X = (CANVAS_W - BOARD_PX) / 2;
/**
 * y of an enemy's transform origin (roughly its feet) the instant it
 * spawns. Enemy sprites are bottom-ish anchored (0.5 / 0.85) and much
 * taller than this point, so they extend well *above* it.
 *
 * This has been tuned back and forth: 20 left the body sitting above the
 * canvas top so an enemy only became fully visible a third of the way
 * down the road; 104 fixed that but pushed the whole enemy visibly down
 * into the upper-middle of the lane. This value splits the difference —
 * a normal-sized enemy's body clears the canvas top edge right at spawn
 * so it emerges just under the Wave/coins/kills panel (which shrinks to a
 * single row during battle, keeping that strip of background clear to
 * line up against — "コインとか表示してある枠の下くらい") while sitting
 * as high as it can without most of it being clipped. The biggest enemies
 * (troll/giant) still have their head/HP bar briefly clipped by the top
 * edge as they walk in. Lower this to raise the spawn further (more
 * clipping); raise it to drop the spawn.
 */
export const LANE_TOP_Y = 48;
export const BOARD_Y = 280;
export const CANVAS_H = BOARD_Y + BOARD_PX + 16;

/**
 * Horizontal band enemies actually walk within, decoupled from the
 * board/placement grid (`BOARD_X`/`BOARD_PX`) — a 2.5 : 5 : 2.5 split of
 * the canvas width (left tree margin : road : right tree margin, per the
 * user's spec), narrower than the board so the background road art (also
 * generated at this same width) has room on both sides for trees without
 * enemies visually running through them. The board itself is unaffected:
 * it's still the full 4-cell grid at its usual width/position, just wider
 * than this lane — outer columns end up placing monsters slightly past
 * the road's edge, which is fine since targeting already has "no lane
 * restriction" (any monster can threaten any enemy regardless of column).
 */
export const LANE_PX = CANVAS_W * 0.5;
export const LANE_X = (CANVAS_W - LANE_PX) / 2;

/**
 * Outside of battle, the tray (hand / reward candidates) is drawn in the
 * same band the enemy lanes occupy during battle — above the board, like
 * a staging area. Nothing extra is added below the board for it.
 *
 * All 3 candidates sit inside ONE shared frame (not one box per item),
 * and every candidate is drawn at the same fixed cell size (TRAY_CELL) —
 * no per-item scaling — so a 1x1 and an h3 read at a consistent scale.
 */
export const TRAY_X0 = 16;
// Kept where the enemy lane used to start (old LANE_TOP_Y 20 + 30), so
// moving the spawn point down (above) doesn't drag the out-of-battle tray
// down with it.
export const TRAY_Y = 50;
export const TRAY_CELL = 56;
export const TRAY_PAD = 4;
export const TRAY_ITEM_GAP = 4;
/** Extra vertical gap between wrapped rows when a row of candidates would
 * otherwise overflow the frame's width (see `syncTray` in GameCanvas). */
export const TRAY_ROW_GAP = 8;
export const TRAY_FRAME_W = CANVAS_W - TRAY_X0 * 2;

export function cellTopLeft(anchor: Vec2): { x: number; y: number } {
  return { x: BOARD_X + anchor.col * CELL, y: BOARD_Y + anchor.row * CELL };
}

/** Maps a scattered spawn fraction (0..1) to an x position across the enemy lane's width. */
export function pathX(spawnX: number): number {
  return LANE_X + spawnX * LANE_PX;
}

/** y position for progress 0 (spawn, far/top) .. 1 (reaches the board's top edge). */
export function pathY(progress: number): number {
  return LANE_TOP_Y + progress * (BOARD_Y - LANE_TOP_Y);
}

export function pixelToCell(x: number, y: number): Vec2 {
  return {
    row: Math.floor((y - BOARD_Y) / CELL),
    col: Math.floor((x - BOARD_X) / CELL),
  };
}
