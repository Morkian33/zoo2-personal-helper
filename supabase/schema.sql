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
  release_date             date,
  feed_x2_cost             numeric,   -- coins cost for the "feed x2" boost
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
-- owned_count: 0 = none, 1 = exactly one, 2 = two or more ("2+", i.e. can breed).
-- max_level: highest level reached for this animal (for collections).
create table if not exists public.user_animals (
  user_id      uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  animal_id    bigint  not null references public.animals(id) on delete cascade,
  owned_count  smallint not null default 0 check (owned_count between 0 and 2),
  max_level    int,
  updated_at   timestamptz not null default now(),
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

-- ---------- Per-user shelters (one per biome) ----------
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

-- ---------- Admin role + catalog write access ----------
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;

drop policy if exists app_admins_read_self on public.app_admins;
create policy app_admins_read_self
  on public.app_admins for select
  to authenticated using (user_id = auth.uid());

create or replace function public.is_admin()
  returns boolean
  language sql security definer stable set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated;

-- Add your admin user id here:
-- insert into public.app_admins (user_id) values ('<your-user-id>') on conflict do nothing;

drop policy if exists animals_admin_insert on public.animals;
create policy animals_admin_insert
  on public.animals for insert to authenticated with check (public.is_admin());

drop policy if exists animals_admin_update on public.animals;
create policy animals_admin_update
  on public.animals for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists animals_admin_delete on public.animals;
create policy animals_admin_delete
  on public.animals for delete to authenticated using (public.is_admin());

-- ---------- Animal variants (coats) ----------
-- Same stats as the base animal (inherited); only coat/source/release differ.
create table if not exists public.animal_variants (
  id            bigint generated always as identity primary key,
  animal_id     bigint not null references public.animals(id) on delete cascade,
  coat_name     text   not null,
  coat_name_fr  text,
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

-- ---------- Per-user variant ownership ----------
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

-- ---------- Global FR biome labels ----------
create table if not exists public.biome_labels (
  name_en text primary key,
  name_fr text
);
alter table public.biome_labels enable row level security;
drop policy if exists biome_labels_read on public.biome_labels;
create policy biome_labels_read on public.biome_labels for select to authenticated using (true);
drop policy if exists biome_labels_admin_write on public.biome_labels;
create policy biome_labels_admin_write on public.biome_labels for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
