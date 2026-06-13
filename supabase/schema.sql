-- =====================================================================
-- zoo2-personal-helper schema
-- Run in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- Then run seed.sql to populate the catalog.
-- =====================================================================

-- ---------- Shared animal catalog ----------
create table if not exists public.animals (
  id                       bigint generated always as identity primary key,
  name_en                  text not null unique,
  name_fr                  text,
  biome                    text,
  shelter_lvl              int,
  variant                  boolean not null default false,
  price_value              numeric,
  price_unit               text,
  size                     numeric,
  breed_proba              numeric,   -- fraction, e.g. 0.04
  breed_cost               numeric,
  breed_duration           text,      -- e.g. "12h"
  xp_feeding_value         numeric,
  xp_feeding_time          text,      -- e.g. "14h 20m"
  xp_playing_value         numeric,
  xp_playing_time          text,
  xp_cleaning_value        numeric,
  xp_cleaning_time         text,
  max_animal_per_enclosure int,
  popularity               numeric,
  base_selling_price       numeric,
  wiki_title               text,
  url                      text
);

alter table public.animals enable row level security;

-- Read access for any signed-in user (anonymous users also have the `authenticated` role).
drop policy if exists animals_read on public.animals;
create policy animals_read
  on public.animals for select
  to authenticated
  using (true);
-- No write policy: the catalog is only modified through the SQL Editor (service role),
-- i.e. the admin. Open this up later if in-app editing is needed.

-- ---------- Per-user personal state ----------
create table if not exists public.user_animals (
  user_id           uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  animal_id         bigint  not null references public.animals(id) on delete cascade,
  owned             boolean not null default false,
  breeding_unlocked boolean not null default false,
  updated_at        timestamptz not null default now(),
  primary key (user_id, animal_id)
);

alter table public.user_animals enable row level security;

drop policy if exists user_animals_select_own on public.user_animals;
create policy user_animals_select_own
  on public.user_animals for select
  to authenticated using (user_id = auth.uid());

drop policy if exists user_animals_insert_own on public.user_animals;
create policy user_animals_insert_own
  on public.user_animals for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists user_animals_update_own on public.user_animals;
create policy user_animals_update_own
  on public.user_animals for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_animals_delete_own on public.user_animals;
create policy user_animals_delete_own
  on public.user_animals for delete
  to authenticated using (user_id = auth.uid());
