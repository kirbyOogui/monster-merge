"use client";

import { useEffect, useRef, useState } from "react";
import {
  Application,
  Assets,
  ColorMatrixFilter,
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import gsap from "gsap";
import type { GameSession } from "@/hooks/useGameSession";
import { clampAnchor, tryMergeTrayItems, type TrayItem } from "@/game/session";
import { MONSTER_SPECIES, getSpecies } from "@/game/monsters";
import { ENEMY_DEFS, ENEMY_IDS } from "@/game/enemies";
import { canPlace, findMonsterAtCell } from "@/game/board";
import { canMerge, maxLevelForSpecies } from "@/game/merge";
import { SHAPES, occupiedCells, shapeExtent } from "@/game/shapes";
import type { EnemyInstance, PlacedMonster, ShapeId, Vec2 } from "@/game/types";
import {
  BOARD_PX,
  BOARD_X,
  BOARD_Y,
  CANVAS_H,
  CANVAS_W,
  CELL,
  TRAY_CELL,
  TRAY_FRAME_W,
  TRAY_ITEM_GAP,
  TRAY_PAD,
  TRAY_ROW_GAP,
  TRAY_X0,
  TRAY_Y,
  cellTopLeft,
  pathX,
  pathY,
  pixelToCell,
} from "./layout";

interface Props {
  session: GameSession;
}

interface DragState {
  kind: "board" | "tray";
  instanceId?: string;
  item?: TrayItem;
  shape: ShapeId;
  container: Container;
  grabOffsetPx: { x: number; y: number };
  originPx: { x: number; y: number };
}

const BOARD_TILE_MARGIN = 4;
/** Tray shapes are drawn at a small, uniform cell size (TRAY_CELL) — no
 * per-item scaling — so every candidate reads at the same scale
 * regardless of its shape ("マスの大きさは統一させて"). */
const TRAY_TILE_MARGIN = 3;

function shapeSizePx(shape: ShapeId, cellSize: number, margin: number): { w: number; h: number } {
  const { rows, cols } = shapeExtent(shape);
  return { w: cols * cellSize - margin, h: rows * cellSize - margin };
}

/** Screen-space launch point for a board monster's attack projectile —
 * approximates the mouth rather than the tile's geometric center, so the
 * projectile visually originates from the character instead of floating
 * out of empty tile space. Every species' art is generated facing East
 * only (the established PixelLab direction convention) with a tall,
 * bottom-anchored, oversized sprite (`MONSTER_SIZE_BOOST`) spilling upward
 * out of its tile, so the head/mouth sits toward the upper-right of the
 * tile rather than dead-center — offsetting there instead of using the
 * exact centroid is a deliberate approximation, not per-species metadata,
 * since sprite art doesn't expose an actual mouth anchor point. */
function monsterAttackOriginPx(m: PlacedMonster): { x: number; y: number } {
  const { x, y } = cellTopLeft(m.anchor);
  const { w, h } = shapeSizePx(m.shape, CELL, BOARD_TILE_MARGIN);
  return { x: x + w * 0.82, y: y + h * 0.28 };
}

/** Enemy sprite art, keyed by `defId`. Enemies always face South (toward
 * the camera/board, matching their walk-down-the-screen direction) rather
 * than the East-only convention used for friendly monsters. Any enemy
 * without matching PNGs on disk simply 404s and falls back to a plain
 * colored circle. */
const ENEMY_SPRITE_PATHS: Record<string, string> = Object.fromEntries(
  ENEMY_IDS.map((id) => [id, `/assets/enemies/${id}.png`]),
);
const ENEMY_DEFAULT_FRAME_COUNT = 5;

/** slime's redesign (rounder, warmer-faced — see the `sizeScale` comment
 * on `EnemyDef`) landed with 9 frames per animation instead of the usual
 * 5, since its Frame Count slider wouldn't respond to keyboard input
 * during generation (the same intermittent PixelLab UI glitch hit before
 * on bouldros_lv4's idle) and the default of 8+keep-first got submitted
 * before that was noticed. troll was generated from PixelLab's newer
 * preset library ("Running (4 frames)" / "Cross Punch") instead of the
 * older Custom Animation V3 flow the first 4 enemies used, and those
 * presets don't share a frame count with each other, let alone the old
 * default — hence a per-kind override instead of one number per enemy. */
const ENEMY_FRAME_COUNT_OVERRIDES: Partial<Record<string, number | Partial<Record<"walk" | "attack", number>>>> = {
  slime: 9,
  troll: { walk: 4, attack: 6 },
  giant: { walk: 4, attack: 6 },
};
function enemyAnimFramePaths(enemyId: string, kind: "walk" | "attack"): string[] {
  const override = ENEMY_FRAME_COUNT_OVERRIDES[enemyId];
  const count = (typeof override === "number" ? override : override?.[kind]) ?? ENEMY_DEFAULT_FRAME_COUNT;
  return Array.from({ length: count }, (_, i) => `/assets/enemies/${enemyId}_${kind}_${i}.png`);
}
interface EnemyAnim {
  walk: Texture[];
  attack: Texture[];
}

/** Real sprite art, keyed `${speciesId}_lv${level}`. Lv1-Lv4 exist for every
 * species; Lv5 only exists for non-1x1 species (sparkit caps at Lv4 — see
 * `maxLevelForSpecies`), so the level list is capped per-species instead of
 * blindly requesting a `sparkit_lv5.png` that will never exist. Any
 * species/level still missing its PNG on disk simply 404s (caught below
 * during load) and falls back to the procedural `drawBody` placeholder. */
const SPRITE_LEVELS = [1, 2, 3, 4, 5] as const;
const SPECIES_SPRITE_PATHS: Record<string, string> = Object.fromEntries(
  MONSTER_SPECIES.flatMap((s) =>
    SPRITE_LEVELS.filter((lv) => lv <= maxLevelForSpecies(s.id)).map((lv) => [
      `${s.id}_lv${lv}`,
      `/assets/monsters/${s.id}_lv${lv}.png`,
    ]),
  ),
);

function getMonsterTexture(textures: Map<string, Texture>, speciesId: string, level: number): Texture | undefined {
  return textures.get(`${speciesId}_lv${level}`);
}

type ImpactKind = "burst" | "bolt" | "shard";
/** Shape drawn for the in-flight projectile itself (separate from the
 * impact `kind`, since e.g. fire and nature both use a plain "burst"
 * impact but should look nothing alike while flying). */
type ProjectileShape = "flame" | "spark" | "ice" | "leaf" | "crystal";
interface ImpactStyle {
  primary: number;
  secondary: number;
  kind: ImpactKind;
  projectile: ProjectileShape;
}

/** Species-flavored hit-effect look, keyed by speciesId — matches each
 * species' elemental theme (fire/thunder/ice/nature/crystal) established
 * in the PixelLab art. Purely a rendering hint for `spawnAttackEffect` /
 * `spawnProjectile`. */
const SPECIES_IMPACT_STYLE: Record<string, ImpactStyle> = {
  sparkit: { primary: 0xff7a29, secondary: 0xffe08a, kind: "burst", projectile: "flame" },
  ridgeback: { primary: 0xffe14e, secondary: 0x4ea8ff, kind: "bolt", projectile: "spark" },
  longneck: { primary: 0x9fe3ff, secondary: 0xffffff, kind: "shard", projectile: "ice" },
  serpentail: { primary: 0x6fcf58, secondary: 0xd9f2b4, kind: "burst", projectile: "leaf" },
  bouldros: { primary: 0xb388ff, secondary: 0x5ef0d0, kind: "shard", projectile: "crystal" },
};
const DEFAULT_IMPACT_STYLE: ImpactStyle = {
  primary: 0xffffff,
  secondary: 0xd8d8d8,
  kind: "burst",
  projectile: "spark",
};

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

interface SpeciesAnim {
  idle: Texture[];
  attack: Texture[];
}

/** Idle-breathing loop and ranged-attack frame sequence, keyed by
 * `${speciesId}_lv${level}`. Only species/levels with a generated frame
 * set on disk get an entry — anything missing simply 404s (caught below
 * during load) and that species/level falls back to the static sprite
 * with no animation. */
/** Frame count per level/kind. Lv4 and Lv5's attacks were both generated via
 * Custom Animation V3 on an enlarged 172×172 canvas (vs. the 132×132 used for
 * everything else) — PixelLab's own in-app guidance steers Pro-model
 * requests back to V3 ("usually produces better results and costs less"),
 * and V3 still supports up to 16 frames on the larger canvas, so the extra
 * canvas room for the full-body effect came without switching engines.
 * 8 frames + keep-first = 9 total, vs. 5 (4+keep-first) everywhere else. */
const DEFAULT_FRAME_COUNT = 5;
const FRAME_COUNT_OVERRIDES: Partial<Record<number, Partial<Record<"idle" | "attack", number>>>> = {
  4: { attack: 9 },
  5: { attack: 9 },
};
/** bouldros_lv4's idle came out at 9 frames instead of the usual 5 — its
 * frame-count slider wouldn't respond to keyboard input during generation
 * (a one-off PixelLab UI glitch), and the default of 8+keep-first got
 * submitted before that was noticed. Keyed by `${speciesId}_lv${level}`
 * since this is a one-off exception, not a level-wide rule like the attack
 * override above. */
const SPECIES_FRAME_COUNT_OVERRIDES: Partial<Record<string, Partial<Record<"idle" | "attack", number>>>> = {
  bouldros_lv4: { idle: 9 },
};
const ANIM_LEVELS = [1, 2, 3, 4, 5] as const;
function animFramePaths(speciesId: string, level: number, kind: "idle" | "attack"): string[] {
  const prefix = level === 1 ? `${speciesId}_${kind}` : `${speciesId}_lv${level}_${kind}`;
  const count =
    SPECIES_FRAME_COUNT_OVERRIDES[`${speciesId}_lv${level}`]?.[kind] ??
    FRAME_COUNT_OVERRIDES[level]?.[kind] ??
    DEFAULT_FRAME_COUNT;
  return Array.from({ length: count }, (_, i) => `/assets/monsters/${prefix}_${i}.png`);
}

/** Monsters (board and tray alike) render larger than their tile footprint
 * (`tileW`/`tileH`) and are anchored bottom-center on it, so the extra size
 * spills upward out of the tile (never sideways or downward) — the
 * character's "feet" stay planted on its actual grid cell while its
 * silhouette can be bigger than the cell itself. Re-running this after
 * swapping `sprite.texture` is required, not optional — Pixi doesn't
 * auto-rescale on texture swap, and animation-frame exports use a larger
 * padded canvas than the static artwork (extra room for the attack motion
 * to play out), so without a re-fit each frame swap the character
 * silhouette renders inconsistently sized against the tile. */
const MONSTER_SIZE_BOOST = 1.5;
/** `boxW`/`boxH` are the already-boosted target box (tile size × any
 * per-axis compensation) — kept separate from `tileW`/`tileH` (the real
 * tile footprint, used only for the anchor point) so that a compensation
 * ratio applying to only one axis (e.g. an attack-frame canvas that's
 * wider but not taller than the static art) can't also balloon the other
 * axis: `fitMonsterSpriteToTile` used to take a single isotropic
 * `sizeBoost` scalar multiplying both box dimensions, which made
 * width-only padding growth in one frame (e.g. a wide horizontal
 * projectile-throw canvas) inflate the sprite's *height* too — visually
 * the character's standing position floated far above its actual tile. */
/** 1x1/2x2 are square footprints with no "walking lane" direction to read
 * as grounded, so a bottom anchor just reads as floating in empty space
 * above — centering the boosted sprite in the tile looks balanced instead.
 * h2/v2/h3 keep the bottom anchor (feet flush with the tile's bottom edge). */
function isSquareShape(shape: ShapeId): boolean {
  return shape === "1x1" || shape === "2x2";
}
function fitMonsterSpriteToTile(
  sprite: Sprite,
  tileW: number,
  tileH: number,
  boxW: number,
  boxH: number,
  centerVertically: boolean,
  compH: number = 1,
) {
  const scale = Math.min(boxW / sprite.texture.width, boxH / sprite.texture.height);
  sprite.width = sprite.texture.width * scale;
  sprite.height = sprite.texture.height * scale;
  sprite.x = (tileW - sprite.width) / 2;
  // Animation-frame canvases pad the character with extra transparent
  // room on every side (room for the motion to play out), not just the
  // axis `compH` measures — so bottom-anchoring the *canvas* rather than
  // the character within it leaves that extra bottom padding as dead
  // space under the tile line, and the character reads as floating above
  // where it should stand (worst on 1-row-tall shapes like h3, where the
  // padded box is much taller than the tile to begin with). Assuming the
  // padding splits roughly evenly top/bottom, shift the anchor down by
  // half of the height inflation `compH` introduced, landing the
  // character's actual feet back at the tile line instead of the canvas's.
  const padBottom = !centerVertically && compH > 1 ? (sprite.height * (1 - 1 / compH)) / 2 : 0;
  sprite.y = centerVertically ? (tileH - sprite.height) / 2 : tileH - sprite.height + padBottom;
}
function createMonsterSprite(
  texture: Texture,
  tileW: number,
  tileH: number,
  boxW: number,
  boxH: number,
  centerVertically: boolean,
  compH: number = 1,
): Sprite {
  const sprite = new Sprite(texture);
  fitMonsterSpriteToTile(sprite, tileW, tileH, boxW, boxH, centerVertically, compH);
  return sprite;
}

/** Draws one tile per occupied cell (not a single merged block), so the
 * underlying grid seams stay visible through/around the monster. */
/** Border/glow treatment per level — since two adjacent levels' sprite art
 * can end up looking very close (same species, similar pose/coloring), the
 * frame around the tile itself carries the "this leveled up" signal so it
 * reads clearly even when the artwork alone doesn't ("枠内で見た目変わる
 * ように"). Level 1 stays the plain near-black outline (baseline/no tier
 * yet); bronze→silver→gold progress through 2-4. Level 5 (the new
 * evolution-line final form, non-1x1 species only) reads as a tier past
 * gold — a vivid mythic magenta/violet instead of another metal — so it's
 * unmistakably the top of the ladder even at a glance. */
const LEVEL_BORDER_STYLE: Record<number, { stroke: number; glow: number | null }> = {
  1: { stroke: 0x0b1118, glow: null },
  2: { stroke: 0xcd7f32, glow: 0xcd7f32 },
  3: { stroke: 0xe0e0e0, glow: 0xe0e0e0 },
  4: { stroke: 0xffd24d, glow: 0xffd24d },
  5: { stroke: 0xff2df5, glow: 0xff2df5 },
};

/** 1x1 (sparkit) has no Lv5 evolution, so its Lv4 *is* its true max — the
 * level badge reads "LvMAX" there instead of "Lv4" so it doesn't look like
 * an arbitrary stop partway up the same ladder every other shape climbs to
 * Lv5 ("1×1のモンスターはレベル４になったらLvMAX表記になるように"). */
function levelLabelText(shape: ShapeId, level: number): string {
  return shape === "1x1" && level >= 4 ? "LvMAX" : `Lv${level}`;
}

function drawBody(g: Graphics, shape: ShapeId, color: number, cellSize: number, margin: number, alpha = 1, level = 1) {
  g.clear();
  const tile = cellSize - margin;
  const radius = Math.max(2, tile * 0.14);
  const style = LEVEL_BORDER_STYLE[level] ?? LEVEL_BORDER_STYLE[1];
  const strokeWidth = Math.max(1, tile * (level >= 5 ? 0.09 : level >= 2 ? 0.07 : 0.035));
  if (style.glow !== null) {
    const glowPad = tile * 0.1;
    for (const cell of SHAPES[shape].cells) {
      const x = cell.col * cellSize - glowPad;
      const y = cell.row * cellSize - glowPad;
      g.roundRect(x, y, tile + glowPad * 2, tile + glowPad * 2, radius + glowPad).fill({
        color: style.glow,
        alpha: alpha * 0.45,
      });
    }
  }
  for (const cell of SHAPES[shape].cells) {
    const x = cell.col * cellSize;
    const y = cell.row * cellSize;
    g.roundRect(x, y, tile, tile, radius)
      .fill({ color, alpha })
      .stroke({ color: style.stroke, width: strokeWidth, alpha });
  }
}

function drawCellStar(g: Graphics, cx: number, cy: number, radius = 15) {
  // 4-pointed "sparkle" star with NO rotation. (Rotating a 4-pointed star
  // 45° turns it into an "×" — that's the bug this fixes; rotation must
  // stay 0.)
  g.star(cx, cy, 4, radius, radius * 0.43).fill({ color: 0xffffff, alpha: 0.4 });
}

/** Stars for one occupied monster/tray-item, in shape-local coordinates
 * (origin = the shape's top-left cell) — drawn between the color tile and
 * the sprite so the stacking reads: cell/color, then star, then monster. */
function drawShapeStars(g: Graphics, shape: ShapeId, cellSize: number, radius: number) {
  for (const cell of SHAPES[shape].cells) {
    const cx = cell.col * cellSize + cellSize / 2;
    const cy = cell.row * cellSize + cellSize / 2;
    drawCellStar(g, cx, cy, radius);
  }
}

class MonsterView {
  container = new Container();
  /** The character sprite lives in its own top-level container (parented
   * under a dedicated sprite layer above ALL tile layers, not nested
   * inside `container`) so that no monster's tile-square background can
   * ever render in front of another monster's — even an overflowing,
   * bottom-anchored sprite that visually spills into a neighboring tile.
   * Its position/alpha/zIndex are mirrored from `container` every frame
   * via `syncPosition()`, since it must track drag/placement exactly. */
  spriteContainer = new Container();
  private visual = new Container();
  private label: Text;
  level: number;
  readonly speciesId: string;
  private shape: ShapeId;
  private bodySprite: Sprite | null = null;
  private idleFrames: Texture[] = [];
  private attackFrames: Texture[] = [];
  private animMode: "idle" | "attack" = "idle";
  private animFrame = 0;
  private animElapsedMs = 0;
  private readonly frameDurationMs = 130;
  private tileW = 0;
  private tileH = 0;
  private boxW = 0;
  private boxH = 0;
  private compH = 1;

  constructor(m: PlacedMonster, textures: Map<string, Texture>, anim: Map<string, SpeciesAnim>) {
    this.speciesId = m.speciesId;
    this.shape = m.shape;
    this.level = m.level;
    this.container.addChild(this.visual);
    this.renderBody(textures, anim);
    this.label = new Text({
      text: levelLabelText(m.shape, m.level),
      style: { fill: 0xffffff, fontSize: 14, fontWeight: "bold" },
    });
    this.label.position.set(6, 4);
    this.container.addChild(this.label);
    this.container.eventMode = "static";
    this.container.cursor = "grab";
  }

  private renderBody(textures: Map<string, Texture>, anim: Map<string, SpeciesAnim>) {
    this.visual.removeChildren();
    this.spriteContainer.removeChildren();
    const species = getSpecies(this.speciesId);
    const g = new Graphics();
    drawBody(g, this.shape, species.color, CELL, BOARD_TILE_MARGIN, 1, this.level);
    this.visual.addChild(g);
    const stars = new Graphics();
    drawShapeStars(stars, this.shape, CELL, 15);
    this.visual.addChild(stars);
    const texture = getMonsterTexture(textures, this.speciesId, this.level);
    const { w: tileW, h: tileH } = shapeSizePx(this.shape, CELL, BOARD_TILE_MARGIN);
    this.tileW = tileW;
    this.tileH = tileH;
    this.bodySprite = null;
    this.idleFrames = [];
    this.attackFrames = [];
    this.animMode = "idle";
    this.animFrame = 0;
    this.animElapsedMs = 0;
    if (texture) {
      const w = tileW;
      const h = tileH;
      // Applying another level's animation frames regardless of the
      // monster's actual level was overwriting a correctly-set static
      // texture with the wrong frames within one idle-loop tick, making
      // evolved monsters visually revert to a lower-level look moments
      // after being placed. Look up frames by species+level — levels
      // with no generated frame set simply keep the static sprite above
      // with no idle/attack animation.
      const speciesAnim = anim.get(`${this.speciesId}_lv${this.level}`);
      // Animation-frame exports use a wider padded canvas than the static
      // art (extra room for the attack/projectile motion to play out), so
      // fitting them into the same box as the static art makes the
      // character itself read smaller once idle animation kicks in.
      // Compensate by the measured canvas-size ratio so the static frame
      // and every animation frame land at the same apparent character
      // size — computed from the actual loaded textures rather than a
      // guessed constant, since the padding amount varies per species.
      // Width and height are compensated independently: an attack canvas
      // that's wider than the static art (room for a horizontal throw)
      // but not taller must only inflate the box's width, or the sprite
      // renders far taller than intended and its bottom-anchored "feet"
      // appear to float high above the tile.
      const compW = speciesAnim
        ? Math.max(speciesAnim.idle[0].width / texture.width, speciesAnim.attack[0].width / texture.width)
        : 1;
      const compH = speciesAnim
        ? Math.max(speciesAnim.idle[0].height / texture.height, speciesAnim.attack[0].height / texture.height)
        : 1;
      this.boxW = w * MONSTER_SIZE_BOOST * compW;
      this.boxH = h * MONSTER_SIZE_BOOST * compH;
      this.compH = compH;
      const sprite = createMonsterSprite(texture, w, h, this.boxW, this.boxH, isSquareShape(this.shape), compH);
      this.spriteContainer.addChild(sprite);
      this.bodySprite = sprite;
      if (speciesAnim) {
        this.idleFrames = speciesAnim.idle;
        this.attackFrames = speciesAnim.attack;
      }
    }
    this.updateHitArea();
  }

  /** `container`'s draggable area is kept to exactly the tile footprint
   * (not the boosted, overflowing sprite in the separate `spriteContainer`
   * layer). An earlier attempt expanded this to the sprite's full visual
   * bounds so the overflowing part was grabbable too, but on a filled
   * board that expanded rectangle routinely overlaps a neighboring
   * monster's own tile — since `monsterLayer` hit-tests front-to-back by
   * zIndex (row), whichever monster is "in front" in that overlap then
   * silently swallows clicks meant for the monster underneath, making
   * dragging fail unpredictably depending on exactly where you click.
   * Tile-only hit-testing sacrifices grabbing the overflow sliver, but is
   * the only option that stays reliable once the board fills up. */
  private updateHitArea() {
    this.container.hitArea = new Rectangle(0, 0, this.tileW, this.tileH);
  }

  update(m: PlacedMonster, textures: Map<string, Texture>, anim: Map<string, SpeciesAnim>) {
    if (m.level !== this.level) {
      this.level = m.level;
      this.renderBody(textures, anim);
      this.label.text = levelLabelText(m.shape, m.level);
      gsap.fromTo(this.container.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.25, ease: "back.out(2)" });
    }
  }

  /** Mirrors `container`'s transform onto `spriteContainer` — must run
   * every frame regardless of animation state, since `container` moves
   * from drag, board sync, and the level-up pop tween, and the sprite
   * layer has to track all of that exactly despite living in a separate
   * top-level container. */
  syncPosition() {
    this.spriteContainer.position.copyFrom(this.container.position);
    this.spriteContainer.scale.copyFrom(this.container.scale);
    this.spriteContainer.alpha = this.container.alpha;
    this.spriteContainer.zIndex = this.container.zIndex;
  }

  /** Advances the idle-breathing loop every frame, or steps through the
   * one-shot attack sequence (started by `attackPulse`) and returns to
   * idle once it finishes. */
  tick(deltaMs: number) {
    const frames = this.animMode === "attack" ? this.attackFrames : this.idleFrames;
    if (!this.bodySprite || frames.length === 0) return;
    this.animElapsedMs += deltaMs;
    if (this.animElapsedMs < this.frameDurationMs) return;
    this.animElapsedMs = 0;
    this.animFrame++;
    if (this.animFrame >= frames.length) {
      this.animFrame = 0;
      if (this.animMode === "attack") this.animMode = "idle";
    }
    const activeFrames = this.animMode === "attack" ? this.attackFrames : this.idleFrames;
    this.bodySprite.texture = activeFrames[this.animFrame];
    fitMonsterSpriteToTile(
      this.bodySprite,
      this.tileW,
      this.tileH,
      this.boxW,
      this.boxH,
      isSquareShape(this.shape),
      this.compH,
    );
    this.updateHitArea();
  }

  /** Small recoil punch plus a one-shot ranged-attack frame sequence
   * (projectile cast/throw) when this monster attacks. */
  attackPulse() {
    gsap.fromTo(this.container.scale, { x: 0.9, y: 1.1 }, { x: 1, y: 1, duration: 0.18, ease: "back.out(2)" });
    if (this.bodySprite && this.attackFrames.length > 0) {
      this.animMode = "attack";
      this.animFrame = 0;
      this.animElapsedMs = 0;
      this.bodySprite.texture = this.attackFrames[0];
    }
  }
}

/** Base on-screen size (px, before `sizeScale`) for an enemy sprite — enemies
 * aren't tied to a tile grid like monsters, so this is just a flat display
 * target rather than something derived from `CELL`. Sized to read clearly
 * against the board (comparable to a 1x1 monster's ~96px box) rather than
 * as a tiny speck in the lane — an earlier, much smaller value ("豆粒" —
 * looked like a bean) was raised here after direct user feedback. */
const ENEMY_BASE_SIZE = 80;

class EnemyView {
  container = new Container();
  private bodySprite: Sprite | null = null;
  private fallback: Graphics | null = null;
  private hpBar = new Graphics();
  private walkFrames: Texture[] = [];
  private attackFrames: Texture[] = [];
  private animMode: "walk" | "attack" = "walk";
  private animFrame = 0;
  private animElapsedMs = 0;
  private readonly frameDurationMs = 130;
  private readonly scale: number;
  private dead = false;
  private maxHp: number;
  /** HP as currently *shown* on the bar — deliberately not synced to the
   * enemy's true `hp` in `update()`. Combat damage resolves instantly in
   * the battle engine, but the bar should only visually drop once the
   * attacking projectile lands (`applyPendingDamage`), so the hit flash
   * and the bar drop stay in sync with the flying effect instead of
   * jumping ahead of it. */
  private displayHp: number;

  constructor(e: EnemyInstance, textures: Map<string, Texture>, anim: Map<string, EnemyAnim>) {
    this.maxHp = e.maxHp;
    this.displayHp = e.hp;
    const def = ENEMY_DEFS[e.defId];
    this.scale = def?.sizeScale ?? 1;

    const texture = textures.get(e.defId);
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.85);
      this.bodySprite = sprite;
      this.container.addChild(sprite);
      this.refitSprite();
    } else {
      const fallback = new Graphics();
      fallback.circle(0, 0, (ENEMY_BASE_SIZE * this.scale) / 2).fill(0xaaaaaa).stroke({ color: 0x0b1118, width: 2 });
      this.fallback = fallback;
      this.container.addChild(fallback);
    }

    const speciesAnim = anim.get(e.defId);
    if (speciesAnim) {
      this.walkFrames = speciesAnim.walk;
      this.attackFrames = speciesAnim.attack;
    }

    this.container.addChild(this.hpBar);
    this.redrawHpBar();
  }

  /** Re-derives the sprite's on-screen width/height from whatever texture
   * is currently set — animation-frame canvases aren't guaranteed to match
   * the static art's dimensions (same PixelLab export quirk seen on
   * monsters), so this must run on every texture swap, not just once. */
  private refitSprite() {
    if (!this.bodySprite) return;
    const target = ENEMY_BASE_SIZE * this.scale;
    const fit = Math.min(target / this.bodySprite.texture.width, target / this.bodySprite.texture.height);
    this.bodySprite.width = this.bodySprite.texture.width * fit;
    this.bodySprite.height = this.bodySprite.texture.height * fit;
  }

  update(e: EnemyInstance) {
    this.container.position.set(pathX(e.spawnX), pathY(e.progress));
    // Parked at the base (`hasBreached`) loops its punch instead of its
    // run cycle — reaching the front line is what triggers the attack
    // motion ("手前まで来たら殴るように"), and it keeps throwing punches
    // for as long as it's alive and parked there.
    const targetMode: "walk" | "attack" = e.hasBreached ? "attack" : "walk";
    if (targetMode !== this.animMode) {
      this.animMode = targetMode;
      this.animFrame = 0;
      this.animElapsedMs = 0;
    }
  }

  tick(dtMs: number) {
    if (this.dead || !this.bodySprite) return;
    const frames = this.animMode === "attack" ? this.attackFrames : this.walkFrames;
    if (frames.length === 0) return;
    this.animElapsedMs += dtMs;
    if (this.animElapsedMs < this.frameDurationMs) return;
    this.animElapsedMs -= this.frameDurationMs;
    this.animFrame = (this.animFrame + 1) % frames.length;
    this.bodySprite.texture = frames[this.animFrame];
    this.refitSprite();
  }

  private redrawHpBar() {
    const ratio = Math.max(0, this.displayHp / this.maxHp);
    // Anchored relative to `ENEMY_BASE_SIZE * this.scale` (the sprite's
    // target height) rather than a fixed offset, so the bar still clears
    // the head at every size tier instead of sitting fixed for the old,
    // much smaller sprite size.
    const barY = -ENEMY_BASE_SIZE * this.scale * 0.85 - 8;
    const barWidth = 22 + 14 * this.scale;
    this.hpBar.clear();
    this.hpBar.rect(-barWidth / 2, barY, barWidth, 4).fill(0x2a2a2a);
    this.hpBar.rect(-barWidth / 2, barY, barWidth * ratio, 4).fill(ratio > 0.4 ? 0x4ecb71 : 0xd94e4e);
  }

  private flashHit() {
    gsap.fromTo(this.container, { alpha: 0.3 }, { alpha: 1, duration: 0.15 });
    gsap.fromTo(this.container.scale, { x: 1.3, y: 0.75 }, { x: 1, y: 1, duration: 0.18, ease: "back.out(3)" });
  }

  /** Called when a projectile aimed at this enemy lands — catches the
   * displayed HP bar down to its true current HP and plays the hit
   * flash/flinch at that same moment. */
  applyPendingDamage(newHp: number) {
    this.displayHp = newHp;
    this.redrawHpBar();
    this.flashHit();
  }

  /** Enemy died — freezes on its current frame, flips to grayscale, holds
   * there fully visible for ~3s ("３秒くらい白黒になった後に消える"), then
   * fades out quickly at the very end — instead of vanishing instantly. */
  killPop(onComplete: () => void) {
    this.dead = true;
    const grayscale = new ColorMatrixFilter();
    grayscale.desaturate();
    this.container.filters = [grayscale];
    gsap.to(this.container, { alpha: 0, duration: 0.3, delay: 3, ease: "power1.in", onComplete });
  }
}

function drawStaticBoard(stage: Container) {
  const g = new Graphics();
  g.rect(BOARD_X - 4, BOARD_Y - 4, BOARD_PX + 8, BOARD_PX + 8).fill({ color: 0x0b1118, alpha: 0.55 });
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const cx = BOARD_X + col * CELL;
      const cy = BOARD_Y + row * CELL;
      g.rect(cx, cy, CELL - 2, CELL - 2).fill({ color: 0x1c2b3a, alpha: 0.55 });
    }
  }
  // Base line: enemies breach once they reach the board's top edge.
  g.moveTo(BOARD_X, BOARD_Y).lineTo(BOARD_X + BOARD_PX, BOARD_Y).stroke({
    color: 0xd94e4e,
    width: 3,
  });
  stage.addChild(g);
}

/** ☆ mark on every board cell, drawn beneath monsters so occupied cells
 * show the monster on top rather than the star poking through it. */
function drawBoardStars(): Graphics {
  const g = new Graphics();
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const cx = BOARD_X + col * CELL + CELL / 2;
      const cy = BOARD_Y + row * CELL + CELL / 2;
      drawCellStar(g, cx, cy);
    }
  }
  return g;
}

/** Highlights the cells a drag would land on — green if the drop is
 * valid (place or merge), red otherwise — so it's obvious before you
 * let go where the piece will end up. */
function drawDropPreview(g: Graphics, cells: Vec2[], valid: boolean) {
  g.clear();
  const color = valid ? 0x4ecb71 : 0xd94e4e;
  for (const cell of cells) {
    if (cell.row < 0 || cell.row > 3) continue;
    const x = BOARD_X + cell.col * CELL;
    const y = BOARD_Y + cell.row * CELL;
    g.roundRect(x + 1, y + 1, CELL - 4, CELL - 4, 6).fill({ color, alpha: 0.4 }).stroke({ color, width: 2, alpha: 0.9 });
  }
}

/** Highlights a tray candidate as a merge target (dragging one onto
 * another, before either touches the board). */
function drawSlotPreview(g: Graphics, homePx: { x: number; y: number }, w: number, h: number, valid: boolean) {
  g.clear();
  const color = valid ? 0x4ecb71 : 0xd94e4e;
  g.roundRect(homePx.x - 3, homePx.y - 3, w + 6, h + 6, 6)
    .fill({ color, alpha: 0.35 })
    .stroke({ color, width: 2, alpha: 0.9 });
}

/** One shared frame holding all of the tray's candidates, rather than a
 * separate box per item ("一つの枠の中に3つの形状"). */
function drawTrayFrame(height: number): Graphics {
  const g = new Graphics();
  g.roundRect(TRAY_X0, TRAY_Y, TRAY_FRAME_W, height, 14)
    .fill({ color: 0x111c26, alpha: 0.7 })
    .stroke({ color: 0x2a3d52, width: 1 });
  return g;
}

export default function GameCanvas({ session }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });
  // Loading all sprite/animation frames (now 5 species up to Lv5, plus
  // enemies) takes long enough on a first visit that a blank transparent
  // canvas reads as "stuck", not "starting" — this progress bar fills in
  // that dead time, especially noticeable on the very first game start
  // ("特にゲームを始めるとき").
  const [loadProgress, setLoadProgress] = useState(0);
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  useEffect(() => {
    let destroyed = false;
    let initialized = false;
    const app = new Application();

    (async () => {
      await app.init({
        width: CANVAS_W,
        height: CANVAS_H,
        // Transparent — the forest scene is now rendered exactly once, as a
        // single CSS page background behind everything (see page.tsx), so
        // it shows through here with no second, differently-scaled copy of
        // the same art meeting it at the canvas edges ("継ぎ目"/seam
        // between two independent renderings of the same source image).
        backgroundAlpha: 0,
        antialias: true,
      });
      // Init is async — React StrictMode (or a fast unmount) can request
      // teardown before it resolves. Destroying a not-yet-initialized
      // Application throws, so only destroy here once init has landed.
      initialized = true;
      if (destroyed) {
        app.destroy(true, { children: true });
        return;
      }
      containerRef.current?.appendChild(app.canvas);

      // Coarse-grained progress: one "unit" per static sprite, and one per
      // idle/attack frame set (not per individual frame file) — precise
      // enough to make the bar move steadily without threading a counter
      // through every single `Assets.load` call.
      const speciesAnimJobs = MONSTER_SPECIES.flatMap((s) =>
        ANIM_LEVELS.filter((lv) => lv <= maxLevelForSpecies(s.id)).map((lv) => ({ species: s, lv })),
      );
      const totalUnits =
        Object.keys(SPECIES_SPRITE_PATHS).length +
        speciesAnimJobs.length * 2 +
        Object.keys(ENEMY_SPRITE_PATHS).length +
        ENEMY_IDS.length * 2;
      let loadedUnits = 0;
      const bump = () => {
        loadedUnits += 1;
        setLoadProgress(Math.min(1, loadedUnits / totalUnits));
      };

      const textures = new Map<string, Texture>();
      await Promise.all(
        Object.entries(SPECIES_SPRITE_PATHS).map(async ([key, url]) => {
          try {
            textures.set(key, await Assets.load(url));
          } catch (err) {
            console.warn(`Failed to load monster sprite: ${url}`, err);
          } finally {
            bump();
          }
        }),
      );
      const speciesAnim = new Map<string, SpeciesAnim>();
      await Promise.all(
        speciesAnimJobs.map(async ({ species: s, lv }) => {
          const idle = await Promise.all(animFramePaths(s.id, lv, "idle").map((url) => Assets.load(url))).catch(
            (err) => {
              console.warn(`Failed to load idle frames for species: ${s.id} lv${lv}`, err);
              return [] as Texture[];
            },
          );
          bump();
          const attack = await Promise.all(animFramePaths(s.id, lv, "attack").map((url) => Assets.load(url))).catch(
            (err) => {
              console.warn(`Failed to load attack frames for species: ${s.id} lv${lv}`, err);
              return [] as Texture[];
            },
          );
          bump();
          speciesAnim.set(`${s.id}_lv${lv}`, { idle, attack });
        }),
      );
      const enemyTextures = new Map<string, Texture>();
      await Promise.all(
        Object.entries(ENEMY_SPRITE_PATHS).map(async ([key, url]) => {
          try {
            enemyTextures.set(key, await Assets.load(url));
          } catch (err) {
            console.warn(`Failed to load enemy sprite: ${url}`, err);
          } finally {
            bump();
          }
        }),
      );
      const enemyAnim = new Map<string, EnemyAnim>();
      await Promise.all(
        ENEMY_IDS.map(async (id) => {
          const walk = await Promise.all(enemyAnimFramePaths(id, "walk").map((url) => Assets.load(url))).catch(
            (err) => {
              console.warn(`Failed to load walk frames for enemy: ${id}`, err);
              return [] as Texture[];
            },
          );
          bump();
          const attack = await Promise.all(enemyAnimFramePaths(id, "attack").map((url) => Assets.load(url))).catch(
            (err) => {
              console.warn(`Failed to load attack frames for enemy: ${id}`, err);
              return [] as Texture[];
            },
          );
          bump();
          enemyAnim.set(id, { walk, attack });
        }),
      );
      if (destroyed) {
        app.destroy(true, { children: true });
        return;
      }
      setLoadProgress(1);
      setAssetsLoaded(true);

      drawStaticBoard(app.stage);
      const traySlotLayer = new Container();
      const monsterLayer = new Container();
      // Board monster sprites live here, never inside `monsterLayer` — so
      // that no monster's tile-square background can ever render on top
      // of another monster's (bottom-anchored, oversized) sprite. Always
      // added to the stage right after `monsterLayer`, guaranteeing every
      // tile is behind every sprite regardless of row/zIndex.
      const monsterSpriteLayer = new Container();
      const enemyLayer = new Container();
      const trayLayer = new Container();
      // Same tile-vs-sprite split as monsterLayer/monsterSpriteLayer above:
      // a boosted candidate's sprite can overflow into a neighboring
      // candidate's slot, and without this split that neighbor's own tile
      // (drawn after it, in a later item's container) would paint over the
      // overflow and partially hide it.
      const traySpriteLayer = new Container();
      monsterLayer.sortableChildren = true;
      monsterSpriteLayer.sortableChildren = true;
      trayLayer.sortableChildren = true;
      // Pure decoration for hit-testing purposes — the real drag targets
      // are the tile containers in monsterLayer/trayLayer underneath.
      // Pixi's default eventMode ("passive") does *not* reliably fall
      // through to a sibling layer behind it in this setup, so without an
      // explicit "none" here these sprite-only layers (painted in front so
      // characters aren't hidden behind neighboring tiles — see the layer
      // split note below) silently swallow clicks aimed at the character
      // art itself, leaving only the plain background sliver of each tile
      // draggable.
      monsterSpriteLayer.eventMode = "none";
      traySpriteLayer.eventMode = "none";
      const boardStars = drawBoardStars();
      boardStars.eventMode = "none";
      const dropPreview = new Graphics();
      dropPreview.eventMode = "none";
      const effectsLayer = new Container();
      effectsLayer.eventMode = "none";
      app.stage.addChild(
        traySlotLayer,
        boardStars,
        monsterLayer,
        monsterSpriteLayer,
        enemyLayer,
        trayLayer,
        traySpriteLayer,
        dropPreview,
        effectsLayer,
      );

      /** Small colored particles scattering outward in random directions —
       * shared "debris" texture layered under the bigger shapes in both
       * the projectile trail and the impact burst, for a busier/less
       * geometric feel. */
      function spawnSparkParticles(x: number, y: number, color: number, count: number) {
        for (let i = 0; i < count; i++) {
          const spark = new Graphics();
          spark.circle(0, 0, randRange(1.5, 3)).fill({ color, alpha: 0.9 });
          spark.position.set(x, y);
          effectsLayer.addChild(spark);
          const angle = randRange(0, Math.PI * 2);
          const dist = randRange(14, 36);
          gsap.to(spark, {
            x: x + Math.cos(angle) * dist,
            y: y + Math.sin(angle) * dist,
            alpha: 0,
            duration: randRange(0.25, 0.45),
            ease: "power2.out",
            onComplete: () => effectsLayer.removeChild(spark),
          });
        }
      }

      /** Species-flavored impact effect at an enemy's position when a
       * projectile lands — a bright white core flash + a big radial burst
       * + an expanding shockwave ring (colors vary by element), a jagged
       * (randomized each time) lightning bolt striking down from above for
       * the thunder species, scattered spark debris, and flying shard
       * particles for the two "shatter"-style elements (ice / crystal).
       * Purely cosmetic: the actual hit/damage timing is already resolved
       * by the battle engine before this plays. */
      function spawnAttackEffect(speciesId: string, x: number, y: number, level: number = 1) {
        const style = SPECIES_IMPACT_STYLE[speciesId] ?? DEFAULT_IMPACT_STYLE;
        // Final-evolution hits get a bigger, busier payoff ("レベル４の
        // エフェクトもっとバチバチに派手に") — every shape in this function
        // scales up, there's more spark debris, and an extra radial burst
        // + a brief screen shake pile on for emphasis.
        const epic = level >= 4;
        const scaleMul = epic ? 1.7 : 1;

        if (style.kind === "bolt") {
          const bolt = new Graphics();
          const segments = 5;
          let cx = 0;
          let cy = -60;
          bolt.moveTo(cx, cy);
          for (let i = 1; i <= segments; i++) {
            cx += randRange(-7, 7);
            cy = -60 + (60 * i) / segments;
            bolt.lineTo(cx, cy);
          }
          bolt.stroke({ color: style.primary, width: 4, alpha: 1 });
          bolt.position.set(x, y);
          bolt.alpha = 0;
          effectsLayer.addChild(bolt);
          gsap
            .timeline({ onComplete: () => effectsLayer.removeChild(bolt) })
            .to(bolt, { alpha: 1, duration: 0.04 })
            .to(bolt, { alpha: 0.15, duration: 0.03 })
            .to(bolt, { alpha: 1, duration: 0.03 })
            .to(bolt, { alpha: 0.15, duration: 0.03 })
            .to(bolt, { alpha: 1, duration: 0.03 })
            .to(bolt, { alpha: 0, duration: 0.3 });

          const boltFlash = new Graphics();
          boltFlash.circle(0, 0, 26).fill({ color: 0xffffff, alpha: 0.9 });
          boltFlash.position.set(x, y);
          boltFlash.scale.set(0.3);
          boltFlash.alpha = 0;
          effectsLayer.addChild(boltFlash);
          gsap
            .timeline({ onComplete: () => effectsLayer.removeChild(boltFlash) })
            .to(boltFlash, { alpha: 1, duration: 0.04 })
            .to(boltFlash.scale, { x: 1.6, y: 1.6, duration: 0.25, ease: "power1.out" }, "<")
            .to(boltFlash, { alpha: 0, duration: 0.25 }, "<");
        }

        const flash = new Graphics();
        flash.circle(0, 0, 10 * scaleMul).fill({ color: 0xffffff, alpha: 0.95 });
        flash.position.set(x, y);
        effectsLayer.addChild(flash);
        gsap.to(flash.scale, { x: 2.4, y: 2.4, duration: 0.12, ease: "power2.out" });
        gsap.to(flash, { alpha: 0, duration: 0.16, onComplete: () => effectsLayer.removeChild(flash) });

        const burst = new Graphics();
        burst.circle(0, 0, 18 * scaleMul).fill({ color: style.primary, alpha: 0.9 });
        burst.position.set(x, y);
        effectsLayer.addChild(burst);
        gsap.to(burst.scale, { x: 3.4, y: 3.4, duration: 0.42, ease: "power1.out" });
        gsap.to(burst, { alpha: 0, duration: 0.42, onComplete: () => effectsLayer.removeChild(burst) });

        const ring = new Graphics();
        ring.circle(0, 0, 13 * scaleMul).stroke({ color: style.secondary, width: epic ? 4 : 3, alpha: 0.95 });
        ring.position.set(x, y);
        effectsLayer.addChild(ring);
        gsap.to(ring.scale, { x: 4, y: 4, duration: 0.48, ease: "power1.out", delay: 0.04 });
        gsap.to(ring, { alpha: 0, duration: 0.48, delay: 0.04, onComplete: () => effectsLayer.removeChild(ring) });

        spawnSparkParticles(x, y, style.secondary, (style.kind === "shard" ? 5 : 9) * (epic ? 2 : 1));

        if (epic) {
          // Second delayed ring (white, thin) right behind the first —
          // reads as a "double pulse" shockwave instead of one flat burst.
          const ring2 = new Graphics();
          ring2.circle(0, 0, 10).stroke({ color: 0xffffff, width: 2, alpha: 0.85 });
          ring2.position.set(x, y);
          effectsLayer.addChild(ring2);
          gsap.to(ring2.scale, { x: 5.5, y: 5.5, duration: 0.5, delay: 0.12, ease: "power1.out" });
          gsap.to(ring2, { alpha: 0, duration: 0.5, delay: 0.12, onComplete: () => effectsLayer.removeChild(ring2) });

          // Radial spikes bursting outward in every direction — the
          // "バチバチ" (crackling) part.
          const rayCount = 12;
          for (let i = 0; i < rayCount; i++) {
            const ray = new Graphics();
            const len = randRange(22, 34);
            ray.moveTo(0, 0).lineTo(len, 0).stroke({ color: style.primary, width: 2.5, alpha: 0.95 });
            ray.position.set(x, y);
            ray.rotation = (Math.PI * 2 * i) / rayCount + randRange(-0.12, 0.12);
            effectsLayer.addChild(ray);
            gsap.to(ray, { alpha: 0, duration: 0.28, ease: "power1.out", onComplete: () => effectsLayer.removeChild(ray) });
            gsap.to(ray.scale, { x: 1.7, y: 1, duration: 0.28, ease: "power1.out" });
          }

          // Brief screen shake — small enough not to disorient, sharp
          // enough to sell the extra weight of a final-evolution hit.
          const shake = 4;
          gsap
            .timeline()
            .to(app.stage, { x: shake, y: -shake * 0.6, duration: 0.04 })
            .to(app.stage, { x: -shake, y: shake * 0.6, duration: 0.05 })
            .to(app.stage, { x: shake * 0.6, y: -shake * 0.3, duration: 0.05 })
            .to(app.stage, { x: 0, y: 0, duration: 0.06 });
        }

        if (style.kind === "shard") {
          const shardCount = 8;
          for (let i = 0; i < shardCount; i++) {
            const shard = new Graphics();
            const size = randRange(4, 6.5);
            shard
              .poly([0, -size, size * 0.7, 0, 0, size, -size * 0.7, 0])
              .fill({ color: i % 2 === 0 ? style.primary : style.secondary });
            shard.position.set(x, y);
            shard.rotation = randRange(0, Math.PI * 2);
            effectsLayer.addChild(shard);
            const angle = (Math.PI * 2 * i) / shardCount + randRange(-0.25, 0.25) - Math.PI / 2;
            const dist = randRange(28, 42);
            gsap.to(shard, {
              x: x + Math.cos(angle) * dist,
              y: y + Math.sin(angle) * dist,
              rotation: shard.rotation + randRange(-2, 2),
              alpha: 0,
              duration: randRange(0.35, 0.5),
              ease: "power1.out",
              onComplete: () => effectsLayer.removeChild(shard),
            });
          }
        }
      }

      /** Builds the in-flight projectile's own visual, shaped per element
       * (flame teardrop / lightning spark / ice shard / fluttering leaf /
       * tumbling crystal chunk) rather than a plain colored dot — plus a
       * soft glow behind it shared by every shape. Drawn pointing along
       * +x; the caller rotates the whole container to face the flight
       * direction for the directional shapes. */
      function buildProjectileVisual(style: ImpactStyle): Container {
        const visual = new Container();
        const glow = new Graphics();
        glow.circle(0, 0, 15).fill({ color: style.primary, alpha: 0.3 });
        visual.addChild(glow);

        switch (style.projectile) {
          case "flame": {
            const flame = new Graphics();
            flame.poly([11, 0, 3, -6, -9, -5, -11, 0, -9, 5, 3, 6]).fill({ color: style.primary, alpha: 1 });
            const core = new Graphics();
            core.poly([6, 0, 1, -3, -5, -2, -6, 0, -5, 2, 1, 3]).fill({ color: style.secondary, alpha: 0.95 });
            visual.addChild(flame, core);
            break;
          }
          case "spark": {
            const bolt = new Graphics();
            bolt.moveTo(-10, -5).lineTo(-2, -2).lineTo(-5, 0).lineTo(10, 5).lineTo(2, 1).lineTo(5, -1).lineTo(-10, -5);
            bolt.fill({ color: style.secondary, alpha: 1 });
            const halo = new Graphics();
            halo.circle(0, 0, 6).fill({ color: style.primary, alpha: 0.6 });
            visual.addChild(halo, bolt);
            break;
          }
          case "ice": {
            const shard = new Graphics();
            shard.poly([12, 0, 2, -6, -10, 0, 2, 6]).fill({ color: style.primary, alpha: 1 });
            const facet = new Graphics();
            facet.poly([12, 0, 2, -6, 2, 6]).fill({ color: style.secondary, alpha: 0.65 });
            visual.addChild(shard, facet);
            break;
          }
          case "leaf": {
            const leaf = new Graphics();
            leaf.poly([11, 0, 2, -7, -11, 0, 2, 7]).fill({ color: style.primary, alpha: 1 });
            const vein = new Graphics();
            vein.moveTo(-9, 0).lineTo(9, 0).stroke({ color: style.secondary, width: 1.5, alpha: 0.8 });
            visual.addChild(leaf, vein);
            break;
          }
          case "crystal": {
            const gem = new Graphics();
            gem.poly([10, 0, 4, -8, -6, -6, -10, 0, -6, 6, 4, 8]).fill({ color: style.primary, alpha: 1 });
            const facet = new Graphics();
            facet.poly([10, 0, 4, -8, -6, -6, -2, 0]).fill({ color: style.secondary, alpha: 0.55 });
            visual.addChild(gem, facet);
            break;
          }
        }
        return visual;
      }

      /** Flies a species-shaped projectile (flame / spark / ice shard /
       * leaf / crystal, per `SPECIES_IMPACT_STYLE`) from an attacking
       * monster's board position to the target's position — leaving a
       * short comet trail of fading debris along the way — then plays the
       * bigger `spawnAttackEffect` burst at the landing point once it
       * arrives, so "cast → travel → impact" reads as one continuous
       * attack. Flight duration scales with distance (clamped) rather
       * than being fixed, so a 2x2 unit hitting a nearby enemy doesn't
       * look slower/faster than a 1x1 unit hitting a far one. `onImpact`
       * (if given) fires the instant it lands, before the burst — this is
       * where the caller should sync any deferred hit feedback (HP bar,
       * flash) so it doesn't show up before the projectile visually
       * arrives. */
      function spawnProjectile(
        speciesId: string,
        from: { x: number; y: number },
        to: { x: number; y: number },
        onImpact?: () => void,
        level: number = 1,
      ) {
        const style = SPECIES_IMPACT_STYLE[speciesId] ?? DEFAULT_IMPACT_STYLE;
        const epic = level >= 4;

        // Small same-styled "muzzle flash" right at the mouth the instant
        // the shot fires — makes the projectile read as launched from the
        // character rather than materializing out of thin air at `from`.
        // Scaled up for Lv4 along with everything else in an epic hit.
        const muzzle = new Graphics();
        muzzle.circle(0, 0, epic ? 14 : 9).fill({ color: style.secondary, alpha: 0.9 });
        muzzle.position.set(from.x, from.y);
        effectsLayer.addChild(muzzle);
        gsap.to(muzzle.scale, { x: 2.2, y: 2.2, duration: 0.16, ease: "power2.out" });
        gsap.to(muzzle, { alpha: 0, duration: 0.18, onComplete: () => effectsLayer.removeChild(muzzle) });

        const projectile = buildProjectileVisual(style);
        if (epic) projectile.scale.set(1.6);
        projectile.position.set(from.x, from.y);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        if (style.projectile === "flame" || style.projectile === "spark" || style.projectile === "ice") {
          projectile.rotation = angle;
        }
        effectsLayer.addChild(projectile);

        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        const duration = Math.min(0.42, Math.max(0.16, distance / 420));

        // Fluttering/tumbling shapes keep spinning independent of travel
        // direction; directional shapes get a small in-flight wobble
        // instead so they don't look perfectly rigid.
        if (style.projectile === "leaf" || style.projectile === "crystal") {
          gsap.to(projectile, { rotation: angle + Math.PI * 4, duration, ease: "none" });
        } else {
          gsap.to(projectile, {
            rotation: angle + randRange(-0.2, 0.2),
            duration: duration / 2,
            yoyo: true,
            repeat: 1,
            ease: "sine.inOut",
          });
        }
        gsap.to(projectile.scale, {
          x: epic ? 2.1 : 1.3,
          y: epic ? 2.1 : 1.3,
          duration: duration / 2,
          yoyo: true,
          repeat: 1,
          ease: "sine.inOut",
        });

        // Comet trail: a few fading afterimages dropped along the path.
        const trailSteps = 4;
        for (let i = 1; i <= trailSteps; i++) {
          gsap.delayedCall((duration * i) / (trailSteps + 1), () => {
            const ghost = new Graphics();
            ghost.circle(0, 0, randRange(3, 5)).fill({ color: style.primary, alpha: 0.45 });
            ghost.position.set(projectile.x, projectile.y);
            effectsLayer.addChild(ghost);
            gsap.to(ghost, { alpha: 0, duration: 0.22, onComplete: () => effectsLayer.removeChild(ghost) });
          });
        }

        gsap.to(projectile, {
          x: to.x,
          y: to.y,
          duration,
          ease: "power1.in",
          onComplete: () => {
            effectsLayer.removeChild(projectile);
            onImpact?.();
            spawnAttackEffect(speciesId, to.x, to.y, level);
          },
        });
      }

      /** Floating "+N" coin popup at an enemy's last position on kill. */
      function spawnCoinPopup(x: number, y: number, amount: number) {
        const text = new Text({
          text: `+${amount}`,
          style: { fill: 0xf0c94e, fontSize: 13, fontWeight: "bold" },
        });
        text.anchor.set(0.5);
        text.position.set(x, y);
        effectsLayer.addChild(text);
        gsap.to(text, {
          y: y - 22,
          alpha: 0,
          duration: 0.7,
          ease: "power1.out",
          onComplete: () => effectsLayer.removeChild(text),
        });
      }

      /** Plays at the resulting tile whenever a drag-drop actually merges
       * two monsters into a leveled-up one (not a plain move/placement) —
       * "重ねて合体する際に光るような、合体してるのが伝わるような演出".
       * Deliberately the *opposite* motion from `spawnAttackEffect`'s
       * outward burst: a ring of sparkles flies inward and collapses into
       * a bright flash, so it reads as two things fusing together rather
       * than something exploding. */
      function spawnMergeGlow(x: number, y: number) {
        const outerRing = new Graphics();
        outerRing.circle(0, 0, 10).stroke({ color: 0xffd24d, width: 3, alpha: 0.95 });
        outerRing.position.set(x, y);
        effectsLayer.addChild(outerRing);
        gsap.to(outerRing.scale, { x: 4.5, y: 4.5, duration: 0.42, ease: "power1.out" });
        gsap.to(outerRing, { alpha: 0, duration: 0.42, onComplete: () => effectsLayer.removeChild(outerRing) });

        // Sparkle stars start on a ring around the tile and fly *inward*,
        // arriving right as the flash below pops — the "combining" read.
        const starCount = 10;
        for (let i = 0; i < starCount; i++) {
          const star = new Graphics();
          const size = randRange(3, 5);
          star.star(0, 0, 4, size, size * 0.4).fill({ color: 0xfff3c4, alpha: 0.95 });
          const angle = (Math.PI * 2 * i) / starCount + randRange(-0.15, 0.15);
          const dist = randRange(34, 50);
          star.position.set(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist);
          star.alpha = 0;
          star.rotation = randRange(0, Math.PI * 2);
          effectsLayer.addChild(star);
          gsap
            .timeline({ onComplete: () => effectsLayer.removeChild(star) })
            .to(star, { alpha: 1, duration: 0.08 })
            .to(star, { x, y, rotation: star.rotation + randRange(2, 4), duration: 0.26, ease: "power2.in" }, "<")
            .to(star, { alpha: 0, duration: 0.1 }, "-=0.08");
        }

        // Bright pop, timed to land just as the inward sparkles converge.
        gsap.delayedCall(0.24, () => {
          const flash = new Graphics();
          flash.circle(0, 0, 8).fill({ color: 0xffffff, alpha: 1 });
          flash.position.set(x, y);
          flash.scale.set(0.3);
          effectsLayer.addChild(flash);
          gsap.to(flash.scale, { x: 3, y: 3, duration: 0.22, ease: "power2.out" });
          gsap.to(flash, { alpha: 0, duration: 0.28, delay: 0.03, onComplete: () => effectsLayer.removeChild(flash) });

          const burst = new Graphics();
          burst.circle(0, 0, 6).fill({ color: 0xffd24d, alpha: 0.85 });
          burst.position.set(x, y);
          effectsLayer.addChild(burst);
          gsap.to(burst.scale, { x: 3.6, y: 3.6, duration: 0.34, ease: "power1.out" });
          gsap.to(burst, { alpha: 0, duration: 0.34, onComplete: () => effectsLayer.removeChild(burst) });

          spawnSparkParticles(x, y, 0xffe8a3, 8);
        });
      }

      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;

      const monsterViews = new Map<string, MonsterView>();
      const enemyViews = new Map<string, EnemyView>();
      interface TrayView {
        container: Container;
        spriteContainer: Container;
        item: TrayItem;
        homePx: { x: number; y: number };
      }
      // Keyed by offerId (not a flat array) so `syncTray` can tell a
      // genuinely new candidate apart from one that's merely being
      // repositioned — see the comment on the drop-in tween inside
      // `syncTray` for why that distinction matters.
      const trayViews = new Map<string, TrayView>();
      let drag: DragState | null = null;
      let draggingInstanceId: string | null = null;
      let renderedTrayKey = "";

      function snapBack(state: DragState) {
        gsap.to(state.container, {
          x: state.originPx.x,
          y: state.originPx.y,
          duration: 0.22,
          ease: "back.out(2)",
        });
      }

      /** The other tray candidate (if any) the dragged piece's bounding
       * box currently overlaps — used for candidate-onto-candidate
       * merging. Every candidate is drawn at the same TRAY_CELL scale, so
       * this reads real pixel sizes, not a per-item scale factor. */
      function findOverlappingTraySlot(dragged: DragState, excludeOfferId: string) {
        const { w, h } = shapeSizePx(dragged.shape, TRAY_CELL, TRAY_TILE_MARGIN);
        const dx0 = dragged.container.x;
        const dy0 = dragged.container.y;
        const dx1 = dx0 + w;
        const dy1 = dy0 + h;
        for (const view of trayViews.values()) {
          if (view.item.offerId === excludeOfferId) continue;
          const { w: vw, h: vh } = shapeSizePx(view.item.shape, TRAY_CELL, TRAY_TILE_MARGIN);
          const sx0 = view.homePx.x - 3;
          const sy0 = view.homePx.y - 3;
          const sx1 = sx0 + vw + 6;
          const sy1 = sy0 + vh + 6;
          if (dx0 < sx1 && dx1 > sx0 && dy0 < sy1 && dy1 > sy0) return view;
        }
        return undefined;
      }

      function beginDrag(e: FederatedPointerEvent, state: Omit<DragState, "grabOffsetPx">) {
        // Board is locked during combat ("バトル中はドラッグできないよう
        // に") — refusing the drop after a full drag (the earlier fix,
        // still in place as a backstop) technically worked but let the
        // piece visibly pick up and follow the cursor first, which reads
        // as "half-broken" rather than "locked". Bailing out before any
        // drag state is created stops that pickup from happening at all.
        if (sessionRef.current.getSnapshot().phase === "battle") return;
        const local = e.getLocalPosition(app.stage);
        drag = {
          ...state,
          grabOffsetPx: { x: local.x - state.container.x, y: local.y - state.container.y },
        };
        if (state.kind === "board") draggingInstanceId = state.instanceId ?? null;
        state.container.alpha = 0.85;
        state.container.zIndex = 1000;
        updateDropPreview();
      }

      function updateDropPreview() {
        if (!drag) {
          dropPreview.clear();
          return;
        }
        const raw = pixelToCell(drag.container.x, drag.container.y);

        if (raw.row < 0) {
          if (drag.kind === "tray" && drag.item) {
            // Still hovering the tray band: preview a merge against
            // whichever other candidate slot it overlaps, if any.
            const target = findOverlappingTraySlot(drag, drag.item.offerId);
            dropPreview.clear();
            if (target) {
              const valid = canMerge(
                { instanceId: drag.item.offerId, speciesId: drag.item.speciesId, level: drag.item.level },
                { instanceId: target.item.offerId, speciesId: target.item.speciesId, level: target.item.level },
              );
              const { w: tw, h: th } = shapeSizePx(target.item.shape, TRAY_CELL, TRAY_TILE_MARGIN);
              drawSlotPreview(dropPreview, target.homePx, tw, th, valid);
            }
          } else {
            // Board piece dragged back into the tray band — always a valid drop.
            dropPreview.clear();
          }
          return;
        }

        const anchor = clampAnchor(drag.shape, raw);

        const cells = occupiedCells(drag.shape, anchor);
        const board = sessionRef.current.snapshot.board;
        const ignoreId = drag.kind === "board" ? drag.instanceId : undefined;
        const others = ignoreId ? board.filter((m) => m.instanceId !== ignoreId) : board;
        const overlap = cells.map((c) => findMonsterAtCell(others, c)).find((m) => m);

        let valid: boolean;
        if (overlap) {
          const moving =
            drag.kind === "board"
              ? board.find((m) => m.instanceId === drag!.instanceId)
              : drag.item && { instanceId: "__preview__", speciesId: drag.item.speciesId, level: drag.item.level };
          valid = !!moving && canMerge(overlap, moving);
        } else {
          valid = canPlace(board, drag.shape, anchor, ignoreId);
        }

        drawDropPreview(dropPreview, cells, valid);
      }

      app.stage.on("globalpointermove", (e) => {
        if (!drag) return;
        const local = e.getLocalPosition(app.stage);
        drag.container.position.set(local.x - drag.grabOffsetPx.x, local.y - drag.grabOffsetPx.y);
        updateDropPreview();
      });

      function endDrag() {
        if (!drag) return;
        const state = drag;
        drag = null;
        draggingInstanceId = null;
        dropPreview.clear();
        state.container.alpha = 1;
        state.container.zIndex = 0;
        const anchor: Vec2 = pixelToCell(state.container.x, state.container.y);

        if (state.kind === "board" && state.instanceId) {
          if (anchor.row < 0) {
            // Dropped above the board, into the tray/lane band: return it there.
            if (!sessionRef.current.discardMonster(state.instanceId)) snapBack(state);
          } else {
            const outcome = sessionRef.current.moveMonster(state.instanceId, anchor);
            if (outcome === "failed") {
              snapBack(state);
            } else if (outcome === "merged") {
              // `moveMonster` clamps the drop internally, so recompute the
              // same clamped anchor here rather than trusting the raw one
              // — otherwise a drop dragged out of bounds would glow at the
              // wrong (unclamped) spot.
              const { x, y } = cellTopLeft(clampAnchor(state.shape, anchor));
              const { w, h } = shapeSizePx(state.shape, CELL, BOARD_TILE_MARGIN);
              spawnMergeGlow(x + w / 2, y + h / 2);
            }
          }
        } else if (state.kind === "tray" && state.item) {
          if (anchor.row < 0) {
            // Still within the tray band: only a same-species/level slot
            // (merge) counts as a valid drop — otherwise snap back rather
            // than falling through to a board placement at row 0.
            const target = findOverlappingTraySlot(state, state.item.offerId);
            const mergedItem = target ? tryMergeTrayItems(target.item, state.item) : null;
            if (!target || !mergedItem || !sessionRef.current.mergeTrayItems(state.item.offerId, target.item.offerId)) {
              snapBack(state);
            } else {
              // Both source slots vanish and the merged result is appended
              // to the *end* of the tray (see useGameSession's
              // placeTrayItem/mergeTrayItems), so with one fewer candidate
              // every row's centering shifts — `target.homePx` is the
              // stale pre-merge slot. Predict the post-merge layout instead
              // of waiting for the next React render to run the real one.
              const predictedTray = sessionRef.current.tray
                .filter((i) => i.offerId !== state.item!.offerId && i.offerId !== target.item.offerId)
                .concat(mergedItem);
              const { positions } = computeTrayLayout(predictedTray);
              const pos = positions.get(mergedItem.offerId) ?? target.homePx;
              const { w, h } = shapeSizePx(target.item.shape, TRAY_CELL, TRAY_TILE_MARGIN);
              spawnMergeGlow(pos.x + w / 2, pos.y + h / 2);
            }
          } else {
            const outcome = sessionRef.current.placeTrayItem(state.item, anchor);
            if (outcome === "failed") {
              snapBack(state);
            } else if (outcome === "merged") {
              const { x, y } = cellTopLeft(clampAnchor(state.item.shape, anchor));
              const { w, h } = shapeSizePx(state.item.shape, CELL, BOARD_TILE_MARGIN);
              spawnMergeGlow(x + w / 2, y + h / 2);
            }
          }
        }
      }

      app.stage.on("pointerup", endDrag);
      app.stage.on("pointerupoutside", endDrag);

      function syncMonsters(board: PlacedMonster[]) {
        const seen = new Set<string>();
        for (const m of board) {
          seen.add(m.instanceId);
          let view = monsterViews.get(m.instanceId);
          const isNewView = !view;
          if (!view) {
            view = new MonsterView(m, textures, speciesAnim);
            // Starts invisible/shrunk so the very first frame it exists
            // in never flashes at full size before the pop-in tween below
            // has a chance to run.
            view.container.scale.set(0, 0);
            monsterViews.set(m.instanceId, view);
            monsterLayer.addChild(view.container);
            monsterSpriteLayer.addChild(view.spriteContainer);
            view.container.on("pointerdown", (e: FederatedPointerEvent) => {
              beginDrag(e, {
                kind: "board",
                instanceId: m.instanceId,
                shape: m.shape,
                container: view!.container,
                originPx: { x: view!.container.x, y: view!.container.y },
              });
            });
          }
          view.update(m, textures, speciesAnim);
          if (m.instanceId !== draggingInstanceId) {
            const { x, y } = cellTopLeft(m.anchor);
            view.container.position.set(x, y);
            // A newly-placed (from the tray) or newly-merged monster pops
            // onto the board instead of just appearing — mirrors the
            // level-up bounce below (`back.out`) for the same "juice".
            if (isNewView) {
              gsap.fromTo(view.container.scale, { x: 0, y: 0 }, { x: 1, y: 1, duration: 0.3, ease: "back.out(2)" });
            }
            // Sprites now render larger than their tile and spill upward
            // (see MONSTER_SIZE_BOOST), so a monster can visually overlap
            // the row behind it — sort by row so the one whose feet are
            // further down the board always draws in front (within the
            // sprite layer; tiles never overlap so their own order barely
            // matters, but the zIndex still mirrors over in syncPosition).
            view.container.zIndex = m.anchor.row;
          }
        }
        for (const [id, view] of monsterViews) {
          if (!seen.has(id)) {
            monsterLayer.removeChild(view.container);
            monsterSpriteLayer.removeChild(view.spriteContainer);
            monsterViews.delete(id);
          }
        }
      }

      function syncEnemies(enemies: EnemyInstance[], killed: Map<string, number>) {
        const seen = new Set<string>();
        for (const e of enemies) {
          seen.add(e.instanceId);
          let view = enemyViews.get(e.instanceId);
          if (!view) {
            view = new EnemyView(e, enemyTextures, enemyAnim);
            enemyViews.set(e.instanceId, view);
            enemyLayer.addChild(view.container);
            // Materializes in rather than snapping to full visibility the
            // instant it spawns — pairs with the fade-out `killPop` already
            // does on the other end of an enemy's life.
            view.container.alpha = 0;
            view.container.scale.set(0.6, 0.6);
            gsap.to(view.container, { alpha: 1, duration: 0.35, ease: "power1.out" });
            gsap.to(view.container.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(1.6)" });
          }
          view.update(e);
        }
        for (const [id, view] of enemyViews) {
          if (!seen.has(id)) {
            enemyViews.delete(id);
            const coinReward = killed.get(id);
            if (coinReward !== undefined) {
              // A kill can still whiff the coin flip (`coinReward === 0`) —
              // only pop the "+N" toast when something was actually earned.
              if (coinReward > 0) spawnCoinPopup(view.container.x, view.container.y, coinReward);
              view.killPop(() => enemyLayer.removeChild(view.container));
            } else {
              enemyLayer.removeChild(view.container);
            }
          }
        }
      }

      /** All candidates share one frame and the same fixed cell size — laid
       * out left-to-right, each only as wide as its own shape, wrapping onto
       * additional rows when a row would otherwise overflow the frame (e.g.
       * three wide h3 candidates at once) rather than growing the frame to
       * fit every combination. Each row is then centered independently
       * within the frame. Shared between `syncTray` (the actual visual
       * layout) and `endDrag`'s tray-merge glow, which needs to predict
       * where the surviving item will land *after* a merge shrinks the tray
       * and shifts every row's centering — without waiting for the next
       * React render to run this same layout for real. */
      function computeTrayLayout(tray: TrayItem[]) {
        const usableWidth = TRAY_FRAME_W - TRAY_PAD * 2;
        interface RowEntry {
          item: TrayItem;
          w: number;
          h: number;
        }
        const rows: RowEntry[][] = [];
        let currentRow: RowEntry[] = [];
        let currentRowWidth = 0;
        for (const item of tray) {
          const { w, h } = shapeSizePx(item.shape, TRAY_CELL, TRAY_TILE_MARGIN);
          if (currentRow.length > 0 && currentRowWidth + TRAY_ITEM_GAP + w > usableWidth) {
            rows.push(currentRow);
            currentRow = [];
            currentRowWidth = 0;
          }
          currentRowWidth += (currentRow.length > 0 ? TRAY_ITEM_GAP : 0) + w;
          currentRow.push({ item, w, h });
        }
        if (currentRow.length > 0) rows.push(currentRow);

        const rowHeights = rows.map((row) => Math.max(...row.map((r) => r.h)) + 14);
        const frameHeight =
          TRAY_PAD * 2 + rowHeights.reduce((sum, h) => sum + h, 0) + TRAY_ROW_GAP * Math.max(0, rows.length - 1);

        const positions = new Map<string, { x: number; y: number }>();
        let cursorY = TRAY_Y + TRAY_PAD;
        rows.forEach((row, rowIndex) => {
          const rowWidth = row.reduce((sum, r) => sum + r.w, 0) + TRAY_ITEM_GAP * Math.max(0, row.length - 1);
          let cursorX = TRAY_X0 + Math.max(TRAY_PAD, (TRAY_FRAME_W - rowWidth) / 2);
          row.forEach(({ item, w }) => {
            positions.set(item.offerId, { x: cursorX, y: cursorY });
            cursorX += w + TRAY_ITEM_GAP;
          });
          cursorY += rowHeights[rowIndex] + TRAY_ROW_GAP;
        });

        return { positions, frameHeight };
      }

      function syncTray(tray: TrayItem[]) {
        const key = tray.map((t) => t.offerId).join(",");
        if (key === renderedTrayKey) return;
        renderedTrayKey = key;

        const { positions, frameHeight } = computeTrayLayout(tray);
        // The frame box is the one piece redrawn unconditionally (cheap,
        // and its height must track whichever items exist right now) —
        // During battle the tray is empty (nothing to place), so it's
        // skipped entirely rather than leaving an empty outline on screen.
        traySlotLayer.removeChildren();
        if (tray.length > 0) traySlotLayer.addChild(drawTrayFrame(frameHeight));

        // New candidates fall in from just above the canvas's top edge,
        // staggered per item ("上から降ってくるように") — one shared
        // off-screen origin rather than a per-item offset, so a wrapped
        // second row falls further and the whole tray reads as one
        // cascade instead of every item dropping the same short distance.
        const TRAY_DROP_FROM_Y = -40;

        const seen = new Set<string>();
        tray.forEach((item, index) => {
          seen.add(item.offerId);
          const { w, h } = shapeSizePx(item.shape, TRAY_CELL, TRAY_TILE_MARGIN);
          const homePx = positions.get(item.offerId)!;

          // A candidate already on screen (this offerId survived from the
          // previous sync) just slides to wherever a removed/added sibling
          // pushed it — it must NOT replay the drop-in, or every drag/merge
          // that changes the tray's composition would make the *whole*
          // tray fall from the top again ("操作して動かすごとにその演出
          // が入る"), not just whatever's actually new. But `tryMergeTrayItems`
          // merges two candidates by keeping the *target's* offerId and only
          // bumping its level ("target keeps its offerId/slot") — so an
          // unchanged offerId doesn't always mean unchanged visuals, and
          // skipping the rebuild here made a tray merge's level-up silently
          // not render (art/label stayed on the old level).
          const existing = trayViews.get(item.offerId);
          const isStaleMergeResult = !!existing && (existing.item.level !== item.level || existing.item.shape !== item.shape);
          if (existing && !isStaleMergeResult) {
            existing.homePx = homePx;
            existing.item = item;
            gsap.to(existing.container, { x: homePx.x, y: homePx.y, duration: 0.25, ease: "power2.out" });
            return;
          }
          if (existing) {
            trayLayer.removeChild(existing.container);
            traySpriteLayer.removeChild(existing.spriteContainer);
            trayViews.delete(item.offerId);
          }

          const species = getSpecies(item.speciesId);
          const container = new Container();
          const body = new Graphics();
          drawBody(body, item.shape, species.color, TRAY_CELL, TRAY_TILE_MARGIN, 1, item.level);
          container.addChild(body);
          const stars = new Graphics();
          drawShapeStars(stars, item.shape, TRAY_CELL, TRAY_CELL * 0.32);
          container.addChild(stars);
          const spriteContainer = new Container();
          const texture = getMonsterTexture(textures, item.speciesId, item.level);
          if (texture) {
            const sprite = createMonsterSprite(
              texture,
              w,
              h,
              w * MONSTER_SIZE_BOOST,
              h * MONSTER_SIZE_BOOST,
              isSquareShape(item.shape),
            );
            spriteContainer.addChild(sprite);
          }
          const label = new Text({
            text: levelLabelText(item.shape, item.level),
            style: { fill: 0xffffff, fontSize: 14, fontWeight: "bold" },
          });
          label.position.set(2, 1);
          container.addChild(label);
          const nameLabel = new Text({
            text: species.name,
            style: { fill: 0xcfe8ff, fontSize: 10 },
          });
          nameLabel.position.set(0, h + 2);
          container.addChild(nameLabel);
          // A merge result appears in place with a pop (it didn't newly
          // enter the tray, an existing candidate just leveled up) —
          // only a genuinely new candidate drops in from off-screen.
          const startY = isStaleMergeResult ? homePx.y : TRAY_DROP_FROM_Y;
          container.position.set(homePx.x, startY);
          // Kept to the tile footprint, not the boosted sprite's full
          // bounds — see the matching note on MonsterView.updateHitArea
          // for why an expanded hitArea risks stealing clicks from a
          // tightly-packed neighboring candidate.
          container.hitArea = new Rectangle(0, 0, w, h);
          container.eventMode = "static";
          container.cursor = "grab";
          const view: TrayView = { container, spriteContainer, item, homePx };
          container.on("pointerdown", (e: FederatedPointerEvent) => {
            // Reads `view.homePx` (not the `homePx` local) so a drag begun
            // after this candidate has since been repositioned still snaps
            // back to its current slot, not the one it was created at.
            beginDrag(e, { kind: "tray", item, shape: item.shape, container, originPx: view.homePx });
          });
          spriteContainer.position.set(homePx.x, startY);
          trayLayer.addChild(container);
          traySpriteLayer.addChild(spriteContainer);
          trayViews.set(item.offerId, view);
          // `spriteContainer` isn't animated directly — the per-frame
          // mirror in the main tick loop copies both this tween and the
          // pop-in scale below onto it automatically.
          if (isStaleMergeResult) {
            gsap.fromTo(container.scale, { x: 0.5, y: 0.5 }, { x: 1, y: 1, duration: 0.25, ease: "back.out(2)" });
          } else {
            gsap.to(container, { y: homePx.y, duration: 0.5, delay: index * 0.08, ease: "back.out(1.6)" });
          }
        });

        for (const [offerId, view] of trayViews) {
          if (!seen.has(offerId)) {
            trayLayer.removeChild(view.container);
            traySpriteLayer.removeChild(view.spriteContainer);
            trayViews.delete(offerId);
          }
        }
      }

      // PixiJS's Ticker re-schedules its own next requestAnimationFrame at
      // the end of each `update()` call — an uncaught exception anywhere in
      // this listener aborts that call before the reschedule happens, which
      // silently kills the *entire* game loop for good (no more combat
      // ticks, no more attacks, nothing) rather than just skipping one
      // frame. A try/catch here trades "one frame's visuals glitch" for
      // "the whole game doesn't permanently freeze from a single bad frame".
      app.ticker.add((ticker) => {
        try {
          tickFrame(ticker.deltaMS);
        } catch (err) {
          console.error("GameCanvas: uncaught error in ticker frame", err);
        }
      });

      function tickFrame(deltaMS: number) {
        const events = sessionRef.current.tick(deltaMS);
        // `getSnapshot()`, not `.snapshot` — see the doc comment on
        // `GameSession.getSnapshot` for why the latter is stale here.
        const snap = sessionRef.current.getSnapshot();
        syncMonsters(snap.board);
        for (const view of monsterViews.values()) {
          view.tick(deltaMS);
          view.syncPosition();
        }

        // Launch this tick's attack projectiles *before* `syncEnemies`
        // below removes views for kills resolved this same tick — that
        // way a killing blow still gets its flying effect (using the
        // still-live view's last-known position) instead of silently
        // skipping it just because the target's HP already hit 0.
        // Combat math (hp, kills) is already resolved synchronously in
        // `tick()`; the HP bar / hit-flash are deliberately *not* updated
        // here — `applyPendingDamage` (passed as the projectile's
        // `onImpact`) catches them up only once the projectile visually
        // lands, so the bar never drops ahead of the effect that's
        // supposed to be causing it.
        for (const ev of events) {
          if (ev.type === "attack") {
            const attacker = snap.board.find((m) => m.instanceId === ev.monsterId);
            for (const id of ev.targetIds) {
              const enemyView = enemyViews.get(id);
              if (enemyView && attacker) {
                const from = monsterAttackOriginPx(attacker);
                const to = { x: enemyView.container.x, y: enemyView.container.y };
                spawnProjectile(
                  attacker.speciesId,
                  from,
                  to,
                  () => {
                    const liveHp = sessionRef.current.getSnapshot().enemies.find((e) => e.instanceId === id)?.hp;
                    if (liveHp !== undefined) enemyViews.get(id)?.applyPendingDamage(liveHp);
                  },
                  attacker.level,
                );
              }
            }
            monsterViews.get(ev.monsterId)?.attackPulse();
          }
        }

        const killed = new Map<string, number>();
        for (const ev of events) {
          if (ev.type === "enemyKilled") killed.set(ev.enemyId, ev.coinReward);
        }
        syncEnemies(snap.enemies, killed);
        for (const view of enemyViews.values()) view.tick(deltaMS);

        syncTray(sessionRef.current.tray);
        // Sprites live in a separate layer from their draggable tile
        // container (see traySpriteLayer above) — mirror position *and*
        // scale every frame so the split stays invisible across drag,
        // snap-back tweens, the drop-in fall, and the merge-result pop-in
        // (which animates `container.scale`), the same way
        // MonsterView.syncPosition() does for board monsters.
        for (const v of trayViews.values()) {
          v.spriteContainer.position.copyFrom(v.container.position);
          v.spriteContainer.scale.copyFrom(v.container.scale);
        }
      }
    })();

    return () => {
      destroyed = true;
      if (initialized) app.destroy(true, { children: true });
    };
  }, []);

  // `touchAction: "none"` stops the browser from treating a press-and-hold
  // drag gesture here as a scroll/selection gesture of its own — without
  // it, a long-press on a monster (to start dragging it) could instead
  // trigger the browser's native text-selection or (on mobile) its
  // copy/share callout, fighting with Pixi's own pointer-based dragging.
  // This wrapper is sized to the canvas's own fixed dimensions up front
  // (rather than only once Pixi appends its canvas inside), so the loading
  // overlay below has something to sit on top of immediately.
  return (
    <div style={{ position: "relative", width: CANVAS_W, height: CANVAS_H }}>
      <div ref={containerRef} className="inline-block" style={{ touchAction: "none" }} />
      {!assetsLoaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            background: "rgba(14,23,32,0.92)",
            borderRadius: 16,
          }}
        >
          <span style={{ fontSize: 13, opacity: 0.85 }}>読み込み中...</span>
          <div style={{ width: 160, height: 8, borderRadius: 999, background: "#2a3d52", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.round(loadProgress * 100)}%`,
                height: "100%",
                background: "var(--accent)",
                transition: "width 0.15s ease",
              }}
            />
          </div>
          <span style={{ fontSize: 12, opacity: 0.6 }}>{Math.round(loadProgress * 100)}%</span>
        </div>
      )}
    </div>
  );
}
