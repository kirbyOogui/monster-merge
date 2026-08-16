"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useGameSession } from "@/hooks/useGameSession";
import { CANVAS_H, CANVAS_W } from "@/components/pixi/layout";
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
  // The info panel above the canvas is taller during "initial-placement"/
  // "reward" (extra instructions + buttons) than during "battle" (just the
  // Wave/coins/kills row) — scoring the scale off whatever height is
  // currently mounted meant the *whole* scaled layout visibly shrank every
  // time a wave ended and the panel grew back
  // ("ウェーブ間になると画面全体が小さくなってしまう"). Tracking the
  // smallest natural height ever observed — instead of the current one —
  // and never growing it back down fixes the game at the larger scale
  // battle's shorter panel allows, permanently, the first time battle is
  // reached ("大きい方で固定してほしい"). During initial-placement/reward,
  // the panel is then occasionally taller than this fixed reference; rather
  // than shrinking everything to compensate, `overflowY: auto` on `<main>`
  // (below) lets the user scroll that rare extra bit instead.
  const minNaturalHeightRef = useRef(Infinity);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    function updateScale() {
      if (!el) return;
      const naturalHeight = el.scrollHeight;
      // GameCanvas's own root div starts with no explicit height and only
      // gets its real size once Pixi's async `app.init()` resolves and
      // appends the canvas (see GameCanvas.tsx) — so there's a brief
      // window, right after the dynamic import resolves but before that
      // effect finishes, where this container is mounted but collapsed to
      // near-zero height. Without this guard, that transient reading could
      // get latched in as the "smallest ever seen" natural height below,
      // permanently pinning the scale at an enormous, broken value (this
      // actually happened: "変なところでドアップになって操作不能"). The
      // canvas itself is always exactly CANVAS_H once mounted, so anything
      // shorter than that is this transitional state, not a real reading.
      if (naturalHeight < CANVAS_H) return;
      minNaturalHeightRef.current = Math.min(minNaturalHeightRef.current, naturalHeight);
      // Prioritize filling the full vertical space ("縦いっぱいに使う") — this
      // portrait-oriented game is almost always height-constrained on a
      // typical wide PC window, so a width cap here just leaves unused
      // space below instead of protecting against real overflow.
      // The extra 48px (on top of the existing 16px breathing room) is a
      // safety margin for mobile browser chrome (address bar) — on a phone,
      // `window.innerHeight` doesn't always leave quite enough real room,
      // and content that's even slightly too tall gets center-clipped top
      // and bottom by `<main>`'s `overflow: hidden` ("体力バーがurlの領域
      // で隠れてしまいます" / "コインと倒した数も見えなかった").
      const availableHeight = window.innerHeight - 16 - 48;
      const next = availableHeight / minNaturalHeightRef.current;
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
        // No scrolling, by design: the scale is fixed to battle's shorter
        // panel height (see `minNaturalHeightRef` above), so
        // initial-placement/reward's occasionally-taller panel can in rare
        // cases not fully fit at that size — any excess is clipped instead
        // of either shrinking the whole layout back down or scrolling.
        overflow: "hidden",
        padding: 8,
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "8px 10px",
            fontSize: 13,
            background: "rgba(20,32,44,0.85)",
            border: "1px solid #2a3d52",
            borderRadius: 16,
            marginBottom: 6,
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
                  onClick={session.reroll}
                  disabled={snapshot.coins < snapshot.rerollCost}
                  style={rerollButtonStyle(snapshot.coins >= snapshot.rerollCost)}
                >
                  更新 ({snapshot.rerollCost})
                </button>
                <button onClick={session.nextWave} style={startButtonStyle(true)}>
                  次のウェーブへ
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ width: "100%", overflowX: "auto" }}>
          <GameCanvas session={session} />
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
            }}
          >
            <h2 style={{ marginBottom: 8 }}>ゲームオーバー</h2>
            <p style={{ marginBottom: 20, fontSize: 20 }}>撃破数: {snapshot.killCount}</p>
            <ScoreSubmitForm killCount={snapshot.killCount} waveReached={snapshot.wave} />
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <Link href="/" style={secondaryButtonStyle(true)}>
                タイトルへ
              </Link>
              <Link href="/ranking" style={startButtonStyle(true)}>
                ランキングへ
              </Link>
            </div>
          </div>
        )}
      </div>
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
