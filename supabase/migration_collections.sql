-- =====================================================================
-- Migration: collections + their requirements (shared catalog).
-- A collection = a named set of requirements; each requirement is an animal
-- (base or a specific variant coat) at a minimum level. Progress is derived from
-- the user's max_level per animal / variant. Run once in the SQL Editor (or psql).
-- =====================================================================

create table if not exists public.collections (
  id     bigint generated always as identity primary key,
  name   text not null unique,
  sector text,   -- e.g. "Main Zoo, Fir Grove and Kujali Park", "Terrarium House"…
  star   int,    -- difficulty: 1 / 2 / 3
  sort   int     -- display order
);
alter table public.collections enable row level security;

drop policy if exists collections_read on public.collections;
create policy collections_read on public.collections for select to authenticated using (true);
drop policy if exists collections_admin_write on public.collections;
create policy collections_admin_write on public.collections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists public.collection_requirements (
  id             bigint generated always as identity primary key,
  collection_id  bigint not null references public.collections(id) on delete cascade,
  animal_id      bigint not null references public.animals(id) on delete cascade,
  variant_id     bigint references public.animal_variants(id) on delete cascade, -- null = base animal
  required_level int not null
);
alter table public.collection_requirements enable row level security;

drop policy if exists collection_requirements_read on public.collection_requirements;
create policy collection_requirements_read on public.collection_requirements for select to authenticated using (true);
drop policy if exists collection_requirements_admin_write on public.collection_requirements;
create policy collection_requirements_admin_write on public.collection_requirements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
