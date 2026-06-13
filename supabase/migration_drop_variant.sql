-- The animals.variant boolean was never read anywhere (real variants live in
-- public.animal_variants). Drop the dead column.
alter table public.animals drop column if exists variant;
