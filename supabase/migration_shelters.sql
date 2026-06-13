-- =====================================================================
-- Migration: per-biome shelters + owned_count/max_level on user_animals.
-- Run once in Supabase SQL Editor (the base schema must already exist).
-- =====================================================================

-- ---------- user_animals: owned_count (0/1/2) + max_level ----------
alter table public.user_animals add column if not exists owned_count smallint not null default 0;
alter table public.user_animals add column if not exists max_level int;

-- Best-effort migration of the previous `owned` boolean, if still present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_animals' and column_name = 'owned'
  ) then
    update public.user_animals set owned_count = case when owned then 1 else 0 end;
  end if;
end $$;

alter table public.user_animals drop column if exists owned;
alter table public.user_animals drop column if exists breeding_unlocked;

-- owned_count semantics: 0 = none, 1 = exactly one, 2 = two or more ("2+").
alter table public.user_animals drop constraint if exists user_animals_owned_count_chk;
alter table public.user_animals add constraint user_animals_owned_count_chk check (owned_count between 0 and 2);

-- ---------- user_shelters: one shelter per biome, per user ----------
create table if not exists public.user_shelters (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  biome      text not null,
  level      int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, biome)
);

alter table public.user_shelters enable row level security;

drop policy if exists user_shelters_select_own on public.user_shelters;
create policy user_shelters_select_own
  on public.user_shelters for select
  to authenticated using (user_id = auth.uid());

drop policy if exists user_shelters_insert_own on public.user_shelters;
create policy user_shelters_insert_own
  on public.user_shelters for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists user_shelters_update_own on public.user_shelters;
create policy user_shelters_update_own
  on public.user_shelters for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_shelters_delete_own on public.user_shelters;
create policy user_shelters_delete_own
  on public.user_shelters for delete
  to authenticated using (user_id = auth.uid());
