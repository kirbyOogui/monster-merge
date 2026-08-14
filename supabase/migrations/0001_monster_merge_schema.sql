-- Dedicated schema for this app within the shared "hint-bot" Supabase
-- project, isolated from other apps' schemas (case7, ragmvp, cs_chat, etc).
create schema if not exists monster_merge;

create table if not exists monster_merge.rankings (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 20),
  kill_count integer not null check (kill_count >= 0),
  wave_reached integer not null check (wave_reached >= 0),
  created_at timestamptz not null default now()
);

create index if not exists rankings_kill_count_idx
  on monster_merge.rankings (kill_count desc, created_at asc);

alter table monster_merge.rankings enable row level security;

-- All access goes through Next.js API routes using the service role key
-- (which bypasses RLS), so no anon/authenticated policies are defined —
-- RLS is enabled purely as defense-in-depth against direct PostgREST access.
