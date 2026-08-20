-- Professional registration verification for the MedIndex multi-user backend.
-- Additive and fail-closed: pending accounts cannot be activated without an
-- approved private document, and document access remains server-only.

alter table public.profiles
  add column if not exists verification_status text not null default 'missing',
  add column if not exists verification_submitted_at timestamptz,
  add column if not exists verification_reviewed_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_verification_status_check;

alter table public.profiles
  add constraint profiles_verification_status_check
  check (verification_status in ('missing', 'submitted', 'verified', 'rejected'));

create table if not exists public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 38 and 500),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size integer not null check (byte_size between 1 and 3145728),
  sha256_hex text not null check (sha256_hex ~ '^[a-f0-9]{64}$'),
  status text not null default 'uploaded' check (status in ('uploaded', 'approved', 'rejected')),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists verification_documents_user_created_idx
  on public.verification_documents (user_id, created_at desc);

create unique index if not exists verification_documents_one_uploaded_idx
  on public.verification_documents (user_id)
  where status = 'uploaded';

drop trigger if exists verification_documents_set_updated_at on public.verification_documents;
create trigger verification_documents_set_updated_at
  before update on public.verification_documents
  for each row execute function private.set_updated_at();

alter table public.verification_documents enable row level security;
revoke all on public.verification_documents from anon, authenticated;

create policy verification_documents_direct_access_denied
on public.verification_documents
for all
to authenticated
using (false)
with check (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'professional-verifications',
  'professional-verifications',
  false,
  3145728,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.record_professional_verification(
  p_user_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_byte_size integer,
  p_sha256_hex text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document_id uuid;
  v_previous_status text;
begin
  select p.verification_status
    into v_previous_status
    from public.profiles p
   where p.id = p_user_id
     and p.status = 'pending'
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PENDING_PROFILE_REQUIRED';
  end if;

  if not (p_storage_path like (p_user_id::text || '/%')) then
    raise exception using errcode = 'P0001', message = 'VERIFICATION_PATH_INVALID';
  end if;

  insert into public.verification_documents (
    user_id, storage_path, original_filename, mime_type, byte_size, sha256_hex
  ) values (
    p_user_id, p_storage_path, p_original_filename, p_mime_type, p_byte_size, p_sha256_hex
  )
  returning id into v_document_id;

  update public.profiles
     set verification_status = 'submitted',
         verification_submitted_at = now(),
         verification_reviewed_at = null,
         updated_at = now()
   where id = p_user_id;

  insert into public.audit_logs (
    entity_type, entity_id, action, old_data, new_data, changed_by, source, changed_at
  ) values (
    'profile',
    p_user_id,
    'professional_verification_submitted',
    jsonb_build_object('verificationStatus', v_previous_status),
    jsonb_build_object(
      'verificationStatus', 'submitted',
      'documentId', v_document_id,
      'sha256', p_sha256_hex,
      'byteSize', p_byte_size
    ),
    p_user_id::text,
    'professional_verification',
    now()
  );

  return v_document_id;
end;
$$;

create or replace function public.review_medindex_registration(
  p_actor_id uuid,
  p_target_id uuid,
  p_role text,
  p_status text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
  v_document public.verification_documents%rowtype;
  v_storage_id uuid;
  v_verification_status text;
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = p_actor_id and p.role = 'admin' and p.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_ADMIN_REQUIRED';
  end if;

  if p_role not in ('doctor', 'admin') then
    raise exception using errcode = 'P0001', message = 'ROLE_INVALID';
  end if;
  if p_status not in ('pending', 'active', 'suspended', 'disabled') then
    raise exception using errcode = 'P0001', message = 'STATUS_INVALID';
  end if;
  if p_rejection_reason is not null and char_length(p_rejection_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'REJECTION_REASON_TOO_LONG';
  end if;

  select * into v_target
    from public.profiles p
   where p.id = p_target_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'USER_NOT_FOUND';
  end if;

  if v_target.id = p_actor_id
     and v_target.role = 'admin'
     and (p_role <> 'admin' or p_status <> 'active') then
    raise exception using errcode = 'P0001', message = 'SELF_DEMOTION_BLOCKED';
  end if;

  if v_target.role = 'admin'
     and (p_role <> 'admin' or p_status <> 'active')
     and (select count(*) from public.profiles p where p.role = 'admin' and p.status = 'active') <= 1 then
    raise exception using errcode = 'P0001', message = 'LAST_ADMIN_BLOCKED';
  end if;

  v_verification_status := v_target.verification_status;

  if v_target.status = 'pending' and p_status = 'active' then
    select * into v_document
      from public.verification_documents d
     where d.user_id = p_target_id
       and d.status in ('uploaded', 'approved')
     order by d.created_at desc
     limit 1
     for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'PROFESSIONAL_DOCUMENT_REQUIRED';
    end if;

    update public.verification_documents
       set status = 'approved', rejection_reason = null,
           reviewed_by = p_actor_id, reviewed_at = now(), updated_at = now()
     where id = v_document.id;
    v_verification_status := 'verified';
  elsif v_target.status = 'pending' and p_status = 'disabled' then
    update public.verification_documents
       set status = 'rejected', rejection_reason = nullif(btrim(p_rejection_reason), ''),
           reviewed_by = p_actor_id, reviewed_at = now(), updated_at = now()
     where id = (
       select d.id from public.verification_documents d
        where d.user_id = p_target_id and d.status = 'uploaded'
        order by d.created_at desc limit 1
     );
    v_verification_status := 'rejected';
  end if;

  update public.profiles
     set role = p_role,
         status = p_status,
         verification_status = v_verification_status,
         verification_reviewed_at = case
           when v_target.status = 'pending' and p_status in ('active', 'disabled') then now()
           else verification_reviewed_at
         end,
         updated_at = now()
   where id = p_target_id;

  v_storage_id := coalesce(v_target.legacy_user_id, v_target.id);
  update public.medindex_users
     set enabled = p_status = 'active',
         role = case when p_role = 'admin' then 'editor' else 'user' end,
         updated_at = now()
   where id = v_storage_id;

  insert into public.audit_logs (
    entity_type, entity_id, action, old_data, new_data, changed_by, source, changed_at
  ) values (
    'profile',
    p_target_id,
    'admin_user_review',
    jsonb_build_object(
      'role', v_target.role,
      'status', v_target.status,
      'verificationStatus', v_target.verification_status
    ),
    jsonb_build_object(
      'role', p_role,
      'status', p_status,
      'verificationStatus', v_verification_status
    ),
    p_actor_id::text,
    'admin_users',
    now()
  );

  return jsonb_build_object(
    'id', p_target_id,
    'role', p_role,
    'status', p_status,
    'verificationStatus', v_verification_status
  );
end;
$$;

revoke all on function public.record_professional_verification(uuid, text, text, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.review_medindex_registration(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_professional_verification(uuid, text, text, text, integer, text)
  to service_role;
grant execute on function public.review_medindex_registration(uuid, uuid, text, text, text)
  to service_role;
