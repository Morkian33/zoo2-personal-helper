-- Per-user favorite flag for animals (starred in "Mes animaux").
alter table public.user_animals add column if not exists favorite boolean not null default false;
