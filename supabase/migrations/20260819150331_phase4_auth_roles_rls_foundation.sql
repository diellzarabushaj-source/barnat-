-- MedIndex Phase 4 — Supabase Auth + admin/doctor + RLS foundation
-- Applied to Supabase project ftuchtmolddhhsdcwnqe on 2026-08-19.
-- Additive by design: production medical reads and Neon rollback paths remain untouched.

create schema if not exists private;

revoke all on schema private from public;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  specialty text,
  license_number text,
  role text not null default 'doctor' check (role in ('doctor','admin')),
  status text not null default 'active' check (status in ('active','suspended','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_status_idx
  on public.profiles (role, status);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    avatar_url
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists medindex_auth_user_profile_created on auth.users;
create trigger medindex_auth_user_profile_created
  after insert on auth.users
  for each row
  execute function private.handle_new_auth_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function private.set_updated_at();

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url, specialty, license_number) on public.profiles to authenticated;

grant usage on schema private to authenticated;
revoke execute on function private.is_active_user() from public, anon;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_admin() to authenticated;

create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    id = (select auth.uid())
    or (select private.is_admin())
  )
);

create policy profiles_update_own_active
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
  and (select private.is_active_user())
)
with check (
  id = (select auth.uid())
  and (select private.is_active_user())
);

create table if not exists public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  content text not null default '' check (char_length(content) <= 10000),
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, drug_id)
);

create index if not exists user_notes_user_updated_idx
  on public.user_notes (user_id, updated_at desc);
create index if not exists user_notes_drug_idx
  on public.user_notes (drug_id);

drop trigger if exists user_notes_set_updated_at on public.user_notes;
create trigger user_notes_set_updated_at
  before update on public.user_notes
  for each row
  execute function private.set_updated_at();

alter table public.user_notes enable row level security;
revoke all on public.user_notes from anon, authenticated;
grant select, insert, update, delete on public.user_notes to authenticated;

create policy user_notes_select_own
on public.user_notes
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);

create policy user_notes_insert_own
on public.user_notes
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);

create policy user_notes_update_own
on public.user_notes
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

create policy user_notes_delete_own
on public.user_notes
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row
  execute function private.set_updated_at();

alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from anon, authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;

create policy user_preferences_select_own
on public.user_preferences
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);

create policy user_preferences_insert_own
on public.user_preferences
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);

create policy user_preferences_update_own
on public.user_preferences
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

create policy user_preferences_delete_own
on public.user_preferences
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);

-- The Phase 3 copies remain intact. Phase 4 only opens authenticated, own-row access.
-- Legacy protocol note rows remain inaccessible to authenticated clients; notes now have their own table.
alter table public.user_favorites enable row level security;
revoke all on public.user_favorites from anon, authenticated;
grant select, insert, update, delete on public.user_favorites to authenticated;

create policy user_favorites_select_own_drugs
on public.user_favorites
for select
to authenticated
using (
  entity_type = 'drug'
  and user_id = (select auth.uid())
  and (select private.is_active_user())
);

create policy user_favorites_insert_own_drugs
on public.user_favorites
for insert
to authenticated
with check (
  entity_type = 'drug'
  and user_id = (select auth.uid())
  and (select private.is_active_user())
);

create policy user_favorites_update_own_drugs
on public.user_favorites
for update
to authenticated
using (
  entity_type = 'drug'
  and user_id = (select auth.uid())
  and (select private.is_active_user())
)
with check (
  entity_type = 'drug'
  and user_id = (select auth.uid())
  and (select private.is_active_user())
);

create policy user_favorites_delete_own_drugs
on public.user_favorites
for delete
to authenticated
using (
  entity_type = 'drug'
  and user_id = (select auth.uid())
  and (select private.is_active_user())
);

alter table public.user_prescriptions enable row level security;
revoke all on public.user_prescriptions from anon, authenticated;
grant select, insert, update, delete on public.user_prescriptions to authenticated;

create policy user_prescriptions_select_own
on public.user_prescriptions
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);

create policy user_prescriptions_insert_own
on public.user_prescriptions
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);

create policy user_prescriptions_update_own
on public.user_prescriptions
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

create policy user_prescriptions_delete_own
on public.user_prescriptions
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_user())
);
