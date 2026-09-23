-- =====================================================================
-- Migration: server-side state for the "Ordre d'élevage" tab.
-- Replaces the browser localStorage storage so a session started on one device
-- continues on another. Both tables are personal (RLS on auth.uid()).
-- Run once in the SQL Editor (or `supabase db query --linked -f <this file>`).
-- =====================================================================

-- Saved configurations (one row each): species + pair groups + the probability
-- reached at save time (so the next session resumes where the last one ended).
create table if not exists public.user_breeding_configs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  animal_id  bigint not null references public.animals(id) on delete cascade,
  p_pct      numeric,                        -- saved current probability (%); null = base
  groups     jsonb not null default '[]',    -- PairGroupDef[]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_breeding_configs enable row level security;

drop policy if exists user_breeding_configs_select_own on public.user_breeding_configs;
create policy user_breeding_configs_select_own
  on public.user_breeding_configs for select to authenticated using (user_id = auth.uid());
drop policy if exists user_breeding_configs_insert_own on public.user_breeding_configs;
create policy user_breeding_configs_insert_own
  on public.user_breeding_configs for insert to authenticated with check (user_id = auth.uid());
drop policy if exists user_breeding_configs_update_own on public.user_breeding_configs;
create policy user_breeding_configs_update_own
  on public.user_breeding_configs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists user_breeding_configs_delete_own on public.user_breeding_configs;
create policy user_breeding_configs_delete_own
  on public.user_breeding_configs for delete to authenticated using (user_id = auth.uid());

-- The in-progress session (one row per user).
create table if not exists public.user_breeding_session (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  animal_id  bigint references public.animals(id) on delete set null,
  p_pct      numeric not null default 4,
  groups     jsonb not null default '[]',    -- PairGroup[] (ids included)
  config_id  uuid references public.user_breeding_configs(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.user_breeding_session enable row level security;

drop policy if exists user_breeding_session_select_own on public.user_breeding_session;
create policy user_breeding_session_select_own
  on public.user_breeding_session for select to authenticated using (user_id = auth.uid());
drop policy if exists user_breeding_session_insert_own on public.user_breeding_session;
create policy user_breeding_session_insert_own
  on public.user_breeding_session for insert to authenticated with check (user_id = auth.uid());
drop policy if exists user_breeding_session_update_own on public.user_breeding_session;
create policy user_breeding_session_update_own
  on public.user_breeding_session for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists user_breeding_session_delete_own on public.user_breeding_session;
create policy user_breeding_session_delete_own
  on public.user_breeding_session for delete to authenticated using (user_id = auth.uid());
