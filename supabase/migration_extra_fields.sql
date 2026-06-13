-- =====================================================================
-- Migration: extra catalog fields (release date + "feed x2" coin cost).
-- Run once in the Supabase SQL Editor.
-- =====================================================================
alter table public.animals add column if not exists release_date date;
alter table public.animals add column if not exists feed_x2_cost numeric; -- coins
