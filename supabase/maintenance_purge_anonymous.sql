-- =====================================================================
-- Maintenance: purge stale anonymous users.
-- Every visitor gets an anonymous auth user; the ones who never secured their
-- account and never came back pile up in auth.users. Run this from time to time
-- (SQL Editor, or `supabase db query --linked -f <this file>`).
-- "Stale" = no session refreshed in the last 30 days (`last_sign_in_at` is not
-- reliable: token refreshes do not update it). Personal rows cascade away.
-- =====================================================================

delete from auth.users u
where u.is_anonymous is true
  and not exists (
    select 1 from auth.sessions s
    where s.user_id = u.id
      and coalesce(s.refreshed_at, s.updated_at, s.created_at) > now() - interval '30 days'
  );
