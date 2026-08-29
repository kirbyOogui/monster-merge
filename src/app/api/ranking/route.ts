import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Upper bounds for the two score fields. The leaderboard has no auth or
 * economy behind it, so these aren't a security boundary — they exist so
 * that an absurd client value (or `1e21`, which passes `Number.isInteger`)
 * can't reach Postgres and blow up the `integer` column with an
 * out-of-range error. Both are far above any achievable real run and well
 * inside int32 (2_147_483_647).
 */
const MAX_KILL_COUNT = 1_000_000;
const MAX_WAVE_REACHED = 100_000;
const MAX_NAME_LEN = 20;

/**
 * Best-effort per-IP throttle. On Vercel this Map lives per serverless
 * instance and resets on cold start, so it's a speed bump against casual
 * flooding, not a real rate limiter — good enough for a cosmetic
 * leaderboard. Fixed 60s window, 10 writes per IP.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const recentByIp = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const fresh = (recentByIp.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  fresh.push(now);
  recentByIp.set(ip, fresh);
  // Opportunistic cleanup so the Map can't grow unbounded on a
  // long-lived instance.
  if (recentByIp.size > 5000) {
    for (const [key, times] of recentByIp) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) recentByIp.delete(key);
    }
  }
  return fresh.length > RATE_MAX;
}

/** Strip control + format chars (newlines, zero-width, bidi overrides) and
 * collapse internal whitespace so a display name can't grief the table. */
function sanitizeName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

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
    typeof killCount !== "number" ||
    !Number.isInteger(killCount) ||
    killCount < 0 ||
    killCount > MAX_KILL_COUNT ||
    typeof waveReached !== "number" ||
    !Number.isInteger(waveReached) ||
    waveReached < 0 ||
    waveReached > MAX_WAVE_REACHED ||
    typeof playerName !== "string"
  ) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const name = sanitizeName(playerName);
  if (name.length === 0 || name.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("rankings").insert({
    player_name: name,
    kill_count: killCount,
    wave_reached: waveReached,
  });

  if (error) {
    // Don't leak the Postgres error text to the client.
    console.error("Failed to insert ranking", error);
    return NextResponse.json({ error: "could not save score" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
