"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useGameSession } from "@/hooks/useGameSession";
import { CANVAS_H, CANVAS_W, SPAWN_HEADROOM } from "@/components/pixi/layout";
import { rerollButtonStyle, secondaryButtonStyle, startButtonStyle } from "@/components/ui/button-styles";

const GameCanvas = dynamic(() => import("@/components/pixi/GameCanvas"), {
  ssr: false,
  loading: () => (
    <div style={{ width: CANVAS_W, height: CANVAS_H, display: "flex", alignItems: "center", justifyContent: "center" }}>
      読み込み中...
    </div>
  ),
});

export default function GamePage() {
  const session = useGameSession();
  const { snapshot } = session;
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // Pause menu ("中断できるように") — opening it freezes the simulation
  // (see the `paused` prop on GameCanvas) rather than just overlaying a
  // menu on top of a run that keeps playing out underneath.
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  // The info panel above the canvas is taller during "initial-placement"/
  // "reward" (extra instructions + buttons) than during "battle" (just the
  // Wave/coins/kills row) — scoring the scale off whatever height is
  // currently mounted meant the *whole* scaled layout visibly shrank every
  // time a wave ended and the panel grew back
  // ("ウェーブ間になると画面全体が小さくなってしまう"), so this locks
  // permanently to a single reference height instead of ever recomputing
  // per-transition. That reference is the *largest* natural height ever
  // observed (not the smallest) — `<main>` below is `overflow: hidden`
  // with no scrolling, so anything taller than the locked reference has
  // nowhere to go and just gets silently clipped off the bottom, which
  // used to genuinely happen during reward/retry ("ウェーブ間の比率...変
  // になるかも", "リトライをすると画面比率がおかしくなる" — an earlier
  // version of this locked to the *smallest* height instead, betting that
  // battle's shorter panel would always be the one that stuck; retry
  // going back to a taller "initial-placement" panel after battle had
  // already locked in the shorter one broke that bet). Locking to the
  // tallest instead means every phase fits with room to spare, at the
  // cost of battle not being quite as maximally large as the old
  // shortest-wins version was.
  const maxNaturalHeightRef = useRef(0);
  // An invisible spacer around the panel reserves the same "tallest ever"
  // amount of space too — otherwise, even with the scale itself locked
  // (above), the board/HP bar below the panel would still slide up and
  // down by however much shorter the current phase's panel happens to
  // be, since they're just normal-flow siblings under it
  // ("体力バーとモンスターの枠も位置固定できない？ウェーブ間の位置を
  // 基準にして" — reward's panel is the tall one, so that's the position
  // everything else now stays pinned to, in every phase). The *visible*
  // panel box itself (background/border) is deliberately not stretched to
  // fill that reserved space — it stays sized to whatever's actually in
  // it, e.g. just the one-line Wave/coins/kills row during battle
  // ("枠が大きいままになってますが...小さくする"), leaving open
  // background showing between it and the board rather than resizing the
  // board to close that gap.
  const panelRef = useRef<HTMLDivElement>(null);
  const maxPanelHeightRef = useRef(0);
  const [panelMinHeight, setPanelMinHeight] = useState(0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    function updateScale() {
      if (!el) return;
      const naturalHeight = el.scrollHeight;
      // `env(safe-area-inset-top)` has no direct JS accessor — a
      // zero-size probe element with that as its padding, measured via
      // getComputedStyle, is the standard workaround. Needed so the scale
      // math below accounts for the same inset `<main>`'s own top padding
      // reserves in CSS (see the `padding` comment further down) —
      // without it, content sized to fill the *full* viewport height
      // would overflow past the bottom once that top inset pushes
      // everything down.
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;top:0;left:0;height:0;padding-top:env(safe-area-inset-top,0px);";
      document.body.appendChild(probe);
      const safeAreaTop = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      document.body.removeChild(probe);
      // GameCanvas's own root div starts with no explicit height and only
      // gets its real size once Pixi's async `app.init()` resolves and
      // appends the canvas (see GameCanvas.tsx) — so there's a brief
      // window, right after the dynamic import resolves but before that
      // effect finishes, where this container is mounted but collapsed to
      // near-zero height. Without this guard, that transient (near-zero)
      // reading is harmless to `Math.max` itself, but would otherwise
      // still trigger a `setScale` call using it as the divisor — briefly
      // pinning the scale at an enormous, broken value (this actually
      // happened: "変なところでドアップになって操作不能"). The canvas
      // itself is always exactly CANVAS_H once mounted, so anything
      // shorter than that is this transitional state, not a real reading.
      if (naturalHeight < CANVAS_H) return;
      maxNaturalHeightRef.current = Math.max(maxNaturalHeightRef.current, naturalHeight);
      // Same "tallest ever" tracking, but for the panel alone — see
      // `panelMinHeight` above. The panel is never absent, so there's no
      // near-zero transitional reading to guard against here the way
      // `naturalHeight` needs the `< CANVAS_H` check above.
      const panelHeight = panelRef.current?.scrollHeight ?? 0;
      if (panelHeight > maxPanelHeightRef.current) {
        maxPanelHeightRef.current = panelHeight;
        setPanelMinHeight(panelHeight);
      }
      // Prioritize filling the full vertical space ("縦いっぱいに使う") — this
      // portrait-oriented game is almost always height-constrained on a
      // typical wide PC window, so a width cap here just leaves unused
      // space below instead of protecting against real overflow.
      // The extra 48px (on top of the existing 16px breathing room) is a
      // safety margin for mobile browser chrome (address bar) — on a phone,
      // `window.innerHeight` doesn't always leave quite enough real room,
      // and content that's even slightly too tall gets center-clipped top
      // and bottom by `<main>`'s `overflow: hidden` ("体力バーがurlの領域
      // で隠れてしまいます" / "コインと倒した数も見えなかった"). `safeAreaTop`
      // is on top of that again — `<main>`'s own top padding reserves that
      // same inset (see below) so the Wave/menu-button row clears the iOS
      // status bar/notch instead of rendering underneath it
      // ("wave表記も時刻とかぶってる" / "５Gや充電マークとかぶってしまう").
      const availableHeight = window.innerHeight - 16 - 48 - safeAreaTop;
      const next = availableHeight / maxNaturalHeightRef.current;
      setScale(next > 0 ? next : 1);
    }

    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    window.addEventListener("resize", updateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, []);

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        // Top-aligned, not centered: if the content is ever taller than the
        // real available height (see the mobile safety margin above),
        // `overflow: hidden` should only ever clip from the bottom. Centered
        // alignment was clipping symmetrically from *both* edges instead —
        // cutting into the Wave/coins/kills row at the very top as well as
        // the HP bar at the bottom on phones ("コインと倒した数も見えな
        // かった").
        justifyContent: "flex-start",
        width: "100vw",
        height: "100dvh",
        // No scrolling, by design: the scale is locked to the *tallest*
        // panel variant ever seen (see `maxNaturalHeightRef` above), so
        // nothing should actually need to clip here in normal use — this
        // stays `hidden` only as a last-resort safety net, not the
        // mechanism anything is meant to rely on.
        overflow: "hidden",
        padding: 8,
        // Top padding also reserves the iOS status bar/notch's safe area
        // — `viewportFit: "cover"` (see layout.tsx) lets this page's
        // background extend under it, but actual content (the Wave row,
        // the menu button) needs to start clear of it, not underneath.
        paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
        // The actual game (Pixi canvas) is a fixed CANVAS_W-wide portrait
        // strip, so on any screen wider than that there's open space on
        // both sides — this single CSS layer is the *only* place the
        // forest art is ever rendered on this page. `GameCanvas`'s own Pixi
        // stage is transparent (`backgroundAlpha: 0`) specifically so this
        // one image shows straight through it instead of a second,
        // independently-scaled copy being drawn inside the canvas — two
        // renderings of the same file at different scales was exactly what
        // produced a visible seam at the canvas's edges before
        // ("継ぎ目"). `cover` + `center` also keeps this image's own
        // horizontal center aligned with the canvas's (both are centered
        // on the viewport), at the cost of the in-game road appearing
        // wider than its gameplay lane on very wide screens — an accepted
        // tradeoff ("拡大することで道幅が大きくなるのは構わない").
        backgroundImage: "url(/assets/backgrounds/forest_battlefield.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        ref={contentRef}
        style={{
          position: "relative",
          width: CANVAS_W,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}>
        {snapshot.phase !== "gameover" && (
          // Absolutely positioned so it overlays the existing layout
          // without shifting anything else ("他の要素の配置は変えない
          // ように") — the gameover overlay already offers the same
          // destinations, so this is hidden there instead of stacking a
          // second menu on top of it.
          <button
            className="press-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="メニュー"
            style={{
              position: "absolute",
              // A bigger hit target than the original 32px
              // ("メニューボタン押しずらい"). `top` is a fixed pixel value
              // (measured against the "ウェーブ開始" button's own position
              // during initial-placement, in this box's unscaled local
              // coordinate space) landing just below it — chosen so the
              // button stays put at that same spot in every phase,
              // including "battle" once that row disappears entirely
              // ("ウェーブ間のウエーブ開始ボタンの下くらいにして、始まっ
              // てもそこ固定で"), rather than tracking the button live.
              top: 100,
              right: 4,
              zIndex: 20,
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              borderRadius: 999,
              border: "1px solid #2a3d52",
              background: "rgba(20,32,44,0.85)",
              color: "var(--foreground)",
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            ☰
          </button>
        )}

        <div
          style={{
            // Invisible spacer only — reserves the tallest-ever-seen panel
            // height (see `panelMinHeight` above) so the board/HP bar below
            // never shift position between phases, without forcing the
            // *visible* panel box (below) to stay stretched to that same
            // height. During battle, that leaves empty space between the
            // now form-fitted 1-line panel and the board — accepted as the
            // tradeoff for keeping the board pinned ("他の要素はつめたり
            // せず、そのままの位置になるようにする" / "敵の行動範囲が長く
            // なるようならそれで大丈夫"). `border-box` matches the same
            // `scrollHeight` basis the measurement itself uses.
            boxSizing: "border-box",
            minHeight: panelMinHeight || undefined,
            marginBottom: 6,
            // The canvas below is pulled up (negative margin) so its
            // transparent top overlaps this spacer's lower region — which
            // would otherwise let the canvas swallow clicks meant for the
            // panel's buttons ("ウェーブ開始ボタンが押せない"). Stack this
            // above the canvas, but keep the empty reserved area
            // click-through (pointerEvents:none here, re-enabled only on
            // the visible panel box below) so it never blocks the lane.
            position: "relative",
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          <div
            ref={panelRef}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "8px 10px",
              fontSize: 13,
              background: "rgba(20,32,44,0.85)",
              border: "1px solid #2a3d52",
              borderRadius: 16,
              // Sized to its own current content only ("枠が大きいまま
              // になってますが、1行分で足りるので小さくする") — the
              // wrapper above is what reserves the extra room, not this.
              // Re-enable clicks here (parent spacer is pointerEvents:none)
              // so the buttons work where the pulled-up canvas overlaps.
              pointerEvents: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700 }}>Wave {snapshot.wave}</span>
              <div style={{ display: "flex", gap: 12, opacity: 0.9 }}>
                <span>🪙 {snapshot.coins}</span>
                <span>撃破 {snapshot.killCount}</span>
              </div>
            </div>

            {snapshot.phase === "initial-placement" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2, fontSize: 12 }}>
                <span style={{ opacity: 0.8 }}>3体を盤面へドラッグ</span>
                <button
                  className="press-btn"
                  disabled={!session.canStartFirstWave}
                  onClick={session.startFirstWave}
                  style={startButtonStyle(session.canStartFirstWave)}
                >
                  ウェーブ開始
                </button>
              </div>
            )}

            {snapshot.phase === "reward" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2, fontSize: 12 }}>
                <span style={{ opacity: 0.8 }}>盤面へドラッグして配置</span>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="press-btn"
                    onClick={session.reroll}
                    disabled={snapshot.coins < snapshot.rerollCost}
                    style={rerollButtonStyle(snapshot.coins >= snapshot.rerollCost)}
                  >
                    更新 ({snapshot.rerollCost})
                  </button>
                  <button className="press-btn" onClick={session.nextWave} style={startButtonStyle(true)}>
                    次のウェーブへ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* The canvas is `SPAWN_HEADROOM`px taller than the play area (extra
            room at the TOP for enemies to spawn against the collapsed
            battle panel — see layout.ts). Pulling it up by exactly that
            much overlaps the panel spacer's empty lower region without
            moving the board/HP bar: the canvas grew and shifted up by the
            same amount, so its bottom edge — and everything after it —
            stays put. */}
        <div style={{ width: "100%", overflowX: "auto", marginTop: -SPAWN_HEADROOM }}>
          <GameCanvas session={session} paused={menuOpen} />
        </div>

        <HpBar hp={snapshot.baseHp} maxHp={snapshot.baseMaxHp} />

        {snapshot.phase === "gameover" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              background: "rgba(10,16,22,0.92)",
              // Above the panel spacer's `zIndex: 1` (added so it wins the
              // click over the pulled-up canvas) — without this the Wave
              // row would paint on top of the gameover screen.
              zIndex: 3,
            }}
          >
            <h2 style={{ marginBottom: 8 }}>ゲームオーバー</h2>
            <p style={{ marginBottom: 20, fontSize: 20 }}>撃破数: {snapshot.killCount}</p>
            <ScoreSubmitForm killCount={snapshot.killCount} waveReached={snapshot.wave} />
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <Link className="press-btn" href="/" style={secondaryButtonStyle(true)}>
                タイトルへ
              </Link>
              <Link className="press-btn" href="/ranking" style={startButtonStyle(true)}>
                ランキングへ
              </Link>
            </div>
          </div>
        )}
      </div>

      {menuOpen && (
        // Rendered as a sibling of the scaled `contentRef` div, not inside
        // it — that div carries `transform: scale(...)`, and a
        // `transform` on an ancestor re-anchors any `position: fixed`
        // descendant to *that ancestor's* box instead of the real
        // viewport. Escaping it here is what lets `inset: 0` actually
        // cover the whole screen ("画面全体") regardless of the game's
        // current zoom level, not just the CANVAS_W-wide game area.
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10,16,22,0.85)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "stretch",
              width: 240,
              padding: "28px 24px 24px",
              borderRadius: 20,
              border: "1px solid #2a3d52",
              background: "var(--panel)",
              textAlign: "center",
            }}
          >
            <h2 style={{ marginBottom: 4 }}>メニュー</h2>
            <button className="press-btn" onClick={closeMenu} style={startButtonStyle(true)}>
              再開
            </button>
            <button
              className="press-btn"
              onClick={() => {
                session.resetRun();
                closeMenu();
              }}
              style={rerollButtonStyle(true)}
            >
              リトライ
            </button>
            <Link className="press-btn" href="/" style={secondaryButtonStyle(true)}>
              タイトルへ戻る
            </Link>
            <Link className="press-btn" href="/ranking" style={secondaryButtonStyle(true)}>
              ランキングへ
            </Link>
            <button className="press-btn" onClick={closeMenu} style={secondaryButtonStyle(true)}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ScoreSubmitForm({ killCount, waveReached }: { killCount: number; waveReached: number }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/ranking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: trimmed, killCount, waveReached }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  };

  if (status === "done") {
    return <p style={{ fontSize: 13, color: "var(--accent)" }}>ランキングに登録しました</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 20))}
          placeholder="名前を入力"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #2a3d52",
            background: "var(--panel)",
            color: "var(--foreground)",
            fontSize: 14,
            width: 160,
          }}
        />
        <button
          className="press-btn"
          onClick={submit}
          disabled={!name.trim() || status === "submitting"}
          style={rerollButtonStyle(!!name.trim() && status !== "submitting")}
        >
          {status === "submitting" ? "送信中…" : "登録"}
        </button>
      </div>
      {status === "error" && <p style={{ fontSize: 12, color: "var(--danger)" }}>送信に失敗しました</p>}
    </div>
  );
}

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const ratio = Math.max(0, hp / maxHp);
  const prevHpRef = useRef(hp);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (hp < prevHpRef.current) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 300);
      prevHpRef.current = hp;
      return () => clearTimeout(t);
    }
    prevHpRef.current = hp;
  }, [hp]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        marginTop: 6,
        background: "rgba(20,32,44,0.85)",
        border: shaking ? "1px solid var(--danger)" : "1px solid #2a3d52",
        borderRadius: 16,
        animation: shaking ? "hp-shake 0.3s" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <span>❤️</span>
        <span style={{ fontWeight: 700 }}>
          {hp}/{maxHp}
        </span>
      </div>
      <div style={{ width: "100%", height: 12, background: "#2a2a2a", borderRadius: 999, overflow: "hidden" }}>
        <div
          style={{
            width: `${ratio * 100}%`,
            height: "100%",
            background: ratio > 0.3 ? "var(--accent)" : "var(--danger)",
            transition: "width 0.2s ease",
          }}
        />
      </div>
    </div>
  );
}
