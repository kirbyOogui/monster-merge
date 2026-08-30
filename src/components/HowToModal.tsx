"use client";

import Image from "next/image";
import { type CSSProperties, useCallback, useEffect, useState } from "react";

interface Slide {
  /** Also the base name of the slide's image(s) under /assets/howto/ —
   * heading number and page are the same index. */
  n: number;
  title: string;
  images: string[];
  body: string;
}

const SLIDES: Slide[] = [
  {
    n: 1,
    title: "ゲームの目的",
    images: ["/assets/howto/1.jpg"],
    body: "4×4の盤面にモンスターを置いて、上から攻めてくる敵を迎え撃とう。敵が拠点にたどり着くと体力が減り、0になるとゲームオーバー。",
  },
  {
    n: 2,
    title: "モンスターを配置する",
    images: ["/assets/howto/2.jpg"],
    body: "ウェーブ開始前に、下の枠の候補モンスターを盤面へドラッグ。モンスターごとに形（大きさ）が違い、盤面は16マス。置き方を工夫しよう。",
  },
  {
    n: 3,
    title: "合体して強化する",
    images: ["/assets/howto/3-before.jpg", "/assets/howto/3-after.jpg"],
    body: "同じ種類・同じレベルのモンスターを重ねると、1つ上のレベルに合体。レベルが上がるほど攻撃が強くなり、枠の色とLv表記で見分けられる。合体するとマスも空く。",
  },
  {
    n: 4,
    title: "戦闘で拠点を守る",
    images: ["/assets/howto/4.jpg"],
    body: "「ウェーブ開始」で敵が出現。モンスターは自動で、拠点にいちばん近い敵から攻撃する（戦闘中は配置を変えられない）。倒しきれず拠点に着いた敵は、倒すまで体力を削り続ける。",
  },
  {
    n: 5,
    title: "ウェーブを重ねる",
    images: ["/assets/howto/5.jpg"],
    body: "ウェーブを乗り切ると、新しい候補3体をもらって増強できる。敵を倒すと手に入るコインで候補の「更新」も可能。ウェーブが進むほど敵は強くなる。撃破数と到達ウェーブがスコアになる。",
  },
];

const arrowStyle = (enabled: boolean): CSSProperties => ({
  width: 44,
  height: 44,
  flexShrink: 0,
  borderRadius: 999,
  border: "1px solid #2a3d52",
  background: "rgba(20,32,44,0.9)",
  color: "var(--foreground)",
  fontSize: 22,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: enabled ? "pointer" : "default",
  opacity: enabled ? 1 : 0.35,
});

/** Full-screen "使い方" carousel. No routing — the slides live on one
 * horizontal track that translates by whole viewports, so the current
 * slide leaves and the next enters from off-screen. Controlled: parent
 * owns `open`. */
export default function HowToModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const last = SLIDES.length - 1;

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.min(last, Math.max(0, i + delta)));
  }, [last]);

  // Reset to slide 1 each time it opens — done during render (React's
  // "adjusting state on a prop change" pattern) rather than in an effect.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIndex(0);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, go]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="使い方"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(10,16,22,0.85)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(92vw, 380px)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--panel)",
          border: "1px solid #2a3d52",
          borderRadius: 20,
          overflow: "hidden",
        }}
      >
        <button
          onClick={onClose}
          aria-label="閉じる"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 1,
            width: 32,
            height: 32,
            borderRadius: 999,
            border: "1px solid #2a3d52",
            background: "rgba(20,32,44,0.9)",
            color: "var(--foreground)",
            fontSize: 16,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            cursor: "pointer",
          }}
        >
          ✕
        </button>

        <div style={{ flex: 1, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              transform: `translateX(-${index * 100}%)`,
              transition: "transform 0.35s ease",
            }}
          >
            {SLIDES.map((s) => (
              <div
                key={s.n}
                style={{
                  // 0 0 100%: never grow/shrink, basis = one viewport wide.
                  // (An `auto` basis lets a slide balloon to its unwrapped
                  // paragraph's max-content width.)
                  flex: "0 0 100%",
                  boxSizing: "border-box",
                  padding: "20px 20px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  overflowY: "auto",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 28 }}>
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      flexShrink: 0,
                      borderRadius: 999,
                      background: "var(--accent)",
                      color: "#0b2f16",
                      fontWeight: 800,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {s.n}
                  </span>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{s.title}</h3>
                </div>

                {/* Grid (not flex) so the square boxes size off definite
                    tracks — a flex + aspect-ratio combo blew the box width
                    out on some viewports. */}
                <div
                  style={
                    s.images.length > 1
                      ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }
                      : { display: "block" }
                  }
                >
                  {s.images.map((src) => (
                    <div
                      key={src}
                      style={{
                        position: "relative",
                        width: "100%",
                        aspectRatio: "1 / 1",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "#0b1118",
                      }}
                    >
                      <Image
                        src={src}
                        alt=""
                        fill
                        draggable={false}
                        sizes="320px"
                        style={{ objectFit: "cover" }}
                      />
                    </div>
                  ))}
                </div>

                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, opacity: 0.9 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 14px",
            borderTop: "1px solid #2a3d52",
          }}
        >
          <button
            className="press-btn"
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="前へ"
            style={arrowStyle(index !== 0)}
          >
            ←
          </button>

          <div style={{ display: "flex", gap: 6 }}>
            {SLIDES.map((s, i) => (
              <span
                key={s.n}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: i === index ? "var(--accent)" : "#2a3d52",
                  transition: "background 0.2s",
                }}
              />
            ))}
          </div>

          <button
            className="press-btn"
            onClick={() => go(1)}
            disabled={index === last}
            aria-label="次へ"
            style={arrowStyle(index !== last)}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

/** Self-contained button + modal, for drop-in on the title screen. */
export function HowToLauncher({ className, style }: { className?: string; style?: CSSProperties }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} style={style} onClick={() => setOpen(true)}>
        使い方
      </button>
      <HowToModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
