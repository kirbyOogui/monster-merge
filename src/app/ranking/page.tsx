import type { CSSProperties } from "react";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { secondaryButtonStyle, startButtonStyle } from "@/components/ui/button-styles";

export const dynamic = "force-dynamic";

interface RankingRow {
  id: string;
  player_name: string;
  kill_count: number;
  wave_reached: number;
  created_at: string;
}

async function fetchTopRankings(): Promise<RankingRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("rankings")
    .select("id, player_name, kill_count, wave_reached, created_at")
    .order("kill_count", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) {
    console.error("Failed to fetch rankings", error);
    return [];
  }
  return data ?? [];
}

const MEDALS = ["🥇", "🥈", "🥉"];
/** gold / silver / bronze accents for the top three rows. */
const TIER = [
  { border: "#f0c94e", tint: "rgba(240,201,78,0.09)" },
  { border: "#cfd8e3", tint: "rgba(207,216,227,0.07)" },
  { border: "#cd8b45", tint: "rgba(205,139,69,0.09)" },
];

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

const cell: CSSProperties = { padding: "10px 12px", textAlign: "center" };

export default async function RankingPage() {
  const rankings = await fetchTopRankings();

  return (
    <main
      style={{
        flex: 1,
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 22,
        padding: "36px 20px 44px",
        textAlign: "center",
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(78,203,113,0.16), transparent 55%), linear-gradient(180deg, #16281c 0%, #0e1720 60%)",
      }}
    >
      <header className="rise-in" style={{ animationDelay: "0ms" }}>
        <h1 style={{ margin: 0, fontSize: "1.7rem", letterSpacing: "0.02em" }}>🏆 ランキング</h1>
        <p style={{ margin: "6px 0 0", fontSize: "0.78rem", opacity: 0.55 }}>撃破数 トップ20</p>
      </header>

      <div
        className="rise-in"
        style={{
          animationDelay: "90ms",
          width: "100%",
          maxWidth: 440,
          background: "var(--panel)",
          border: "1px solid #2a3d52",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 10px 34px rgba(0,0,0,0.28)",
        }}
      >
        {rankings.length === 0 ? (
          <div
            style={{
              padding: "40px 22px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ fontSize: "2.2rem", lineHeight: 1 }}>🏅</div>
            <p style={{ margin: 0, fontWeight: 600 }}>まだ記録がありません</p>
            <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.6 }}>
              ゲームをプレイして最初の記録を作ろう！
            </p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr
                style={{
                  background: "rgba(255,255,255,0.04)",
                  fontSize: "0.72rem",
                  letterSpacing: "0.04em",
                  opacity: 0.7,
                }}
              >
                <th style={{ ...cell, width: 46 }}>順位</th>
                <th style={{ ...cell, textAlign: "left" }}>名前</th>
                <th style={cell}>⚔️ 撃破</th>
                <th style={cell}>🌊 Wave</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((row, i) => {
                const tier = TIER[i];
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderTop: "1px solid #24384a",
                      background: tier ? tier.tint : i % 2 ? "rgba(255,255,255,0.02)" : "transparent",
                    }}
                  >
                    <td
                      style={{
                        ...cell,
                        width: 46,
                        fontWeight: 700,
                        fontSize: tier ? "1.05rem" : "0.9rem",
                        borderLeft: `3px solid ${tier ? tier.border : "transparent"}`,
                      }}
                    >
                      {tier ? MEDALS[i] : i + 1}
                    </td>
                    <td style={{ ...cell, textAlign: "left", overflowWrap: "anywhere" }}>
                      <div style={{ fontWeight: 600 }}>{row.player_name}</div>
                      <div style={{ fontSize: "0.7rem", opacity: 0.4 }}>{shortDate(row.created_at)}</div>
                    </td>
                    <td style={{ ...cell, fontWeight: 700, color: "var(--accent)" }}>{row.kill_count}</td>
                    <td style={{ ...cell, opacity: 0.85 }}>{row.wave_reached}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div
        className="rise-in"
        style={{ animationDelay: "180ms", display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}
      >
        <Link className="press-btn" href="/" style={{ ...secondaryButtonStyle(true), padding: "12px 24px" }}>
          タイトルへ
        </Link>
        <Link className="press-btn" href="/game" style={{ ...startButtonStyle(true), padding: "12px 24px" }}>
          プレイする
        </Link>
      </div>
    </main>
  );
}
