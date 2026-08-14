import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { playerName, killCount, waveReached } = body as {
    playerName?: unknown;
    killCount?: unknown;
    waveReached?: unknown;
  };

  if (
    typeof playerName !== "string" ||
    playerName.trim().length === 0 ||
    playerName.length > 20 ||
    typeof killCount !== "number" ||
    !Number.isInteger(killCount) ||
    killCount < 0 ||
    typeof waveReached !== "number" ||
    !Number.isInteger(waveReached) ||
    waveReached < 0
  ) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("rankings").insert({
    player_name: playerName.trim(),
    kill_count: killCount,
    wave_reached: waveReached,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
