import Link from "next/link";
import { secondaryButtonStyle, startButtonStyle } from "@/components/ui/button-styles";

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
        <h1 style={{ fontSize: "2rem", marginBottom: 8, textShadow: "0 2px 0 rgba(0,0,0,0.4)" }}>
          モンスター合体タワーディフェンス
        </h1>
        <p style={{ opacity: 0.75, fontSize: "0.95rem" }}>
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
