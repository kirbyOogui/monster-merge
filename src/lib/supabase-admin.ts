import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client for the shared "hint-bot" Supabase project, scoped to
 * this app's dedicated `monster_merge` schema (isolated from the other
 * apps' schemas sharing the same project: case7, case8, salon, etc).
 * Uses the service role key — never import this from client components.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase env vars are not set (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, serviceRoleKey, {
    db: { schema: "monster_merge" },
    auth: { persistSession: false },
  });
}
