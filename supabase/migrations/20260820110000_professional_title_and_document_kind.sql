-- Professional title on the profile, and the document kind that must back it.
--
-- Registration asks who the person is — a medical student, a doctor, a
-- specialist or a resident — and each answer demands a different proof: a
-- student ID, a diploma, or a licence. The pairing is enforced here rather than
-- in the form, so a crafted request cannot register a "specialist" backed by a
-- student ID.

alter table public.profiles
  add column if not exists professional_title text;

alter table public.profiles
  drop constraint if exists profiles_professional_title_check;

alter table public.profiles
  add constraint profiles_professional_title_check
  check (
    professional_title is null
    or professional_title in ('student', 'mjek', 'specialist', 'specializant')
  );

-- A specialist without a named specialty is not identifiable, so the claim is
-- refused. Existing rows predate the question and are left alone.
alter table public.profiles
  drop constraint if exists profiles_specialist_requires_specialty;

alter table public.profiles
  add constraint profiles_specialist_requires_specialty
  check (
    professional_title is distinct from 'specialist'
    or coalesce(btrim(specialty), '') <> ''
  )
  not valid;

alter table public.verification_documents
  add column if not exists document_kind text;

alter table public.verification_documents
  drop constraint if exists verification_documents_kind_check;

alter table public.verification_documents
  add constraint verification_documents_kind_check
  check (
    document_kind is null
    or document_kind in ('id', 'diplome', 'licence')
  );

create or replace function private.required_document_kind(p_title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_title
    when 'student' then 'id'
    when 'mjek' then 'diplome'
    when 'specialist' then 'licence'
    when 'specializant' then 'licence'
    else null
  end;
$$;

revoke all on function private.required_document_kind(text) from public, anon, authenticated;

-- The previous signature took only the file. Registration now arrives with it,
-- so the old one is dropped rather than left reachable with a weaker contract.
drop function if exists public.record_professional_verification(uuid, text, text, text, integer, text);

create or replace function public.record_professional_verification(
  p_user_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_byte_size integer,
  p_sha256_hex text,
  p_full_name text,
  p_professional_title text,
  p_specialty text,
  p_document_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document_id uuid;
  v_previous_status text;
  v_full_name text := nullif(btrim(p_full_name), '');
  v_specialty text := nullif(btrim(p_specialty), '');
  v_required_kind text;
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

  if v_full_name is null or char_length(v_full_name) < 3 or char_length(v_full_name) > 160 then
    raise exception using errcode = 'P0001', message = 'FULL_NAME_REQUIRED';
  end if;

  v_required_kind := private.required_document_kind(p_professional_title);
  if v_required_kind is null then
    raise exception using errcode = 'P0001', message = 'PROFESSIONAL_TITLE_INVALID';
  end if;

  if p_document_kind is distinct from v_required_kind then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_KIND_MISMATCH';
  end if;

  if p_professional_title = 'specialist' and v_specialty is null then
    raise exception using errcode = 'P0001', message = 'SPECIALTY_REQUIRED';
  end if;

  if v_specialty is not null and char_length(v_specialty) > 120 then
    raise exception using errcode = 'P0001', message = 'SPECIALTY_TOO_LONG';
  end if;

  if not (p_storage_path like (p_user_id::text || '/%')) then
    raise exception using errcode = 'P0001', message = 'VERIFICATION_PATH_INVALID';
  end if;

  insert into public.verification_documents (
    user_id, storage_path, original_filename, mime_type, byte_size, sha256_hex, document_kind
  ) values (
    p_user_id, p_storage_path, p_original_filename, p_mime_type, p_byte_size, p_sha256_hex, p_document_kind
  )
  returning id into v_document_id;

  update public.profiles
     set full_name = v_full_name,
         professional_title = p_professional_title,
         -- A resident may name a specialty; only a specialist must. Clearing it
         -- otherwise stops a stale claim from surviving a re-submission.
         specialty = case
           when p_professional_title in ('specialist', 'specializant') then v_specialty
           else null
         end,
         verification_status = 'submitted',
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
      'documentKind', p_document_kind,
      'professionalTitle', p_professional_title,
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

revoke all on function public.record_professional_verification(uuid, text, text, text, integer, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_professional_verification(uuid, text, text, text, integer, text, text, text, text, text)
  to service_role;
