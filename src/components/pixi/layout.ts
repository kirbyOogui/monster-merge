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
 * taller than this point, so they extend well *above* it — at the old
 * value of 20 the whole body sat above the canvas top and an enemy only
 * became fully visible once it had walked a third of the way down the
 * road, reading as "spawning in the middle of the lane". Pushed down so a
 * normal-sized enemy is entirely on-screen the moment it appears, right
 * under the Wave/coins/kills panel — which shrinks to a single row during
 * battle, leaving that strip of background clear for the spawn to line up
 * against ("コインとか表示してある枠の下くらい"). Trade-off: the walk
 * lane (BOARD_Y - LANE_TOP_Y) is correspondingly shorter, so enemies
 * reach the base sooner in real time; the biggest enemies (troll/giant)
 * still have their HP bar clipped by the canvas edge for the first
 * fraction of a second after spawning.
 */
export const LANE_TOP_Y = 104;
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
