import Image from "next/image";
import Link from "next/link";
import TitleFooter from "@/components/TitleFooter";
import { secondaryButtonStyle, startButtonStyle } from "@/components/ui/button-styles";

export default function TitlePage() {
  return (
    <main
      style={{
        flex: 1,
        // Fixed to the viewport height (rather than growing with content)
        // and clipped, matching /game's no-scroll policy — a title screen
        // is a single held frame, not a document to scroll through.
        height: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        padding: "24px 16px",
        textAlign: "center",
        background:
          "radial-gradient(ellipse at 50% 30%, rgba(78,203,113,0.18), transparent 60%), linear-gradient(180deg, #16281c 0%, #0e1720 70%)",
      }}
    >
      <div>
        <div className="title-logo-row">
          <Image
            src="/assets/title-logo.png"
            alt="がったいモンスターズ"
            width={1536}
            height={1024}
            priority
            style={{ width: "min(85vw, 440px)", height: "auto" }}
          />
        </div>
        <p style={{ opacity: 0.75, fontSize: "0.95rem", marginTop: 16 }}>
          4×4の盤面にモンスターを配置・合体させて、押し寄せる敵を迎え撃とう
        </p>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 16, width: 240 }}>
        <Link className="press-btn" href="/game" style={{ ...startButtonStyle(true), padding: "14px 0", fontSize: "1.1rem" }}>
          スタート
        </Link>
        <Link className="press-btn" href="/ranking" style={{ ...secondaryButtonStyle(true), padding: "14px 0" }}>
          ランキング
        </Link>
      </nav>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 32 }}>
        <p style={{ opacity: 0.5, fontSize: "0.75rem", margin: 0 }}>縦画面推奨（PC / スマホブラウザ対応）</p>
        <TitleFooter />
      </div>
    </main>
  );
}
