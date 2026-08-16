import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { secondaryButtonStyle } from "@/components/ui/button-styles";

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

export default async function RankingPage() {
  const rankings = await fetchTopRankings();

  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        padding: 24,
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "1.5rem" }}>ランキング</h1>

      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--panel)",
          border: "1px solid #2a3d52",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {rankings.length === 0 ? (
          <p style={{ padding: 20, opacity: 0.75 }}>まだ記録がありません</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.05)" }}>
                <th style={cellStyle}>#</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>名前</th>
                <th style={cellStyle}>撃破数</th>
                <th style={cellStyle}>Wave</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((row, i) => (
                <tr key={row.id} style={{ borderTop: "1px solid #2a3d52" }}>
                  <td style={cellStyle}>{i + 1}</td>
                  <td style={{ ...cellStyle, textAlign: "left" }}>{row.player_name}</td>
                  <td style={cellStyle}>{row.kill_count}</td>
                  <td style={cellStyle}>{row.wave_reached}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Link
        className="press-btn"
        href="/"
        style={secondaryButtonStyle(true)}
      >
        タイトルへ戻る
      </Link>
    </main>
  );
}

const cellStyle: React.CSSProperties = { padding: "8px 12px", textAlign: "center" };
