-- MedIndex Phase 4 — map the Phase 3 personal-data UUID to a future Supabase Auth user.
-- This does not move Favorites/Prescriptions yet; current production login stays intact.

alter table public.profiles
  add column if not exists legacy_user_id uuid;

create unique index if not exists profiles_legacy_user_id_unique_idx
  on public.profiles (legacy_user_id)
  where legacy_user_id is not null;

comment on column public.profiles.legacy_user_id is
  'Temporary trusted migration mapping from the Phase 3 MedIndex user UUID to auth.users.id. Not client-updatable; remove only after personal-data IDs are remapped and verified.';

revoke update (legacy_user_id) on public.profiles from authenticated;
