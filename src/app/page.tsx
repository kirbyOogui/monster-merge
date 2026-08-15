import type { CSSProperties } from "react";
import Link from "next/link";
import { secondaryButtonStyle, startButtonStyle } from "@/components/ui/button-styles";

/** Small 4-pointed sparkle, flanking the logo — echoes the ☆ tile motif and
 * the merge-glow effect's gold sparkle particles (`GameCanvas.tsx`'s
 * `spawnMergeGlow`), tying the title screen to the game's own visual language. */
function Sparkle({ size, delay }: { size: number; delay: number }) {
  const style: CSSProperties = {
    width: size,
    height: size,
    background: "linear-gradient(135deg, #fff3c4, #ffd24d)",
    clipPath: "polygon(50% 0%, 61% 35%, 100% 50%, 61% 65%, 50% 100%, 39% 65%, 0% 50%, 39% 35%)",
    animation: `title-twinkle 2.4s ease-in-out ${delay}s infinite`,
    flexShrink: 0,
  };
  return <div style={style} />;
}

export default function TitlePage() {
  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        padding: 24,
        textAlign: "center",
        background:
          "radial-gradient(ellipse at 50% 30%, rgba(78,203,113,0.18), transparent 60%), linear-gradient(180deg, #16281c 0%, #0e1720 70%)",
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            animation: "title-float 3.5s ease-in-out infinite, title-glow 3.5s ease-in-out infinite",
          }}
        >
          <Sparkle size={16} delay={0} />
          <h1
            style={{
              fontFamily: "var(--font-dot-gothic)",
              fontSize: "clamp(2.1rem, 9vw, 3rem)",
              letterSpacing: "0.04em",
              lineHeight: 1.3,
              color: "#ffd24d",
              background: "linear-gradient(180deg, #fff3c4 0%, #ffd24d 55%, #f0c94e 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter:
                "drop-shadow(-2px 0 0 #231409) drop-shadow(2px 0 0 #231409) drop-shadow(0 -2px 0 #231409) drop-shadow(0 3px 0 #231409)",
            }}
          >
            がったいモンスターズ
          </h1>
          <Sparkle size={16} delay={1.2} />
        </div>
        <p style={{ opacity: 0.75, fontSize: "0.95rem", marginTop: 16 }}>
          4×4の盤面にモンスターを配置・合体させて、押し寄せる敵を迎え撃とう
        </p>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 16, width: 240 }}>
        <Link href="/game" style={{ ...startButtonStyle(true), padding: "14px 0", fontSize: "1.1rem" }}>
          スタート
        </Link>
        <Link href="/ranking" style={{ ...secondaryButtonStyle(true), padding: "14px 0" }}>
          ランキング
        </Link>
      </nav>

      <p style={{ opacity: 0.5, fontSize: "0.75rem", marginTop: 32 }}>縦画面推奨（PC / スマホブラウザ対応）</p>
    </main>
  );
}
