import { BOARD_SIZE, type Vec2 } from "@/game/types";

/**
 * Portrait layout: enemies spawn near the top and walk DOWN toward the
 * board, which sits near the bottom of the canvas ("味方は下側"). Enemies
 * scatter freely across a centered lane (see `LANE_X`/`LANE_PX` below,
 * narrower than the board) — every monster can threaten any enemy
 * regardless of column, so placement affects capacity/merging, not
 * defended zones.
 */
export const CELL = 64;
export const BOARD_PX = CELL * BOARD_SIZE;
export const CANVAS_W = 380;
export const BOARD_X = (CANVAS_W - BOARD_PX) / 2;

/**
 * Extra canvas drawn ABOVE where the play area used to begin, so enemies
 * can spawn up against the bottom of the Wave/coins/kills panel.
 *
 * The panel's reserved height is locked to its tallest variant (the
 * reward/placement layout, ~98px — see the spacer in game/page.tsx), but
 * during battle it collapses to a single Wave/coins/kills row (~34px),
 * leaving ~64px of empty background between it and the old canvas top.
 * Every earlier attempt just moved the spawn point around *inside* the
 * canvas, which starts below that gap — so a spawned enemy could never
 * visually reach up to the shrunken battle panel ("戦闘中は縦短くなって
 * るからそれに合わせて"). This grows the canvas upward by that much
 * instead; `game/page.tsx` pulls the canvas element up by the same amount
 * (negative margin) so the board, tray and HP bar stay pixel-for-pixel
 * where they were in every phase — only the enemy lane gains the height.
 */
export const SPAWN_HEADROOM = 74;

/**
 * y of an enemy's transform origin (roughly its feet) the instant it
 * spawns. Enemy sprites are bottom-ish anchored (0.5 / 0.85) and taller
 * than this offset, so they extend above it — this is ~one sprite-height
 * so a normal enemy's whole body clears the canvas top (now raised by
 * `SPAWN_HEADROOM`) and it emerges right under the collapsed battle
 * panel. Biggest enemies (troll/giant) still clip their head/HP bar for
 * the first moment. Raise to drop the spawn; lower to raise it (more
 * clipping).
 */
export const LANE_TOP_Y = 64;
export const BOARD_Y = 280 + SPAWN_HEADROOM;
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
// 50 in the pre-`SPAWN_HEADROOM` coordinate space; offset by the headroom
// so the tray stays visually pinned (the canvas element is pulled up by
// `SPAWN_HEADROOM` in game/page.tsx) rather than sliding up into the
// panel with the raised canvas top.
export const TRAY_Y = 50 + SPAWN_HEADROOM;
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
