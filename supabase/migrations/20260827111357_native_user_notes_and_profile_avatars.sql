-- Native personal notes + persistent profile avatars.
-- Applied to production as Supabase migration 20260827111357.
-- Legacy user_favorites note rows are kept as compatibility fallback.

alter table public.user_notes
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_notes'::regclass
      and conname = 'user_notes_content_length_check'
  ) then
    alter table public.user_notes
      add constraint user_notes_content_length_check
      check (char_length(content) <= 2000);
  end if;
end
$$;

create index if not exists user_notes_user_live_updated_idx
  on public.user_notes (user_id, updated_at desc)
  where deleted_at is null;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'profile-avatars', 'profile-avatars', false, 1048576,
  array['image/jpeg']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.user_notes (
  user_id, drug_id, content, client_updated_at, deleted_at, created_at, updated_at
)
select
  p.id,
  d.id,
  case when uf.deleted_at is null
    then left(coalesce(uf.payload->>'text', ''), 2000)
    else ''
  end,
  coalesce(uf.client_updated_at, uf.updated_at),
  uf.deleted_at,
  coalesce(uf.created_at, now()),
  coalesce(uf.updated_at, now())
from public.user_favorites uf
join public.profiles p
  on p.id = uf.user_id
  or p.legacy_user_id = uf.user_id
join public.drugs d
  on d.registry_number = (
    substring(uf.entity_key from '^drug-note:registry:([0-9]+)$')
  )::integer
where uf.entity_type = 'protocol'
  and uf.entity_key ~ '^drug-note:registry:[0-9]+$'
on conflict (user_id, drug_id) do update
set
  content = excluded.content,
  client_updated_at = excluded.client_updated_at,
  deleted_at = excluded.deleted_at,
  updated_at = excluded.updated_at
where
  coalesce(excluded.client_updated_at, excluded.updated_at)
  >= coalesce(public.user_notes.client_updated_at, public.user_notes.updated_at);
