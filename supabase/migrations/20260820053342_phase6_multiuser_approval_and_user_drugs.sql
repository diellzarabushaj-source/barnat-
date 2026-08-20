-- MedIndex Phase 6 — multi-user access with owner approval + per-user personal drugs
--
-- Two additive changes:
--   1. New Supabase Auth users land in `pending` and cannot read anything until an
--      admin approves them. Existing profiles keep their current status.
--   2. `public.user_drugs` stores personal drug entries that belong to exactly one
--      user. Shared/official drugs stay in `public.drugs` and are admin-only.
--
-- No existing row is moved, re-encrypted or re-owned by this migration.

-- 1. Pending status -------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('pending','active','suspended','disabled'));

-- New signups must be approved before they can use MedIndex. Existing rows keep
-- whatever status they already have, so the owner stays active.
alter table public.profiles
  alter column status set default 'pending';

-- `private.is_active_user()` and `private.is_admin()` already require
-- status = 'active', so a pending profile is denied by every existing policy.

create index if not exists profiles_status_created_idx
  on public.profiles (status, created_at desc);

-- 2. Personal drugs -------------------------------------------------------

create table if not exists public.user_drugs (
  id uuid primary key default gen_random_uuid(),
  -- Private storage owner. Deliberately not a foreign key: the historical owner's
  -- storage UUID predates Supabase Auth and is bridged through profiles.legacy_user_id.
  user_id uuid not null,
  client_id text not null check (char_length(client_id) between 1 and 160),
  name text not null check (char_length(name) between 1 and 300),
  payload jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create index if not exists user_drugs_user_updated_idx
  on public.user_drugs (user_id, updated_at desc);
create index if not exists user_drugs_user_active_idx
  on public.user_drugs (user_id) where deleted_at is null;

drop trigger if exists user_drugs_set_updated_at on public.user_drugs;
create trigger user_drugs_set_updated_at
  before update on public.user_drugs
  for each row
  execute function private.set_updated_at();

alter table public.user_drugs enable row level security;

-- Runtime reads and writes go through the server-only secret key, matching every
-- other private MedIndex table. Direct browser privileges stay revoked; the
-- own-row policies below keep isolation intact if a direct grant is ever added.
revoke all on public.user_drugs from anon, authenticated;

create policy user_drugs_select_own
on public.user_drugs
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);

create policy user_drugs_insert_own
on public.user_drugs
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);

create policy user_drugs_update_own
on public.user_drugs
for update
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_user())
)
with check (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);

create policy user_drugs_delete_own
on public.user_drugs
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);
