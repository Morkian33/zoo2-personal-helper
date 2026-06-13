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

-- Best-effort FR seeds for biomes (edit later if needed).
insert into public.biome_labels (name_en, name_fr) values
  ('Aviary', 'Volière'),
  ('Forest', 'Forêt'),
  ('Freshwater', 'Eau douce'),
  ('Grassland', 'Prairie'),
  ('Ice', 'Banquise'),
  ('Jungle', 'Jungle'),
  ('Leafy Thicket', 'Sous-bois'),
  ('Mountain', 'Montagne'),
  ('Nocturnal', 'Nocturne'),
  ('Plains', 'Plaines'),
  ('Rocky Desert', 'Désert rocheux'),
  ('Saltwater', 'Eau salée'),
  ('Savanna', 'Savane'),
  ('Water', 'Aquatique'),
  ('Water Oceanside Zoo', 'Zoo Océanside')
on conflict (name_en) do nothing;
