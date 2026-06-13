-- =====================================================================
-- Migration: animal variants (coats) + per-user variant ownership.
-- Run once in the Supabase SQL Editor (or via psql).
-- =====================================================================

-- Catalog of variant coats. Stats are inherited from the base animal (not stored).
create table if not exists public.animal_variants (
  id            bigint generated always as identity primary key,
  animal_id     bigint not null references public.animals(id) on delete cascade,
  coat_name     text   not null,
  obtained_from text,
  release_date  date,
  unique (animal_id, coat_name)
);
alter table public.animal_variants enable row level security;

drop policy if exists animal_variants_read on public.animal_variants;
create policy animal_variants_read
  on public.animal_variants for select to authenticated using (true);

drop policy if exists animal_variants_admin_insert on public.animal_variants;
create policy animal_variants_admin_insert
  on public.animal_variants for insert to authenticated with check (public.is_admin());

drop policy if exists animal_variants_admin_update on public.animal_variants;
create policy animal_variants_admin_update
  on public.animal_variants for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists animal_variants_admin_delete on public.animal_variants;
create policy animal_variants_admin_delete
  on public.animal_variants for delete to authenticated using (public.is_admin());

-- Per-user variant ownership (owned + max level for collections).
create table if not exists public.user_variants (
  user_id    uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  variant_id bigint  not null references public.animal_variants(id) on delete cascade,
  owned      boolean not null default false,
  max_level  int,
  updated_at timestamptz not null default now(),
  primary key (user_id, variant_id)
);
alter table public.user_variants enable row level security;

drop policy if exists user_variants_select_own on public.user_variants;
create policy user_variants_select_own
  on public.user_variants for select to authenticated using (user_id = auth.uid());

drop policy if exists user_variants_insert_own on public.user_variants;
create policy user_variants_insert_own
  on public.user_variants for insert to authenticated with check (user_id = auth.uid());

drop policy if exists user_variants_update_own on public.user_variants;
create policy user_variants_update_own
  on public.user_variants for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_variants_delete_own on public.user_variants;
create policy user_variants_delete_own
  on public.user_variants for delete to authenticated using (user_id = auth.uid());
