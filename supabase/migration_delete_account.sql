-- =====================================================================
-- Migration: self-service account deletion.
-- Lets a signed-in user (anonymous or permanent) delete their own auth user.
-- Personal rows (user_animals, user_variants, user_shelters, app_admins) go
-- away through the existing `on delete cascade` foreign keys.
-- Run once in the SQL Editor. Idempotent.
-- =====================================================================

create or replace function public.delete_own_account()
  returns void
  language sql security definer
  set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
