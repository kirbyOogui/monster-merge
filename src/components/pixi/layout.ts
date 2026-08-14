import type { Vec2 } from "@/game/types";

/**
 * Portrait layout: enemies spawn near the top and walk DOWN toward the
 * board, which sits near the bottom of the canvas ("味方は下側"). Enemies
 * scatter freely across the board's width (no lane grid) — every monster
 * can threaten any enemy, so placement affects capacity/merging, not
 * defended zones.
 */
export const CELL = 64;
export const BOARD_PX = CELL * 4;
export const CANVAS_W = 380;
export const BOARD_X = (CANVAS_W - BOARD_PX) / 2;
export const LANE_TOP_Y = 20;
export const BOARD_Y = 280;
export const CANVAS_H = BOARD_Y + BOARD_PX + 16;

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
export const TRAY_Y = LANE_TOP_Y + 30;
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

/** Maps a scattered spawn fraction (0..1) to an x position across the board's width. */
export function pathX(spawnX: number): number {
  return BOARD_X + spawnX * BOARD_PX;
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
