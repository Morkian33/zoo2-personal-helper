-- =====================================================================
-- Migration: FR biome labels (global) + per-variant FR coat name.
-- Coats are NOT a bijective translation (e.g. Harlequin -> Tigré), so the FR
-- name lives per variant; biomes are a fixed category, so a shared lookup is fine.
-- Run once in the Supabase SQL Editor (or via psql).
-- =====================================================================

-- Per-variant FR coat name.
alter table public.animal_variants add column if not exists coat_name_fr text;

-- Global biome labels.
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

-- FR biome names (Zoo 2 in-game terms).
insert into public.biome_labels (name_en, name_fr) values
  ('Aviary', 'Aviarium'),
  ('Forest', 'Forêt'),
  ('Freshwater', 'Aquarium eau douce'),
  ('Grassland', 'Herbe'),
  ('Ice', 'Glace'),
  ('Jungle', 'Jungle'),
  ('Leafy Thicket', 'Terrarium feuillu'),
  ('Mountain', 'Montagne'),
  ('Nocturnal', 'Noctarium'),
  ('Plains', 'Steppe'),
  ('Rocky Desert', 'Terrarium rocheux'),
  ('Saltwater', 'Aquarium eau salé'),
  ('Savanna', 'Savane'),
  ('Water', 'Eau'),
  ('Water Oceanside Zoo', 'Zoo en eau libre')
on conflict (name_en) do update set name_fr = excluded.name_fr;
